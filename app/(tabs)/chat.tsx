import { Text } from '@/components/ui/text';
import { CheckCheck, Heart, Menu, MessageCircle, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { api } from '@/convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';

import { ApprovalCard } from '@/components/chat/approval-card';
import { ChatBubble, StreamingDots } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { Paywall } from '@/components/paywall';
import { OfflineBanner } from '@/components/shared/offline-banner';
import { ScreenGlow } from '@/components/shared/screen-glow';
import { SettingsHeaderButton } from '@/components/shared/settings-header-button';
import type { Id } from '@/convex/_generated/dataModel';
import {
  useChat,
  useChatConversations,
  useCreateConversation,
  useDeleteConversation,
} from '@/hooks/use-chat';
import { useHealthKit } from '@/hooks/use-healthkit';
import { useNetwork } from '@/hooks/use-network';
import { capture } from '@/lib/analytics';
import { HEALTHKIT_READ_SCOPES } from '@/lib/healthkit';
import { useSubscriptionStore } from '@/stores/subscription-store';

export default function ChatScreen() {
  const { isOffline } = useNetwork();
  const subscription = useQuery(api.subscriptions.getStatus);
  const cachedIsPro = useSubscriptionStore((s) => s.isPro);

  // Prefer authoritative server state when available; fall back to cached
  // state while the server query is still loading (undefined).
  const isActive = subscription ? subscription.isActive : cachedIsPro;

  const insets = useSafeAreaInsets();

  if (!isOffline && subscription === undefined && !cachedIsPro) {
    return <View className="flex-1 bg-background" style={{ paddingTop: insets.top }} />;
  }

  if (!isActive && !__DEV__) {
    return <Paywall />;
  }

  return <ChatScreenContent />;
}

function ChatScreenContent() {
  const insets = useSafeAreaInsets();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const conversations = useChatConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();

  const activeConversation = conversations.find(
    (c) => c.clientId === activeConversationId
  );

  const pendingMessageRef = useRef<{
    conversationId: string;
    content: string;
  } | null>(null);

  const handleNewChat = useCallback(async () => {
    const clientId = await createConversation();
    setActiveConversationId(clientId);
  }, [createConversation]);

  const handleSendFromEmpty = useCallback(
    async (content: string) => {
      capture({ name: 'ai_coach_message_sent', props: {} });
      const clientId = await createConversation();
      pendingMessageRef.current = { conversationId: clientId, content };
      setActiveConversationId(clientId);
    },
    [createConversation]
  );

  const handleDeleteConversation = useCallback(
    (clientId: string) => {
      deleteConversation({ clientId });
      if (activeConversationId === clientId) {
        setActiveConversationId(null);
      }
    },
    [deleteConversation, activeConversationId]
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={-20}
    >
      <ScreenGlow />
      <OfflineBanner />

      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable onPress={() => setSidebarOpen(true)} className="p-1">
          <Icon as={Menu} size={24} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
          {activeConversation?.title ?? 'Chat'}
        </Text>
        <View className="flex-row items-center gap-1">
          <Pressable onPress={handleNewChat} className="p-1">
            <Icon as={Plus} size={24} className="text-foreground" />
          </Pressable>
          <SettingsHeaderButton />
        </View>
      </View>

      {/* Chat content */}
      {activeConversationId ? (
        <ActiveChatView
          key={activeConversationId}
          conversationId={activeConversationId}
          flatListRef={flatListRef}
          pendingMessageRef={pendingMessageRef}
        />
      ) : (
        <EmptyChatView
          onSend={handleSendFromEmpty}
        />
      )}

      {/* Sidebar overlay */}
      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
      />
    </KeyboardAvoidingView>
  );
}

// ---------- Active Chat View ----------

function ActiveChatView({
  conversationId,
  flatListRef,
  pendingMessageRef,
}: {
  conversationId: string;
  flatListRef: React.RefObject<FlatList | null>;
  pendingMessageRef: React.MutableRefObject<{
    conversationId: string;
    content: string;
  } | null>;
}) {
  const { isOffline } = useNetwork();
  const { messages, sendMessage, isSending, isStreaming } = useChat(conversationId);
  const handleSend = useCallback(
    async (content: string) => {
      capture({ name: 'ai_coach_message_sent', props: {} });
      await sendMessage(content);
    },
    [sendMessage]
  );
  const approveAction = useMutation(api.chat.approveAction);
  const executeApproval = useMutation(api.aiTools.executeApproval);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const lastMessageContent = messages[messages.length - 1]?.content;

  // Handle pending message from empty-state send
  useEffect(() => {
    const pending = pendingMessageRef.current;
    if (pending && pending.conversationId === conversationId) {
      pendingMessageRef.current = null;
      sendMessage(pending.content);
    }
  }, [conversationId, pendingMessageRef, sendMessage]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [flatListRef, lastMessageContent, messages.length]);

  // Find all messages with pending approvals
  const pendingApprovals = useMemo(
    () =>
      messages.filter(
        (m) => m.pendingApproval && m.pendingApproval.status === 'pending'
      ),
    [messages]
  );

  const handleApproveAll = useCallback(async () => {
    if (pendingApprovals.length === 0) return;
    setIsApprovingAll(true);
    try {
      for (const msg of pendingApprovals) {
        await approveAction({ messageId: msg._id as Id<"chatMessages"> });
        await executeApproval({
          type: msg.pendingApproval!.type,
          payload: msg.pendingApproval!.payload,
          conversationClientId: conversationId,
        });
      }
    } finally {
      setIsApprovingAll(false);
    }
  }, [pendingApprovals, approveAction, executeApproval, conversationId]);

  return (
    <View className="flex-1">
      <FlatList
        ref={flatListRef}
        className="flex-1"
        data={messages}
        keyExtractor={(item) => item._id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 py-4 gap-3"
        renderItem={({ item }) => (
          <View>
            <ChatBubble
              role={item.role as 'user' | 'assistant'}
              content={item.content}
              isStreaming={item.status === 'streaming'}
              isError={item.status === 'error'}
            />
            {item.pendingApproval && (
              <View className={item.content ? 'mt-2' : ''}>
                <ApprovalCard
                  messageId={item._id}
                  approval={item.pendingApproval}
                  conversationClientId={conversationId}
                />
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-muted-foreground">
              Ask me anything about fitness!
            </Text>
          </View>
        }
        ListFooterComponent={
          isSending && !isStreaming ? (
            <View className="mt-3 max-w-[85%] self-start rounded-2xl border border-border bg-card px-4 py-3">
              <StreamingDots />
            </View>
          ) : null
        }
      />

      {/* Approve All banner */}
      {pendingApprovals.length >= 1 && (
        <View className="border-t border-border bg-card px-4 py-2">
          <Pressable
            onPress={handleApproveAll}
            disabled={isApprovingAll}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-green-600 py-3"
          >
            {isApprovingAll ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Icon as={CheckCheck} size={18} className="text-white" />
                <Text className="font-semibold text-white">
                  {pendingApprovals.length === 1 ? 'Approve' : `Approve All (${pendingApprovals.length})`}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <ChatInput onSend={handleSend} disabled={isSending || isStreaming || isOffline} />
    </View>
  );
}

// ---------- Empty Chat View ----------

function EmptyChatView({
  onSend,
}: {
  onSend: (content: string) => void;
}) {
  const { isOffline } = useNetwork();
  const showHealthPrompt = useHealthKitChatPrompt();

  return (
    <>
      <Pressable className="flex-1 items-center justify-center px-8" onPress={Keyboard.dismiss}>
        {showHealthPrompt ? (
          <HealthKitChatPrompt />
        ) : (
          <View className="items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Icon as={MessageCircle} size={32} className="text-primary" />
            </View>
            <Text className="text-xl font-bold mb-2">Your AI Fitness Coach</Text>
            <Text className="text-sm text-muted-foreground text-center leading-5">
              {isOffline
                ? 'AI Coach requires an internet connection. Connect to the internet to chat with your coach.'
                : 'Ask me to create workout templates, build training plans, suggest meals, or answer any fitness question.'}
            </Text>
          </View>
        )}
      </Pressable>
      <ChatInput onSend={onSend} disabled={isOffline} />
    </>
  );
}

// Returns true while the chat empty state should pitch HealthKit. Gates on iOS,
// availability, `notDetermined` status (Apple won't re-prompt after deny — we
// fall back to the default copy in that case), and a session-local dismissal.
function useHealthKitChatPrompt(): boolean {
  const { isAvailable, getAuthorizationStatus } = useHealthKit();
  const [status, setStatus] = useState<'loading' | 'show' | 'hide'>('loading');

  useEffect(() => {
    if (!isAvailable) {
      setStatus('hide');
      return;
    }
    let cancelled = false;
    (async () => {
      const authStatus = await getAuthorizationStatus();
      if (cancelled) return;
      setStatus(authStatus === 'notDetermined' ? 'show' : 'hide');
    })();
    return () => {
      cancelled = true;
    };
  }, [isAvailable, getAuthorizationStatus]);

  return status === 'show';
}

function HealthKitChatPrompt() {
  const { enable, getAuthorizationStatus, getLatestStats } = useHealthKit();
  const updateHealthStats = useMutation(api.onboarding.updateHealthStats);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    capture({ name: 'healthkit_chat_prompt_shown', props: {} });
  }, []);

  const handleGrant = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      const status = await getAuthorizationStatus();
      if (status === 'sharingDenied') {
        await Linking.openSettings();
        return;
      }

      await enable();
      const afterStatus = await getAuthorizationStatus();
      if (afterStatus === 'sharingDenied') {
        await Linking.openSettings();
        return;
      }

      capture({ name: 'healthkit_chat_prompt_granted', props: {} });
      capture({
        name: 'healthkit_granted',
        props: { grantedScopes: [...HEALTHKIT_READ_SCOPES] },
      });

      const stats = await getLatestStats();
      const hasAny =
        stats.weightKg != null ||
        stats.heightCm != null ||
        stats.bodyFatPercent != null;
      if (!hasAny) {
        setDismissed(true);
        return;
      }

      try {
        await updateHealthStats({
          weightKg: stats.weightKg ?? undefined,
          heightCm: stats.heightCm ?? undefined,
          bodyFatPercent: stats.bodyFatPercent ?? undefined,
          dataSource: 'mixed',
        });
      } catch (error) {
        // Profile may not exist yet for users who skipped onboarding stats.
        console.warn('[healthkit-chat-prompt] updateHealthStats failed', error);
      }
      setDismissed(true);
    } catch (error) {
      console.warn('[healthkit-chat-prompt] grant failed', error);
    } finally {
      setPending(false);
    }
  }, [enable, getAuthorizationStatus, getLatestStats, pending, updateHealthStats]);

  const handleDismiss = useCallback(() => {
    capture({ name: 'healthkit_chat_prompt_dismissed', props: {} });
    setDismissed(true);
  }, []);

  if (dismissed) {
    return (
      <View className="items-center">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Icon as={MessageCircle} size={32} className="text-primary" />
        </View>
        <Text className="text-xl font-bold mb-2">Your AI Fitness Coach</Text>
        <Text className="text-sm text-muted-foreground text-center leading-5">
          Ask me to create workout templates, build training plans, suggest meals, or answer any fitness question.
        </Text>
      </View>
    );
  }

  return (
    <View className="items-center" testID="healthkit-chat-prompt">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Icon as={Heart} size={32} className="text-primary" />
      </View>
      <Text className="text-xl font-bold mb-2 text-center">Connect Apple Health</Text>
      <Text className="text-sm text-muted-foreground text-center leading-5 mb-6">
        Your AI coach builds more accurate workouts when it knows your weight, height, and body composition. We don&apos;t read sleep, heart rate, or workout history.
      </Text>
      <Button
        size="onboarding"
        onPress={handleGrant}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel="Connect Apple Health"
        testID="healthkit-chat-prompt-grant"
      >
        {pending ? <ActivityIndicator color="white" /> : <Text>Connect Apple Health</Text>}
      </Button>
      <Pressable
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Skip Apple Health for now"
        hitSlop={10}
        className="mt-4 px-4 py-2"
        testID="healthkit-chat-prompt-skip"
      >
        <Text className="text-sm text-muted-foreground">Maybe later</Text>
      </Pressable>
    </View>
  );
}

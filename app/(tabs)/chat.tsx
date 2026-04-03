import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, Plus, MessageCircle, CheckCheck } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

import {
  useChat,
  useChatConversations,
  useCreateConversation,
  useDeleteConversation,
} from '@/hooks/use-chat';
import { ChatBubble, StreamingDots } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ApprovalCard } from '@/components/chat/approval-card';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { SettingsHeaderButton } from '@/components/shared/settings-header-button';
import { OfflineBanner } from '@/components/shared/offline-banner';
import { Paywall } from '@/components/paywall';
import { useNetwork } from '@/hooks/use-network';
import { useSubscriptionStore } from '@/stores/subscription-store';
import type { Id } from '@/convex/_generated/dataModel';

export default function ChatScreen() {
  const { isOffline } = useNetwork();
  const subscription = useQuery(api.subscriptions.getStatus);
  const cachedIsPro = useSubscriptionStore((s) => s.isPro);

  // Prefer authoritative server state when available; fall back to cached
  // state while the server query is still loading (undefined).
  const isActive = subscription ? subscription.isActive : cachedIsPro;

  if (!isOffline && subscription === undefined && !cachedIsPro) {
    return <SafeAreaView className="flex-1 bg-background" edges={['top']} />;
  }

  if (!isActive) {
    return <Paywall />;
  }

  return <ChatScreenContent />;
}

function ChatScreenContent() {
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
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
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
    </SafeAreaView>
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

      <ChatInput onSend={sendMessage} disabled={isSending || isStreaming || isOffline} />
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

  return (
    <>
      <View className="flex-1 items-center justify-center px-8">
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
      </View>
      <ChatInput onSend={onSend} disabled={isOffline} />
    </>
  );
}

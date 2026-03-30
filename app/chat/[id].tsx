import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { View, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, CheckCheck } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useChat } from '@/hooks/use-chat';
import { useNetwork } from '@/hooks/use-network';
import { ChatBubble, StreamingDots } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ApprovalCard } from '@/components/chat/approval-card';
import { OfflineBanner } from '@/components/shared/offline-banner';
import type { Id } from '@/convex/_generated/dataModel';

export default function ChatConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const { isOffline } = useNetwork();
  const flatListRef = useRef<FlatList>(null);

  const conversations = useQuery(api.chat.listConversations) ?? [];
  const conversation = conversations.find((c) => c.clientId === id);
  const { messages, sendMessage, isSending, isStreaming } = useChat(id);
  const approveAction = useMutation(api.chat.approveAction);
  const executeApproval = useMutation(api.aiTools.executeApproval);
  const [isApprovingAll, setIsApprovingAll] = useState(false);

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
    const failed: string[] = [];
    try {
      for (const msg of pendingApprovals) {
        try {
          // Execute resource creation first, then mark as approved only on success
          await executeApproval({
            type: msg.pendingApproval!.type,
            payload: msg.pendingApproval!.payload,
            conversationClientId: id,
          });
          await approveAction({ messageId: msg._id as Id<"chatMessages"> });
        } catch (error) {
          console.error('Approval failed for message:', msg._id, error);
          failed.push(msg.pendingApproval!.type);
        }
      }
      if (failed.length > 0) {
        Alert.alert(
          'Some Approvals Failed',
          `${failed.length} of ${pendingApprovals.length} approval(s) failed: ${failed.join(', ')}. Please try again for the remaining items.`,
        );
      }
    } finally {
      setIsApprovingAll(false);
    }
  }, [pendingApprovals, approveAction, executeApproval, id]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <OfflineBanner />

      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-border px-4 pb-3 pt-2">
        <Pressable onPress={() => router.back()} className="p-1">
          <ChevronLeft
            size={24}
            color={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        </Pressable>
        <Text className="flex-1 text-lg font-semibold" numberOfLines={1}>
          {conversation?.title ?? 'Chat'}
        </Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        className="flex-1"
        data={messages}
        keyExtractor={(item) => item._id}
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
                  conversationClientId={id}
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
                <CheckCheck size={18} color="#fff" />
                <Text className="font-semibold text-white">
                  {pendingApprovals.length === 1 ? 'Approve' : `Approve All (${pendingApprovals.length})`}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isSending || isStreaming || isOffline} />
    </SafeAreaView>
  );
}

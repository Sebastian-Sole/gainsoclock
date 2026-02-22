import React, { useRef, useEffect } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useChat } from '@/hooks/use-chat';
import { ChatBubble, StreamingDots } from '@/components/chat/chat-bubble';
import { ChatInput } from '@/components/chat/chat-input';
import { ApprovalCard } from '@/components/chat/approval-card';

export default function ChatConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const flatListRef = useRef<FlatList>(null);

  const conversations = useQuery(api.chat.listConversations) ?? [];
  const conversation = conversations.find((c) => c.clientId === id);
  const { messages, sendMessage, isSending, isStreaming } = useChat(id);

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
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerClassName="px-4 py-4 gap-3"
        renderItem={({ item }) => (
          <View>
            <ChatBubble
              role={item.role as 'user' | 'assistant'}
              content={item.content}
              isStreaming={item.status === 'streaming'}
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

      {/* Input */}
      <ChatInput onSend={sendMessage} disabled={isSending || isStreaming} />
    </SafeAreaView>
  );
}

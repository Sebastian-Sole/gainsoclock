import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, Plus, MessageCircle } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { Paywall } from '@/components/paywall';

export default function ChatScreen() {
  const subscription = useQuery(api.subscriptions.getStatus);

  if (subscription === undefined) {
    return <SafeAreaView className="flex-1 bg-background" edges={['top']} />;
  }

  if (!subscription.isActive) {
    return <Paywall />;
  }

  return <ChatScreenContent />;
}

function ChatScreenContent() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const iconColor = colorScheme === 'dark' ? '#fff' : '#000';

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
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable onPress={() => setSidebarOpen(true)} className="p-1">
          <Menu size={24} color={iconColor} />
        </Pressable>
        <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
          {activeConversation?.title ?? 'Chat'}
        </Text>
        <Pressable onPress={handleNewChat} className="p-1">
          <Plus size={24} color={iconColor} />
        </Pressable>
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
          primaryColor={primaryColor}
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
  const { messages, sendMessage, isSending, isStreaming } = useChat(conversationId);
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

  return (
    <>
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
      <ChatInput onSend={sendMessage} disabled={isSending || isStreaming} />
    </>
  );
}

// ---------- Empty Chat View ----------

function EmptyChatView({
  primaryColor,
  onSend,
}: {
  primaryColor: string;
  onSend: (content: string) => void;
}) {
  return (
    <>
      <View className="flex-1 items-center justify-center px-8">
        <View className="items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MessageCircle size={32} color={primaryColor} />
          </View>
          <Text className="text-xl font-bold mb-2">Your AI Fitness Coach</Text>
          <Text className="text-sm text-muted-foreground text-center leading-5">
            Ask me to create workout templates, build training plans, suggest
            meals, or answer any fitness question.
          </Text>
        </View>
      </View>
      <ChatInput onSend={onSend} />
    </>
  );
}

import React from 'react';
import { FlatList, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useColorScheme } from 'nativewind';
import { MessageCircle } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useChatConversations, useCreateConversation, useDeleteConversation } from '@/hooks/use-chat';
import { ChatListItem } from './chat-list-item';
import { Fab } from '@/components/shared/fab';

export function ChatList() {
  const conversations = useChatConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const handleNewChat = async () => {
    const clientId = await createConversation();
    router.push(`/chat/${clientId}`);
  };

  const handleDelete = (clientId: string, title: string) => {
    Alert.alert('Delete Chat', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteConversation({ clientId }),
      },
    ]);
  };

  if (conversations.length === 0) {
    return (
      <View className="flex-1">
        <View className="flex-1 items-center justify-center px-4">
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-12">
            <MessageCircle size={32} color={primaryColor} />
            <Text className="mt-3 text-center text-muted-foreground">
              Start a conversation with your AI fitness coach
            </Text>
          </View>
        </View>
        <Fab onPress={handleNewChat} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.clientId}
        contentContainerClassName="px-4 pb-24 gap-2"
        renderItem={({ item }) => (
          <ChatListItem
            title={item.title}
            updatedAt={item.updatedAt}
            onPress={() => router.push(`/chat/${item.clientId}`)}
            onLongPress={() => handleDelete(item.clientId, item.title)}
          />
        )}
      />
      <Fab onPress={handleNewChat} />
    </View>
  );
}

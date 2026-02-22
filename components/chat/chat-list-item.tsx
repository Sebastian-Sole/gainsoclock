import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { MessageCircle } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { formatDistanceToNow } from 'date-fns';

interface ChatListItemProps {
  title: string;
  updatedAt: string;
  onPress: () => void;
  onLongPress?: () => void;
}

export function ChatListItem({ title, updatedAt, onPress, onLongPress }: ChatListItemProps) {
  const { colorScheme } = useColorScheme();
  const mutedColor = colorScheme === 'dark' ? '#9ca3af' : '#6b7280';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <MessageCircle
          size={20}
          color={Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint}
        />
      </View>
      <View className="flex-1">
        <Text className="font-semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
        </Text>
      </View>
    </Pressable>
  );
}

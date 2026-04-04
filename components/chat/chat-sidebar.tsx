import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Pressable, StyleSheet, Alert, Animated, Easing } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

const SIDEBAR_WIDTH = 300;

interface Conversation {
  clientId: string;
  title: string;
  updatedAt: string;
}

interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (clientId: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (clientId: string, title: string) => void;
}

export function ChatSidebar({
  open,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: ChatSidebarProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setVisible(true);
    }
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) {
        setVisible(false);
      }
    });
  }, [open]);

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const panelTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-SIDEBAR_WIDTH, 0],
  });

  const handleDelete = (clientId: string, title: string) => {
    Alert.alert('Delete Chat', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeleteConversation(clientId, title),
      },
    ]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View className="flex-1 bg-black/50" />
        </Pressable>
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          {
            transform: [{ translateX: panelTranslateX }],
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: SIDEBAR_WIDTH,
          },
        ]}
        className="bg-background border-r border-border"
      >
        {/* New Chat button */}
        <View className="px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
          <Pressable
            onPress={() => {
              onNewChat();
              onClose();
            }}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Icon as={Plus} size={18} className="text-primary" />
            <Text className="font-semibold">New Chat</Text>
          </Pressable>
        </View>

        {/* Conversation list */}
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.clientId}
          contentContainerClassName="px-3 pb-4 gap-1"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelectConversation(item.clientId);
                onClose();
              }}
              className={`flex-row items-center rounded-lg px-3 py-2.5 ${
                item.clientId === activeConversationId
                  ? 'bg-primary/10'
                  : ''
              }`}
            >
              <View className="flex-1 mr-2">
                <Text className="text-sm font-medium" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                  {new Date(item.updatedAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable
                onPress={() => handleDelete(item.clientId, item.title)}
                hitSlop={8}
                className="p-1.5 rounded-md active:bg-destructive/10"
              >
                <Icon as={Trash2} size={16} className="text-destructive" />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            <View className="px-4 py-8">
              <Text className="text-sm text-muted-foreground text-center">
                No conversations yet
              </Text>
            </View>
          }
        />

        {/* Bottom safe area spacing */}
        <View style={{ height: insets.bottom + 8 }} />
      </Animated.View>
    </View>
  );
}

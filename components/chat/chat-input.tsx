import React, { useState } from 'react';
import { View, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import { Send } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View className="flex-row items-end gap-2 border-t border-border bg-background px-4 pb-8 pt-3">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask your fitness coach..."
          placeholderTextColor={colorScheme === 'dark' ? '#6b7280' : '#9ca3af'}
          multiline
          maxLength={2000}
          className="max-h-24 min-h-[44px] flex-1 rounded-2xl border border-input bg-card px-4 py-3 text-[15px] text-foreground"
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          className="mb-0.5 h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: canSend ? primaryColor : 'transparent' }}
        >
          <Send
            size={20}
            color={canSend ? '#fff' : colorScheme === 'dark' ? '#4b5563' : '#d1d5db'}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

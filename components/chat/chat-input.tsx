import React, { useRef, useState } from 'react';
import { View, TextInput, Pressable, Alert } from 'react-native';
import { Send, Mic } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { lightHaptic, warningHaptic } from '@/lib/haptics';

const MAX_LENGTH = 2000;

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;
  const canSend = text.trim().length > 0 && !disabled;

  // Snapshot of the field when dictation starts, so interim transcripts append
  // to what the user already typed instead of overwriting it.
  const dictationBaseRef = useRef('');

  const {
    available: speechAvailable,
    listening,
    start,
    stop,
  } = useSpeechRecognition({
    onResult: (transcript) => {
      const base = dictationBaseRef.current;
      setText((base ? `${base} ${transcript}` : transcript).slice(0, MAX_LENGTH));
    },
    onError: (code) => {
      if (code === 'not-allowed') {
        Alert.alert(
          'Microphone access needed',
          'Enable microphone and speech recognition for Fitbull in Settings to dictate messages.'
        );
      }
      warningHaptic();
    },
  });

  const handleSend = () => {
    if (!canSend) return;
    if (listening) stop();
    onSend(text);
    setText('');
  };

  const handleMicPress = () => {
    lightHaptic();
    if (listening) {
      stop();
      return;
    }
    dictationBaseRef.current = text.trim();
    start();
  };

  return (
    <View
      className="flex-row items-end gap-2 border-t border-border bg-background px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Ask your fitness coach..."
        placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
        multiline
        maxLength={MAX_LENGTH}
        className="max-h-24 min-h-[44px] flex-1 rounded-2xl border border-input bg-card px-4 py-3 text-[15px] text-foreground"
        editable={!disabled}
        onSubmitEditing={handleSend}
        blurOnSubmit={false}
        autoFocus={false}
      />
      {speechAvailable && (
        <Pressable
          onPress={handleMicPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop dictation' : 'Dictate message'}
          accessibilityState={{ disabled: !!disabled, selected: listening }}
          className="mb-0.5 h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: listening ? '#ef4444' : 'transparent' }}
        >
          <Mic size={20} color={listening ? '#fff' : isDark ? '#9ca3af' : '#6b7280'} />
        </Pressable>
      )}
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        className="mb-0.5 h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: canSend ? primaryColor : 'transparent' }}
      >
        <Send
          size={20}
          color={canSend ? '#fff' : isDark ? '#4b5563' : '#d1d5db'}
          fill={canSend ? '#fff' : 'none'}
        />
      </Pressable>
    </View>
  );
}

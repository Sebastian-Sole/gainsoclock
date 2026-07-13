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
  // The field is UNCONTROLLED while the user types: passing `value` back on
  // every keystroke races iOS auto-capitalization when a render lags a
  // keystroke, and the keyboard then shifts the wrong character ("hELLO").
  // Native owns the text; we mirror it in a ref and only take control
  // (`dictationText`) for programmatic writes from dictation, releasing it on
  // the next keystroke or send.
  const inputRef = useRef<TextInput>(null);
  const textRef = useRef('');
  const [hasText, setHasText] = useState(false);
  const [dictationText, setDictationText] = useState<string | undefined>(undefined);
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const palette = Colors[isDark ? 'dark' : 'light'];
  const primaryColor = palette.tint;
  const canSend = hasText && !disabled;

  // Snapshot of the field when dictation starts, so interim transcripts append
  // to what the user already typed instead of overwriting it.
  const dictationBaseRef = useRef('');

  const handleChangeText = (t: string) => {
    textRef.current = t;
    setHasText(t.trim().length > 0);
    // A manual keystroke hands ownership back to the native field.
    if (dictationText !== undefined) setDictationText(undefined);
  };

  const {
    available: speechAvailable,
    listening,
    start,
    stop,
    abort,
  } = useSpeechRecognition({
    // `transcript` is the composed transcript of the whole dictation session
    // (the hook accumulates finalized segments), so appending it to the
    // mic-press snapshot always yields the full message.
    onResult: (transcript) => {
      const base = dictationBaseRef.current;
      const full = (base ? `${base} ${transcript}` : transcript).slice(0, MAX_LENGTH);
      textRef.current = full;
      setHasText(full.trim().length > 0);
      setDictationText(full);
    },
    onError: (code) => {
      if (code === 'not-allowed') {
        Alert.alert(
          'Microphone access needed',
          'Enable microphone and speech recognition for Fitbull in Settings to dictate messages.'
        );
      }
      // 'no-speech' (user just paused) and 'aborted' (user stopped/sent) are
      // normal outcomes, not failures — no error buzz for those.
      if (code !== 'no-speech' && code !== 'aborted') warningHaptic();
    },
  });

  const handleSend = () => {
    if (!canSend) return;
    // Abort (not stop): stop() delivers a late final result that would
    // repopulate the input after the clear below.
    if (listening) abort();
    dictationBaseRef.current = '';
    onSend(textRef.current);
    textRef.current = '';
    setHasText(false);
    setDictationText(undefined);
    inputRef.current?.clear();
  };

  const handleMicPress = () => {
    lightHaptic();
    if (listening) {
      stop();
      return;
    }
    dictationBaseRef.current = textRef.current.trim();
    start();
  };

  return (
    <View
      className="flex-row items-end gap-2 border-t border-border bg-background px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <TextInput
        ref={inputRef}
        value={dictationText}
        onChangeText={handleChangeText}
        placeholder="Ask your fitness coach..."
        placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
        multiline
        maxLength={MAX_LENGTH}
        className="max-h-24 min-h-[44px] flex-1 rounded-2xl border border-input bg-card px-4 py-3 text-[15px] text-foreground"
        editable={!disabled}
        onSubmitEditing={handleSend}
        blurOnSubmit={false}
        autoFocus={false}
        accessibilityLabel="Message your fitness coach"
        testID="chat-composer-input"
      />
      {speechAvailable && (
        <Pressable
          onPress={handleMicPress}
          // Stay tappable while listening even if the input is disabled
          // (assistant responding) — the user must always be able to stop
          // the recording.
          disabled={disabled && !listening}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop dictation' : 'Dictate message'}
          accessibilityState={{ disabled: !!disabled && !listening, selected: listening }}
          className="mb-0.5 h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: listening ? palette.destructive : 'transparent' }}
        >
          <Mic
            size={20}
            color={listening ? palette.destructiveForeground : isDark ? '#9ca3af' : '#6b7280'}
          />
        </Pressable>
      )}
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
        testID="chat-send"
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

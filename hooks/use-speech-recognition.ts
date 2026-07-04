import { useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export interface UseSpeechRecognitionOptions {
  /** Fired on every transcript update (interim while speaking, then final). */
  onResult?: (transcript: string, isFinal: boolean) => void;
  /** Fired on failure or when permission is denied (`code === "not-allowed"`). */
  onError?: (code: string) => void;
}

export interface SpeechRecognition {
  /** Whether dictation is usable on this platform/build. */
  available: boolean;
  /** True while actively listening. */
  listening: boolean;
  /** Request permission (if needed) and begin listening. */
  start: () => Promise<void>;
  /** Stop listening; the last transcript is retained by the caller. */
  stop: () => void;
}

/**
 * Thin wrapper around `expo-speech-recognition` so components never import the
 * native module directly (mirrors the `lib/healthkit.ts` / `hooks/use-purchases.ts`
 * pattern). The `.web.ts` sibling returns `available: false`.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): SpeechRecognition {
  const [listening, setListening] = useState(false);

  // Hold the latest callbacks in refs so the event subscriptions stay stable.
  // Updated in an effect (never during render) to satisfy the React Compiler.
  const onResultRef = useRef(options.onResult);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onResultRef.current = options.onResult;
    onErrorRef.current = options.onError;
  });

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) onResultRef.current?.(transcript, event.isFinal);
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    onErrorRef.current?.(event.error ?? 'unknown');
  });

  const start = async () => {
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        onErrorRef.current?.('not-allowed');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        iosTaskHint: 'dictation',
      });
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : 'unknown');
    }
  };

  const stop = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  return { available: true, listening, start, stop };
}

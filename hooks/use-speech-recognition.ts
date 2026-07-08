import { useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export interface UseSpeechRecognitionOptions {
  /**
   * Fired on every transcript update with the COMPOSED transcript of the
   * whole dictation session (all finalized segments plus the current interim
   * one) — in continuous mode the library delivers each segment separately,
   * so accumulation happens here, not in the caller.
   */
  onResult?: (transcript: string, isFinal: boolean) => void;
  /** Fired on failure or when permission is denied (`code === "not-allowed"`). */
  onError?: (code: string) => void;
}

export interface SpeechRecognition {
  /** Whether dictation is usable on this platform/build/device. */
  available: boolean;
  /** True while actively listening. */
  listening: boolean;
  /** Request permission (if needed) and begin listening. */
  start: () => Promise<void>;
  /** Stop listening; a final result is still delivered. */
  stop: () => void;
  /** Cancel immediately without a final result (e.g. when sending). */
  abort: () => void;
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
  // Some Android devices ship without speech services; simulators often lack
  // them too. Checked once — recognition availability doesn't change mid-run.
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
  }, []);

  // Hold the latest callbacks in refs so the event subscriptions stay stable.
  // Updated in an effect (never during render) to satisfy the React Compiler.
  const onResultRef = useRef(options.onResult);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onResultRef.current = options.onResult;
    onErrorRef.current = options.onError;
  });

  // Finalized segments accumulated since start(). In continuous mode each
  // `result` event carries only the current segment's transcript ("final
  // results are new utterances — concatenate with the previous final result"),
  // so without this, everything before the last pause would be lost.
  const finalSegmentsRef = useRef('');
  // `listening` state mirrors, readable synchronously (start guard, unmount
  // cleanup) — state updates arrive too late for both.
  const listeningRef = useRef(false);
  const startingRef = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    startingRef.current = false;
    listeningRef.current = true;
    setListening(true);
  });
  useSpeechRecognitionEvent('end', () => {
    startingRef.current = false;
    listeningRef.current = false;
    setListening(false);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const segment = event.results[0]?.transcript ?? '';
    if (!segment) return;
    const base = finalSegmentsRef.current;
    const composed = base ? `${base} ${segment}` : segment;
    if (event.isFinal) finalSegmentsRef.current = composed;
    onResultRef.current?.(composed, event.isFinal);
  });
  useSpeechRecognitionEvent('error', (event) => {
    startingRef.current = false;
    listeningRef.current = false;
    setListening(false);
    onErrorRef.current?.(event.error ?? 'unknown');
  });

  // Never leave the native mic session running after the owning screen
  // unmounts (navigate away mid-dictation). Only abort if THIS instance is
  // the one listening — recognition is a global native session.
  useEffect(() => {
    return () => {
      if (listeningRef.current || startingRef.current) {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, []);

  const start = async () => {
    // Synchronous guard: `listening` flips only when the async native start
    // event lands, so a fast double-tap would otherwise start twice.
    if (startingRef.current || listeningRef.current) return;
    startingRef.current = true;
    finalSegmentsRef.current = '';
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        startingRef.current = false;
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
      startingRef.current = false;
      onErrorRef.current?.(err instanceof Error ? err.message : 'unknown');
    }
  };

  const stop = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  const abort = () => {
    ExpoSpeechRecognitionModule.abort();
  };

  return { available, listening, start, stop, abort };
}

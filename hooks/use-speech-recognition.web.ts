export interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (code: string) => void;
}

export interface SpeechRecognition {
  available: boolean;
  listening: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Web stub: in-app dictation is native-only for now, so `available: false`
 * makes the chat mic button hide itself. Browsers still offer OS/keyboard
 * dictation into the text field. Keep this signature in sync with the native
 * `use-speech-recognition.ts`.
 */
export function useSpeechRecognition(
  _options: UseSpeechRecognitionOptions = {},
): SpeechRecognition {
  return {
    available: false,
    listening: false,
    start: async () => {},
    stop: () => {},
  };
}

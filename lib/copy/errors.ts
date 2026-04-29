export const ERROR_COPY = {
  NETWORK_SYNC:
    "Couldn't reach Fitbull. We'll retry in the background — your answers are safe.",
  HEALTHKIT_PERMISSION:
    "Apple Health didn't respond. Add your stats manually now and try Health later in Settings.",
  AHA_LLM: "Couldn't reach our AI coach — try again in a moment.",
  PAYWALL_SHEET:
    "Couldn't open the purchase screen. Try again, or skip for now — your plan is waiting.",
} as const;

export type ErrorCopyKey = keyof typeof ERROR_COPY;

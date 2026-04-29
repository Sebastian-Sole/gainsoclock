export const OPENAI_AHA_MODEL = process.env.OPENAI_AHA_MODEL ?? "gpt-5.2";
export const OPENAI_AHA_FALLBACK_MODEL =
  process.env.OPENAI_AHA_FALLBACK_MODEL ?? "gpt-5.2-chat-latest";
// Chat uses the same primary model; fallback ladder shared for consistency.
export const OPENAI_CHAT_MODEL = OPENAI_AHA_MODEL;

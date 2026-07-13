export const OPENAI_AHA_MODEL = process.env.OPENAI_AHA_MODEL ?? "gpt-5.2";
export const OPENAI_AHA_FALLBACK_MODEL =
  process.env.OPENAI_AHA_FALLBACK_MODEL ?? "gpt-5.2-chat-latest";
// Chat uses the same primary model; fallback ladder shared for consistency.
export const OPENAI_CHAT_MODEL = OPENAI_AHA_MODEL;
// Meal-photo analysis needs a vision-capable model (image_url input).
export const OPENAI_VISION_MODEL =
  process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

// Completion budget for chat turns. On reasoning models this budget is shared
// between reasoning tokens and output tokens, and a create_workout_plan tool
// call carries an entire multi-week plan as JSON — 8000 was low enough that
// large plans got truncated mid-arguments (issue #128). 32000 leaves ample
// headroom for an 8-week plan plus reasoning while still capping cost.
const parsedChatMaxTokens = Number(
  process.env.OPENAI_CHAT_MAX_COMPLETION_TOKENS
);
export const OPENAI_CHAT_MAX_COMPLETION_TOKENS =
  Number.isFinite(parsedChatMaxTokens) && parsedChatMaxTokens > 0
    ? parsedChatMaxTokens
    : 32000;

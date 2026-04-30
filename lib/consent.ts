import * as Crypto from "expo-crypto";

export type ConsentPurpose =
  | "health_data_personalization"
  | "ai_coach_inference"
  | "analytics";

export const CONSENT_COPY: Record<ConsentPurpose, string> = {
  health_data_personalization:
    "OK, use my weight, height, and workouts on this device to personalise my coach.",
  ai_coach_inference:
    "OK, send my profile (weight, height, age, training goals) to OpenAI (United States, under Standard Contractual Clauses) so the AI coach can generate my plan.",
  analytics:
    "OK, send anonymous usage analytics to PostHog (Frankfurt, EU) so Fitbull can improve the app.",
};

export async function hashConsentCopy(purpose: ConsentPurpose): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    CONSENT_COPY[purpose],
  );
  return digest.slice(0, 8);
}

export async function computeCombinedHash(): Promise<string> {
  const joined = Object.values(CONSENT_COPY).join("\n");
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    joined,
  );
  return digest.slice(0, 8);
}

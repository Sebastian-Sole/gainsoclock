import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { hashConsentCopy, type ConsentPurpose } from "@/lib/consent";

export type ConsentSnapshot = {
  granted: boolean;
  grantedAt: string;
  version: string;
} | null;

export type ConsentMap = {
  health_data_personalization: ConsentSnapshot;
  ai_coach_inference: ConsentSnapshot;
  analytics: ConsentSnapshot;
};

const EMPTY_CONSENTS: ConsentMap = {
  health_data_personalization: null,
  ai_coach_inference: null,
  analytics: null,
};

export type UseConsentResult = {
  consents: ConsentMap;
  setConsent: (purpose: ConsentPurpose, granted: boolean) => Promise<void>;
  isLoading: boolean;
};

/**
 * Hook for reading and toggling per-purpose consent rows. Backed by the
 * append-only `userConsents` table (Security CR4): every call to `setConsent`
 * inserts a new row, never patches an existing one.
 *
 * Reads through `api.user.getOnboardingStatus` (which already returns the
 * latest-row-per-purpose `ConsentMap`) so the Privacy panel + JIT prompts
 * share a single subscription with the rest of the onboarding-status surface.
 *
 * Writes go through `api.onboarding.setConsent`, which is the lightweight
 * toggle. Heavy GDPR-Art.17 cascades (aha kill, profile erasure, PostHog
 * erasure) live in `api.onboarding.withdrawConsent` and must be invoked
 * separately when a withdrawal needs to trigger them.
 */
export function useConsent(): UseConsentResult {
  const status = useQuery(api.user.getOnboardingStatus);
  const setConsentMutation = useMutation(api.onboarding.setConsent);

  const isLoading = status === undefined;
  const consents: ConsentMap = status?.consents ?? EMPTY_CONSENTS;

  const setConsent = useCallback(
    async (purpose: ConsentPurpose, granted: boolean) => {
      const versionHash = await hashConsentCopy(purpose);
      await setConsentMutation({ purpose, granted, versionHash });
    },
    [setConsentMutation],
  );

  return { consents, setConsent, isLoading };
}

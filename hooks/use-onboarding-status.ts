import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAuthCacheStore } from "@/stores/auth-cache-store";

export type UserProfile = Doc<"userProfile">;

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

export type OnboardingStatus =
  | { status: "loading" }
  | { status: "pending"; profile?: undefined; consents?: undefined }
  | {
      status: "complete";
      profile: UserProfile | null;
      consents: ConsentMap | null;
    };

export function useOnboardingStatus(): OnboardingStatus {
  const serverStatus = useQuery(api.user.getOnboardingStatus);
  const cachedCompleted = useAuthCacheStore((s) => s.hasCompletedOnboarding);

  // Write-through: when the server confirms completion, hold truth in the
  // offline cache so cold-boot with no network doesn't flip back to pending.
  useEffect(() => {
    if (serverStatus?.hasCompletedOnboarding === true && !cachedCompleted) {
      useAuthCacheStore.getState().setHasCompletedOnboarding(true);
    }
  }, [serverStatus?.hasCompletedOnboarding, cachedCompleted]);

  // Server undecided (Convex still resolving, or unreachable on this
  // network) → trust the persisted cache instead of blocking. The query
  // continues in the background and the live answer takes over the moment
  // it arrives.
  if (serverStatus === undefined) {
    return cachedCompleted
      ? { status: "complete", profile: null, consents: null }
      : { status: "pending" };
  }

  if (serverStatus === null) {
    return { status: "pending" };
  }

  if (!serverStatus.hasCompletedOnboarding) {
    return { status: "pending" };
  }

  return {
    status: "complete",
    profile: serverStatus.profile ?? null,
    consents: serverStatus.consents ?? null,
  };
}

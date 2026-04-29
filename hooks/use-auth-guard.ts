import { useConvexAuth, useMutation } from "convex/react";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { useNetwork } from "@/hooks/use-network";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { useAuthCacheStore } from "@/stores/auth-cache-store";

export function useAuthGuard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isOffline } = useNetwork();
  const markOnboardingPendingIfUnset = useMutation(
    api.user.markOnboardingPendingIfUnset
  );
  const onboarding = useOnboardingStatus();
  const segments = useSegments();
  const router = useRouter();

  const cachedAuth = useAuthCacheStore((s) => s.wasAuthenticated);
  const cacheAuthState = useAuthCacheStore((s) => s.cacheAuthState);

  // Offline + convex auth still resolving → fall back to cached auth.
  const effectiveAuthenticated =
    isLoading && isOffline ? cachedAuth : isAuthenticated;
  const effectiveAuthLoading = isOffline ? false : isLoading;

  const onboardingLoading = onboarding.status === "loading";
  const hasCompletedOnboarding = onboarding.status === "complete";

  // Cache a definitive (auth, onboarding) pair so a cold-boot offline
  // lands the user in the right tree without flicker.
  useEffect(() => {
    if (!isLoading && isAuthenticated && onboarding.status !== "loading") {
      cacheAuthState(true, onboarding.status === "complete");
    }
  }, [isLoading, isAuthenticated, onboarding.status, cacheAuthState]);

  // Initialise the server-side onboarding row for brand-new users.
  useEffect(() => {
    if (!effectiveAuthenticated || isOffline) return;
    void markOnboardingPendingIfUnset().catch((error) => {
      console.warn("[Onboarding] Failed to initialize onboarding state:", error);
    });
  }, [effectiveAuthenticated, isOffline, markOnboardingPendingIfUnset]);

  useEffect(() => {
    if (effectiveAuthLoading || onboardingLoading) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!effectiveAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/sign-up" as never);
      return;
    }

    if (effectiveAuthenticated && !hasCompletedOnboarding && !inOnboarding) {
      router.replace("/onboarding/demo-chat" as never);
      return;
    }

    // Authed user landing on the auth screens → tabs.
    // We deliberately do NOT redirect away from `/onboarding/*` here even
    // when `hasCompletedOnboarding` flips to true mid-flow — `consent.tsx`
    // routes forward to `/onboarding/analysis` immediately after the flip,
    // and racing this hook's redirect against that imperative replace
    // produces "route not handled" errors. The OnboardingLayout handles
    // its own post-consent vs pre-consent routing declaratively.
    if (
      effectiveAuthenticated &&
      hasCompletedOnboarding &&
      inAuthGroup
    ) {
      router.replace("/(tabs)" as never);
    }
  }, [
    hasCompletedOnboarding,
    effectiveAuthenticated,
    effectiveAuthLoading,
    onboardingLoading,
    router,
    segments,
  ]);

  return {
    isAuthenticated: effectiveAuthenticated,
    isLoading: effectiveAuthLoading || onboardingLoading,
  };
}

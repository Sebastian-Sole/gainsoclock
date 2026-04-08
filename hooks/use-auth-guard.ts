import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { useNetwork } from "@/hooks/use-network";
import { useAuthCacheStore } from "@/stores/auth-cache-store";

export function useAuthGuard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isOffline } = useNetwork();
  const markOnboardingPendingIfUnset = useMutation(
    api.user.markOnboardingPendingIfUnset
  );
  const onboardingStatus = useQuery(api.user.getOnboardingStatus);
  const segments = useSegments();
  const router = useRouter();

  // Read cached auth state for offline fallback
  const cachedAuth = useAuthCacheStore((s) => s.wasAuthenticated);
  const cachedOnboarding = useAuthCacheStore((s) => s.hasCompletedOnboarding);
  const cacheAuthState = useAuthCacheStore((s) => s.cacheAuthState);

  // When offline and Convex auth is still loading, fall back to cached state
  const effectiveAuthenticated = isLoading && isOffline ? cachedAuth : isAuthenticated;
  const effectiveLoading = isOffline ? false : isLoading;

  const onboardingLoading =
    effectiveAuthenticated && !isOffline && onboardingStatus === undefined;
  const hasCompletedOnboarding = isOffline
    ? cachedOnboarding
    : (onboardingStatus?.hasCompletedOnboarding ?? true);

  // Cache auth state whenever we get a definitive answer from the server
  useEffect(() => {
    if (!isLoading && isAuthenticated && onboardingStatus !== undefined) {
      cacheAuthState(true, onboardingStatus?.hasCompletedOnboarding ?? true);
    }
  }, [isLoading, isAuthenticated, onboardingStatus, cacheAuthState]);

  // Only call server mutation when online
  useEffect(() => {
    if (!effectiveAuthenticated || isOffline) return;
    void markOnboardingPendingIfUnset().catch((error) => {
      console.warn("[Onboarding] Failed to initialize onboarding state:", error);
    });
  }, [effectiveAuthenticated, isOffline, markOnboardingPendingIfUnset]);

  useEffect(() => {
    if (effectiveLoading || onboardingLoading) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!effectiveAuthenticated && !inAuthGroup) {
      // Cast needed: (auth) routes are new and typed routes haven't regenerated yet
      router.replace("/(auth)/sign-up" as never);
      return;
    }

    if (effectiveAuthenticated && !hasCompletedOnboarding && !inOnboarding) {
      router.replace("/onboarding" as never);
      return;
    }

    if (effectiveAuthenticated && hasCompletedOnboarding && (inAuthGroup || inOnboarding)) {
      router.replace("/(tabs)" as never);
    }
  }, [
    hasCompletedOnboarding,
    effectiveAuthenticated,
    effectiveLoading,
    onboardingLoading,
    router,
    segments,
  ]);

  return { isAuthenticated: effectiveAuthenticated, isLoading: effectiveLoading || onboardingLoading };
}

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

export function useAuthGuard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const markOnboardingPendingIfUnset = useMutation(
    api.user.markOnboardingPendingIfUnset
  );
  const onboardingStatus = useQuery(api.user.getOnboardingStatus);
  const segments = useSegments();
  const router = useRouter();
  const onboardingLoading = isAuthenticated && onboardingStatus === undefined;
  const hasCompletedOnboarding =
    onboardingStatus?.hasCompletedOnboarding ?? true;

  useEffect(() => {
    if (!isAuthenticated) return;
    void markOnboardingPendingIfUnset().catch((error) => {
      console.warn("[Onboarding] Failed to initialize onboarding state:", error);
    });
  }, [isAuthenticated, markOnboardingPendingIfUnset]);

  useEffect(() => {
    if (isLoading || onboardingLoading) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!isAuthenticated && !inAuthGroup) {
      // Cast needed: (auth) routes are new and typed routes haven't regenerated yet
      router.replace("/(auth)/sign-in" as never);
      return;
    }

    if (isAuthenticated && !hasCompletedOnboarding && !inOnboarding) {
      router.replace("/onboarding" as never);
      return;
    }

    if (isAuthenticated && hasCompletedOnboarding && (inAuthGroup || inOnboarding)) {
      router.replace("/(tabs)" as never);
    }
  }, [
    hasCompletedOnboarding,
    isAuthenticated,
    isLoading,
    onboardingLoading,
    router,
    segments,
  ]);

  return { isAuthenticated, isLoading: isLoading || onboardingLoading };
}

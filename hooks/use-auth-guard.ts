import * as Sentry from "@sentry/react-native";
import { useConvexAuth, useMutation } from "convex/react";
import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useNetwork } from "@/hooks/use-network";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { useAuthCacheStore } from "@/stores/auth-cache-store";

const AUTH_STALL_MS = 5000;

export function useAuthGuard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { isOffline } = useNetwork();
  const markOnboardingPendingIfUnset = useMutation(
    api.user.markOnboardingPendingIfUnset
  );
  const onboarding = useOnboardingStatus();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();

  // Two-layer readiness gate. `navState?.key` flips when Expo Router has
  // a navigator registered, but in practice that can be true within the
  // same commit cycle as the Stack's first mount — calling `router.replace`
  // synchronously from a useEffect that fires in that same cycle still
  // races. `mounted` is set in a separate useEffect so it can only be true
  // on the *second* commit, by which point the Stack's own effects have
  // definitely flushed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const rootNavReady = mounted && Boolean(navState?.key);

  const cachedAuth = useAuthCacheStore((s) => s.wasAuthenticated);
  const cacheAuthState = useAuthCacheStore((s) => s.cacheAuthState);

  // While Convex auth is still resolving, route from the persisted cache.
  // ConvexAuth will refine `isAuthenticated` when it eventually responds; if
  // it never does (firewall blocking WSS, captive WiFi, cold deployment),
  // the user still lands in the right tree without staring at the splash.
  const effectiveAuthenticated = isLoading ? cachedAuth : isAuthenticated;
  const effectiveAuthLoading = false;

  // Telemetry: surface unusually long auth resolution to Sentry so we can
  // tell "Convex is slow today" from "Convex is silently unreachable".
  useEffect(() => {
    if (!isLoading) return;
    const id = setTimeout(() => {
      Sentry.captureMessage(
        `ConvexAuth.isLoading exceeded ${AUTH_STALL_MS}ms (isOffline=${isOffline})`,
        "warning"
      );
    }, AUTH_STALL_MS);
    return () => clearTimeout(id);
  }, [isLoading, isOffline]);

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
  // Must wait for the Convex WebSocket to actually authenticate — `cachedAuth`
  // is enough to pick a route, but the server-side `getAuthUserId` only
  // returns a user id once ConvexAuth has settled.
  useEffect(() => {
    if (isLoading || !isAuthenticated || isOffline) return;
    void markOnboardingPendingIfUnset().catch((error) => {
      console.warn("[Onboarding] Failed to initialize onboarding state:", error);
    });
  }, [isLoading, isAuthenticated, isOffline, markOnboardingPendingIfUnset]);

  useEffect(() => {
    if (!rootNavReady) return;
    if (effectiveAuthLoading || onboardingLoading) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";
    const inOnboarding = (segments[0] as string) === "onboarding";

    if (!effectiveAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/sign-up");
      return;
    }

    if (effectiveAuthenticated && !hasCompletedOnboarding && !inOnboarding) {
      router.replace("/onboarding/welcome");
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
      router.replace("/(tabs)");
    }
  }, [
    rootNavReady,
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

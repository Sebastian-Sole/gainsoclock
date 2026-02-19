import { useConvexAuth } from "convex/react";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

export function useAuthGuard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = (segments[0] as string) === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      // Cast needed: (auth) routes are new and typed routes haven't regenerated yet
      router.replace("/(auth)/sign-in" as never);
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)" as never);
    }
  }, [isAuthenticated, isLoading, segments]);

  return { isAuthenticated, isLoading };
}

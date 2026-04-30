import "../global.css";

import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { useEffect, useRef } from "react";
import { ThemeProvider } from "@react-navigation/native";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";

import { NAV_THEME } from "@/lib/theme";
import secureStorage from "@/lib/secure-storage";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { ConvexSyncProvider } from "@/providers/convex-sync-provider";
import { NetworkProvider } from "@/providers/network-provider";
import { PostHogProvider } from "@/providers/posthog-provider";
import {
  identifyAnalytics,
  resetAnalytics,
  startReplayForRoute,
} from "@/lib/analytics";
import { api } from "@/convex/_generated/api";

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

SplashScreen.preventAutoHideAsync();

if (!process.env.EXPO_PUBLIC_CONVEX_URL) {
  throw new Error(
    "Missing EXPO_PUBLIC_CONVEX_URL — add it to .env.local (run `npx convex dev` to get the URL)"
  );
}

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootNavigator() {
  const { colorScheme } = useColorScheme();
  const { isLoading } = useAuthGuard();
  const hasHiddenSplash = useRef(false);
  const { isAuthenticated } = useConvexAuth();
  const userIdResult = useQuery(api.user.me);
  const pathname = usePathname();
  const lastIdentifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading && !hasHiddenSplash.current) {
      hasHiddenSplash.current = true;
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // Identify on sign-in; reset on sign-out. PostHog auto-merges anonymous →
  // authenticated `distinct_id`, so calling identify after the first events
  // is safe.
  useEffect(() => {
    if (isAuthenticated && typeof userIdResult === "string") {
      if (lastIdentifiedRef.current !== userIdResult) {
        identifyAnalytics(userIdResult);
        lastIdentifiedRef.current = userIdResult;
      }
    } else if (!isAuthenticated && lastIdentifiedRef.current !== null) {
      resetAnalytics();
      lastIdentifiedRef.current = null;
    }
  }, [isAuthenticated, userIdResult]);

  // Session-replay route gating. Replay is opt-in per route (see
  // `REPLAY_ALLOWLIST` in `lib/analytics.ts`) — the default is OFF so any
  // screen we forget to add to the allowlist stays out of replays.
  useEffect(() => {
    if (!pathname) return;
    startReplayForRoute(pathname);
  }, [pathname]);

  if (isLoading) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <ThemeProvider value={NAV_THEME[colorScheme === "dark" ? "dark" : "light"]}>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="workout"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="template"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="exercise"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="import"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="calculator"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="chat"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="plan"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="recipe"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="settings"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="purchase-success"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
        </Stack>
        <PortalHost />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <NetworkProvider>
      <ConvexAuthProvider client={convex} storage={secureStorage}>
        <ConvexSyncProvider>
          <PostHogProvider>
            <RootNavigator />
          </PostHogProvider>
        </ConvexSyncProvider>
      </ConvexAuthProvider>
    </NetworkProvider>
  );
}

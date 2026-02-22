import "../global.css";

import { useEffect, useRef } from "react";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

import { NAV_THEME } from "@/lib/theme";
import secureStorage from "@/lib/secure-storage";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { ConvexSyncProvider } from "@/providers/convex-sync-provider";

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

  useEffect(() => {
    if (!isLoading && !hasHiddenSplash.current) {
      hasHiddenSplash.current = true;
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={NAV_THEME[colorScheme === "dark" ? "dark" : "light"]}>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
        </Stack>
        <PortalHost />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <ConvexSyncProvider>
        <RootNavigator />
      </ConvexSyncProvider>
    </ConvexAuthProvider>
  );
}

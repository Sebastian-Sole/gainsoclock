import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { api } from "@/convex/_generated/api";
import { resetAnalytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useAuthCacheStore } from "@/stores/auth-cache-store";
import { useSubscriptionStore } from "@/stores/subscription-store";

const DELETION_LIST = [
  "Profile, goals, training days, and body stats",
  "All completed workouts, templates, and exercise library",
  "Plans, plan days, and scheduled workouts",
  "Chat history with the AI coach",
  "Recipes, meal logs, and nutrition goals",
  "Consent history and onboarding records",
  "Subscription records on our servers (Apple manages the subscription itself)",
  "HealthKit workouts written by Fitbull (iOS)",
  "Analytics data in PostHog (best-effort)",
];

type Step = "info" | "confirm" | "working";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const deleteAccount = useMutation(api.onboarding.deleteAccount);
  const resetSubscription = useSubscriptionStore((s) => s.reset);
  const clearAuthCache = useAuthCacheStore((s) => s.clear);

  const [step, setStep] = useState<Step>("info");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setStep("working");
    setError(null);
    try {
      const result = await deleteAccount();
      const cleanupHint = (result as { clientCleanupHint?: { healthkit?: boolean } } | undefined)
        ?.clientCleanupHint;

      if (cleanupHint?.healthkit && Platform.OS === "ios") {
        try {
          const hk = await import("@/lib/healthkit");
          await hk.deleteAuthoredSamples();
        } catch (e) {
          console.warn("[delete-account] HealthKit cleanup failed:", e);
        }
      }

      resetSubscription();
      clearAuthCache();
      resetAnalytics();

      try {
        await AsyncStorage.clear();
      } catch (e) {
        console.warn("[delete-account] AsyncStorage.clear failed:", e);
      }

      if (Platform.OS !== "web") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Purchases = require("react-native-purchases").default;
          await Purchases?.logOut?.().catch(() => {});
        } catch {
          // RevenueCat not available
        }
      }

      // expo-secure-store has no bulk clear; the Convex Auth token is keyed
      // under a known prefix — remove by best-effort enumeration.
      try {
        await Promise.all(
          [
            "convex-auth-token",
            "convex-auth-refresh-token",
            "__convexAuthJWT",
            "__convexAuthRefreshToken",
          ].map((k) =>
            Platform.OS === "web"
              ? Promise.resolve()
              : SecureStore.deleteItemAsync(k).catch(() => {}),
          ),
        );
      } catch {
        // Non-fatal.
      }

      await signOut();
      router.replace("/(auth)/sign-up" as never);
    } catch (e) {
      console.warn("[delete-account] mutation failed:", e);
      setError("Couldn't delete your account. Try again in a moment.");
      setStep("confirm");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">Delete account</Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-10">
        {step === "info" ? (
          <View className="gap-4 pt-4">
            <Text className="text-base text-foreground">
              Delete your account and all data. This can&apos;t be undone.
            </Text>
            <View className="rounded-xl border border-border bg-card px-4 py-4">
              <Text className="mb-2 text-sm font-medium text-muted-foreground">
                We will permanently delete:
              </Text>
              <View className="gap-2">
                {DELETION_LIST.map((line) => (
                  <View key={line} className="flex-row gap-2">
                    <Text className="text-foreground">•</Text>
                    <Text className="flex-1 text-sm text-foreground">
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <Text className="text-xs text-muted-foreground">
              Apple handles the subscription itself. Cancel it in Settings
              &gt; Apple ID &gt; Subscriptions if you have an active trial or
              plan.
            </Text>
            <Pressable
              onPress={() => setStep("confirm")}
              className="mt-4 items-center rounded-xl bg-destructive py-4"
              accessibilityRole="button"
              accessibilityLabel="Continue to confirmation"
              testID="delete-account-continue"
            >
              <Text className="font-medium text-white">Continue</Text>
            </Pressable>
          </View>
        ) : step === "confirm" ? (
          <View className="gap-4 pt-4">
            <Text className="text-base font-semibold text-destructive">
              This is permanent.
            </Text>
            <Text className="text-sm text-muted-foreground">
              Type <Text className="font-bold">delete my account</Text> to
              confirm.
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="delete my account"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Type delete my account to confirm"
              testID="delete-account-confirm-input"
              className="rounded-lg border border-border bg-background px-4 py-3 text-foreground"
            />
            {error ? (
              <Text className="text-sm text-destructive">{error}</Text>
            ) : null}
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setStep("info")}
                className="flex-1 items-center rounded-xl border border-border py-4"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="font-medium">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (confirmText.toLowerCase().trim() !== "delete my account") {
                    Alert.alert(
                      "Type to confirm",
                      "Please type 'delete my account' exactly.",
                    );
                    return;
                  }
                  void handleDelete();
                }}
                disabled={confirmText.toLowerCase().trim() !== "delete my account"}
                accessibilityRole="button"
                accessibilityLabel="Delete account permanently"
                testID="delete-account-confirm"
                className={cn(
                  "flex-1 flex-row items-center justify-center gap-2 rounded-xl py-4",
                  confirmText.toLowerCase().trim() === "delete my account"
                    ? "bg-destructive"
                    : "bg-destructive/30",
                )}
              >
                <Icon as={Trash2} size={18} className="text-white" />
                <Text className="font-medium text-white">Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="items-center gap-4 pt-16">
            <ActivityIndicator size="large" />
            <Text className="text-base text-muted-foreground">
              Deleting your data…
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useConsent } from "@/hooks/use-consent";
import { CONSENT_COPY, type ConsentPurpose } from "@/lib/consent";

const TERMS_URL = "https://www.fitbull.app/terms";
const PRIVACY_URL = "https://www.fitbull.app/privacy";

type PurposeRow = {
  purpose: ConsentPurpose;
  title: string;
  description: string;
};

// Strip the leading "OK," from CONSENT_COPY (used for the consent-screen UX)
// and capitalise the first remaining letter so it reads naturally in Settings.
function settingsDescription(purpose: ConsentPurpose): string {
  const raw = CONSENT_COPY[purpose];
  const stripped = raw.replace(/^OK,\s*/i, "").trim();
  if (stripped.length === 0) return raw;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

const ROWS: readonly PurposeRow[] = [
  {
    purpose: "health_data_personalization",
    title: "Health Personalisation",
    description: settingsDescription("health_data_personalization"),
  },
  // AI Coach consent is granted implicitly when the user accepts the Terms on
  // sign-up (legal basis: GDPR Art. 6(1)(b), performance of contract). Toggling
  // this row off records `granted: false` as a signal of withdrawal — server-side
  // enforcement of withdrawal is a separate concern we'll add later if needed.
  {
    purpose: "ai_coach_inference",
    title: "AI Coach",
    description: settingsDescription("ai_coach_inference"),
  },
  {
    purpose: "analytics",
    title: "Anonymous Analytics",
    description: settingsDescription("analytics"),
  },
];

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const { consents, setConsent, isLoading } = useConsent();
  const [pending, setPending] = useState<ConsentPurpose | null>(null);

  const handleToggle = async (purpose: ConsentPurpose, next: boolean) => {
    setPending(purpose);
    try {
      await setConsent(purpose, next);
    } catch (error) {
      console.warn("[privacy] setConsent failed:", error);
      Alert.alert(
        "Couldn't update",
        "We couldn't save your preference. Check your connection and try again.",
      );
    } finally {
      setPending(null);
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
        <Text className="text-3xl font-bold">Privacy & Consent</Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-10">
        <Text className="mb-4 mt-2 text-sm text-muted-foreground">
          Control how Fitbull uses your data. You can change these any time.
        </Text>

        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
          CONSENTS
        </Text>
        <View className="rounded-xl bg-card">
          {ROWS.map((row, idx) => {
            const granted = consents[row.purpose]?.granted ?? false;
            const rowPending = pending === row.purpose;
            const disabled = isLoading || rowPending;

            return (
              <View key={row.purpose}>
                <Pressable
                  onPress={() => {
                    if (disabled) return;
                    void handleToggle(row.purpose, !granted);
                  }}
                  disabled={disabled}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: granted, disabled }}
                  accessibilityLabel={row.title}
                  accessibilityHint={row.description}
                  testID={`privacy-toggle-${row.purpose}`}
                  className="flex-row items-start gap-3 px-4 py-4"
                >
                  <View className="flex-1">
                    <Text className="font-medium">{row.title}</Text>
                    <Text className="mt-1 text-sm text-muted-foreground">
                      {row.description}
                    </Text>
                  </View>
                  {/* Visual switch only — taps are handled by the outer
                      Pressable so the whole row is the hit target (matches
                      iOS Settings UX). The Switch is wrapped in a
                      pointer-events-none view to prevent double-toggling. */}
                  <View pointerEvents="none" className="pt-1">
                    <Switch
                      checked={granted}
                      disabled={disabled}
                      onCheckedChange={() => {
                        // No-op: row Pressable handles taps. Required by
                        // @rn-primitives/switch's RootProps contract.
                      }}
                    />
                  </View>
                </Pressable>
                {idx < ROWS.length - 1 ? <Separator /> : null}
              </View>
            );
          })}
        </View>

        {/* Legal footer — links to Terms and Privacy Policy. */}
        <View className="mt-8 flex-row flex-wrap items-center justify-center gap-x-1 px-4">
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
            accessibilityRole="link"
            accessibilityLabel={TERMS_URL}
            hitSlop={8}
          >
            <Text className="text-xs font-medium text-foreground underline">
              Terms of Service
            </Text>
          </Pressable>
          <Text className="text-xs text-muted-foreground"> · </Text>
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
            accessibilityRole="link"
            accessibilityLabel={PRIVACY_URL}
            hitSlop={8}
          >
            <Text className="text-xs font-medium text-foreground underline">
              Privacy Policy
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

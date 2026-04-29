import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { api } from "@/convex/_generated/api";
import { setAnalyticsConsent } from "@/lib/analytics";
import { CONSENT_COPY, type ConsentPurpose } from "@/lib/consent";
import { ERROR_COPY } from "@/lib/copy/errors";
import { useMutation, useQuery } from "convex/react";

type PurposeRow = {
  purpose: ConsentPurpose;
  title: string;
  description: string;
};

const ROWS: readonly PurposeRow[] = [
  {
    purpose: "health_data_personalization",
    title: "Health data personalisation",
    description: CONSENT_COPY.health_data_personalization,
  },
  {
    purpose: "ai_coach_inference",
    title: "AI coach inference",
    description: CONSENT_COPY.ai_coach_inference,
  },
  {
    purpose: "analytics",
    title: "Analytics",
    description: CONSENT_COPY.analytics,
  },
];

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const consents = useQuery(api.onboarding.getConsents);
  const withdraw = useMutation(api.onboarding.withdrawConsent);
  const [pending, setPending] = useState<ConsentPurpose | null>(null);

  const granted = useMemo(() => {
    const g: Record<ConsentPurpose, boolean> = {
      health_data_personalization: false,
      ai_coach_inference: false,
      analytics: false,
    };
    if (!consents) return g;
    for (const p of Object.keys(g) as ConsentPurpose[]) {
      g[p] = consents[p]?.granted ?? false;
    }
    return g;
  }, [consents]);

  const handleToggle = async (purpose: ConsentPurpose, next: boolean) => {
    if (next) {
      Alert.alert(
        "Re-grant in onboarding",
        "To grant a consent again, complete the onboarding consent step. You can withdraw consent here at any time.",
      );
      return;
    }
    setPending(purpose);
    try {
      await withdraw({ purpose });
      if (purpose === "analytics") {
        setAnalyticsConsent(false);
      }
    } catch (error) {
      console.warn("[privacy] withdraw failed:", error);
      Alert.alert("Couldn't update", ERROR_COPY.NETWORK_SYNC);
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
        <Text className="text-3xl font-bold">Privacy</Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-10">
        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
          CONSENTS
        </Text>
        <View className="rounded-xl bg-card">
          {ROWS.map((row, idx) => {
            const isOn = granted[row.purpose];
            return (
              <View key={row.purpose}>
                <View className="flex-row items-start gap-3 px-4 py-4">
                  <View className="flex-1">
                    <Text className="font-medium">{row.title}</Text>
                    <Text className="mt-1 text-sm text-muted-foreground">
                      {row.description}
                    </Text>
                  </View>
                  <Switch
                    checked={isOn}
                    disabled={pending === row.purpose}
                    onCheckedChange={(next) =>
                      void handleToggle(row.purpose, next)
                    }
                    accessibilityRole="switch"
                    accessibilityState={{ checked: isOn }}
                    accessibilityLabel={`${row.title}. ${row.description}`}
                    testID={`privacy-toggle-${row.purpose}`}
                  />
                </View>
                {idx < ROWS.length - 1 ? <Separator /> : null}
              </View>
            );
          })}
        </View>

        <Text className="mt-6 text-xs text-muted-foreground">
          Withdrawing a consent stops the related data flow and schedules a
          cleanup of previously-collected data where applicable. You remain
          signed in.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

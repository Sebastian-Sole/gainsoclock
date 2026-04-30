import { Linking, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";

type Citation = {
  label: string;
  href: string;
  summary: string;
};

const CITATIONS: Citation[] = [
  {
    label: "Schoenfeld, B. J. (2010). The mechanisms of muscle hypertrophy.",
    href: "https://doi.org/10.1519/JSC.0b013e3181e840f3",
    summary: "Progressive overload as the driver of muscle adaptation.",
  },
  {
    label: "Borg, G. A. V. (1970). Perceived exertion scale.",
    href: "https://doi.org/10.2340/1650197719702239298",
    summary: "RPE as a subjective intensity anchor.",
  },
  {
    label: "DeLorme, T. (1948). Progressive resistance exercise.",
    href: "https://doi.org/10.2106/00004623-194830030-00014",
    summary: "The origin of structured set/rep progression.",
  },
  {
    label: "Mifflin, M. D. et al. (1990). A new predictive equation for RMR.",
    href: "https://doi.org/10.1093/ajcn/51.2.241",
    summary: "The Mifflin-St Jeor equation used for calorie estimation.",
  },
];

const SUB_PROCESSORS = [
  "OpenAI (US, Standard Contractual Clauses) — generates onboarding coach content.",
  "PostHog (Frankfurt, EU) — anonymous product analytics.",
  "RevenueCat (US, Standard Contractual Clauses) — subscription state.",
  "Convex (EU region) — application database and server functions.",
];

function openLink(url: string) {
  Linking.openURL(url).catch(() => {
    // Silent failure; the user can copy the link manually.
  });
}

export default function MethodologyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Methodology" }} />
      <SafeAreaView edges={["top"]} className="flex-1 bg-background">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-6 pb-12 pt-4"
        >
          <Text variant="h2" className="border-b-0 pb-0">
            How Fitbull trains you.
          </Text>
          <Text className="mt-2 text-sm text-muted-foreground">
            The onboarding coach and plan tiles are grounded in peer-reviewed
            strength and conditioning research.
          </Text>

          <View className="mt-8 gap-4">
            <Text variant="h3">Medical disclaimer</Text>
            <Text className="text-sm text-foreground">
              Fitbull provides general fitness guidance — not medical advice.
              Never use Fitbull to diagnose, prevent, treat, or cure any
              condition. If you have pain, injury, pregnancy, a heart
              condition, or any medical concern, speak with a qualified
              healthcare professional before training.
            </Text>
          </View>

          <View className="mt-8 gap-3">
            <Text variant="h3">Citations</Text>
            {CITATIONS.map((c) => (
              <View key={c.href} className="gap-1">
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open citation: ${c.label}`}
                  onPress={() => openLink(c.href)}
                  hitSlop={8}
                >
                  <Text className="text-sm font-medium text-primary underline">
                    {c.label}
                  </Text>
                </Pressable>
                <Text className="text-xs text-muted-foreground">
                  {c.summary}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-8 gap-3">
            <Text variant="h3">Sub-processors</Text>
            {SUB_PROCESSORS.map((line) => (
              <Text key={line} className="text-sm text-foreground">
                • {line}
              </Text>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

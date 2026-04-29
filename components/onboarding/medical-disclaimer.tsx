import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { Text } from "@/components/ui/text";

const DISCLAIMER =
  "General fitness guidance — not medical advice. Talk to a qualified professional before starting if you have injuries, pregnancy, or heart conditions.";

export function MedicalDisclaimer() {
  const router = useRouter();
  return (
    <View
      className="mt-6 gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3"
      accessibilityRole="summary"
    >
      <Text className="text-xs text-muted-foreground">{DISCLAIMER}</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Read Fitbull's methodology and citations"
        onPress={() => router.push("/methodology" as never)}
        hitSlop={10}
        testID="medical-disclaimer-methodology-link"
      >
        <Text className="text-xs font-medium text-primary underline">
          Read our methodology
        </Text>
      </Pressable>
    </View>
  );
}

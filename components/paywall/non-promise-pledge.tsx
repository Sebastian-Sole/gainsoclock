import { View } from "react-native";

import { Text } from "@/components/ui/text";

const PLEDGES: readonly string[] = [
  "No gimmicks — no before/after photos. Progressive overload.",
  "No guilt trips — miss a session, we adjust next time.",
  "No lock-in — cancel anytime in Settings.",
  "No surveillance — body stats stay on device and EU servers.",
];

export function NonPromisePledge() {
  return (
    <View className="gap-3" accessibilityRole="text">
      {PLEDGES.map((line, i) => (
        <View key={i} className="flex-row gap-2">
          <Text className="text-foreground">•</Text>
          <Text className="flex-1 text-foreground">{line}</Text>
        </View>
      ))}
    </View>
  );
}

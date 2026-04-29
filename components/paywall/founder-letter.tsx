import { View } from "react-native";

import { Text } from "@/components/ui/text";

// Prose is Strava-dry per UX #14. Under 300 words. Distinct from the
// methodology page, which carries scientific citations.
export function FounderLetter() {
  return (
    <View className="gap-3" accessibilityRole="text">
      <Text className="text-foreground">
        Fitbull started because the apps I tried kept selling me a fantasy —
        shredded in 30 days, one weird trick, nag-screens on rest days. That
        isn&apos;t how training works, and it isn&apos;t respectful of your
        time.
      </Text>
      <Text className="text-foreground">
        The coach adapts to the week you actually have. Miss a session, it
        adjusts. Train twice as hard as planned, it adjusts. Your stats stay
        on the device and EU servers. Body numbers never leave for analytics
        — that&apos;s a design constraint, not a marketing line.
      </Text>
      <Text className="text-foreground">
        You can cancel anytime in Apple&apos;s Settings. If the product
        isn&apos;t right for you, I&apos;d rather you leave clean than stay
        annoyed. Thanks for giving this a serious try.
      </Text>
      <Text className="text-sm text-muted-foreground">— Sebastian</Text>
    </View>
  );
}

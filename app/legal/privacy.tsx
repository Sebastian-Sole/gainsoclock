import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";

import { Text } from "@/components/ui/text";

const HOSTED_POLICY_URL = "https://fitbull.app/legal/privacy";

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Privacy Policy" }} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24 }}
      >
        <Text className="mb-4 text-2xl font-bold">Privacy Policy</Text>
        <Text className="mb-4 text-muted-foreground">
          Our full privacy policy is hosted online. It describes what we
          collect, why, how long we keep it, and your rights under GDPR.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL(HOSTED_POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel="Open the hosted privacy policy"
          hitSlop={8}
          className="mb-6 min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="text-base font-medium text-primary underline">
            Open full Privacy Policy
          </Text>
        </Pressable>
        <View className="items-start">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            className="min-h-[44px] items-center justify-center"
          >
            <Text className="text-sm text-primary">Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

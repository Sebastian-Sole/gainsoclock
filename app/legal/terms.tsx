import { Linking, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";

import { Text } from "@/components/ui/text";

const HOSTED_TERMS_URL = "https://fitbull.app/legal/terms";

export default function TermsOfServiceScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Terms of Service" }} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24 }}
      >
        <Text className="mb-4 text-2xl font-bold">Terms of Service</Text>
        <Text className="mb-4 text-muted-foreground">
          Our full terms of service are hosted online. They cover the
          agreement between you and Fitbull for using the app.
        </Text>
        <Pressable
          onPress={() => void Linking.openURL(HOSTED_TERMS_URL)}
          accessibilityRole="link"
          accessibilityLabel="Open the hosted terms of service"
          hitSlop={8}
          className="mb-6 min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3"
        >
          <Text className="text-base font-medium text-primary underline">
            Open full Terms of Service
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

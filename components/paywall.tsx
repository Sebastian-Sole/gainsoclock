import React from "react";
import { Alert, View, Pressable, ActivityIndicator } from "react-native";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MessageCircle,
  Sparkles,
  Dumbbell,
  ChefHat,
  Crown,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/theme";
import { usePurchases } from "@/hooks/use-purchases";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "AI Fitness Coach",
    description: "Get personalized workout advice and answers",
  },
  {
    icon: Dumbbell,
    title: "Custom Workout Plans",
    description: "AI-generated training programs tailored to your goals",
  },
  {
    icon: ChefHat,
    title: "Meal Suggestions",
    description: "Nutrition advice and recipes for your macros",
  },
  {
    icon: Sparkles,
    title: "Smart Programming",
    description: "Templates with progressive overload built in",
  },
];

export function Paywall() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === "dark" ? "dark" : "light"].tint;
  const router = useRouter();
  const { restore, presentPaywall, isLoading } = usePurchases();

  const handleUpgrade = async () => {
    const result = await presentPaywall();

    if (result === "purchased") {
      router.push("/purchase-success");
      return;
    }

    if (result === "error") {
      Alert.alert(
        "Purchase Error",
        "Something went wrong while opening purchases. Please try again."
      );
    }
  };

  const handleRestore = async () => {
    const restored = await restore();
    if (restored) {
      Alert.alert("Restored", "Your Pro subscription has been restored!");
    } else {
      Alert.alert(
        "No Subscription Found",
        "We couldn't find an active subscription for your account."
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 justify-between px-6 pb-8">
        {/* Header */}
        <View className="items-center pt-8">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Crown size={40} color={primaryColor} />
          </View>
          <Text className="text-2xl font-bold">Unlock AI Coach</Text>
          <Text className="mt-2 text-center text-muted-foreground">
            Get your personal AI fitness coach for workouts, plans, and nutrition
          </Text>
        </View>

        {/* Features */}
        <View className="my-8 gap-4">
          {FEATURES.map((feature) => (
            <View key={feature.title} className="flex-row items-center gap-4">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <feature.icon size={20} color={primaryColor} />
              </View>
              <View className="flex-1">
                <Text className="font-medium">{feature.title}</Text>
                <Text className="text-sm text-muted-foreground">
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View className="gap-3">
          <Pressable
            onPress={handleUpgrade}
            disabled={isLoading}
            className="items-center rounded-2xl bg-primary py-4"
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-lg font-bold text-primary-foreground">
                View Plans
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleRestore}
            disabled={isLoading}
            className="items-center py-3"
          >
            <Text className="text-sm text-muted-foreground underline">
              Restore Purchases
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

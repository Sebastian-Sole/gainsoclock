import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/text";
import {
  ChefHat,
  Crown,
  Dumbbell,
  MessageCircle,
  Sparkles,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Colors } from "@/constants/theme";
import { usePurchases } from "@/hooks/use-purchases";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "AI fitness coach chat",
    description: "Ask for workouts, nutrition, and programming help anytime.",
  },
  {
    icon: Dumbbell,
    title: "Custom plans",
    description: "Generate plans built for your goals and schedule.",
  },
  {
    icon: ChefHat,
    title: "Meal support",
    description: "Get suggestions that fit your macros and training days.",
  },
  {
    icon: Sparkles,
    title: "Smarter progression",
    description: "Use templates that help you progress week to week.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === "dark" ? "dark" : "light"].tint;
  const completeOnboarding = useMutation(api.user.completeOnboarding);
  const { presentPaywall } = usePurchases();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding();
      router.replace("/(tabs)" as never);
    } catch {
      Alert.alert(
        "Onboarding Error",
        "Couldn't finish onboarding. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChoosePlan = async () => {
    setIsSubmitting(true);
    try {
      const result = await presentPaywall();

      if (result === "purchased") {
        await completeOnboarding();
        router.push("/purchase-success" as never);
        return;
      }

      if (result === "error") {
        Alert.alert(
          "Purchase Error",
          "Something went wrong while opening purchases. Please try again."
        );
      }
    } catch {
      Alert.alert(
        "Onboarding Error",
        "Couldn't finish onboarding. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 justify-between px-6 pb-8">
        <View>
          <View className="items-center pt-6">
            <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Crown size={40} color={primaryColor} />
            </View>
            <Text className="text-center text-3xl font-bold">Welcome to Gainsoclock</Text>
            <Text className="mt-2 text-center text-muted-foreground">
              Start free now, or unlock Pro to get your full AI coaching setup.
            </Text>
          </View>

          <View className="mt-8 gap-4">
            {FEATURES.map((feature) => (
              <View key={feature.title} className="flex-row items-start gap-4">
                <View className="mt-1 h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
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
        </View>

        <View className="gap-3">
          <Pressable
            onPress={handleChoosePlan}
            disabled={isSubmitting}
            className="items-center rounded-2xl bg-primary py-4"
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-base font-bold text-primary-foreground">
                Choose Plan
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleSkip}
            disabled={isSubmitting}
            className="items-center py-3"
          >
            <Text className="text-sm text-muted-foreground underline">
              Skip and start free
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

import React from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Crown } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Colors } from "@/constants/theme";
import { PRO_FEATURES } from "@/constants/features";
import Animated, { FadeInDown } from "react-native-reanimated";

export default function PurchaseSuccessScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === "dark" ? "dark" : "light"].tint;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 pb-8">
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100)} className="items-center pt-12">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Crown size={40} color={primaryColor} />
          </View>
          <Text className="text-2xl font-bold">Welcome to Pro!</Text>
          <Text className="mt-2 text-center text-muted-foreground">
            You&apos;ve unlocked your AI fitness coach
          </Text>
        </Animated.View>

        {/* Features */}
        <Animated.View entering={FadeInDown.delay(250)} className="my-8 gap-4">
          {PRO_FEATURES.map((feature) => (
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
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInDown.delay(400)}>
          <Pressable
            onPress={() => router.replace("/(tabs)" as never)}
            className="items-center rounded-2xl bg-primary py-4"
          >
            <Text className="text-lg font-bold text-primary-foreground">
              Get Started
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

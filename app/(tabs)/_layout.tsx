import { Tabs } from "expo-router";
import { View } from "react-native";
import {
  ChartNoAxesCombined,
  Compass,
  Dumbbell,
  MessageCircle,
  Settings2,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useOnboardingTarget } from "@/hooks/use-onboarding-target";

export default function TabLayout() {
  const { colorScheme } = useColorScheme();

  const workoutsRef = useOnboardingTarget('tab-workouts');
  const statsRef = useOnboardingTarget('tab-stats');
  const exploreRef = useOnboardingTarget('tab-explore');
  const chatRef = useOnboardingTarget('tab-chat');

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color, size }) => (
            <View ref={workoutsRef} collapsable={false}>
              <Dumbbell size={size} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => (
            <View ref={statsRef} collapsable={false}>
              <ChartNoAxesCombined size={size} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, size }) => (
            <View ref={exploreRef} collapsable={false}>
              <Compass size={size} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => (
            <View ref={chatRef} collapsable={false}>
              <MessageCircle size={size} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Settings2 size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

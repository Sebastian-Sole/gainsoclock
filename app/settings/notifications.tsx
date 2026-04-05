import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import {
  AlarmClock,
  Bell,
  ChevronLeft,
  MessageSquare,
  Sunrise,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ensurePermission } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";

export default function NotificationSettingsScreen() {
  const router = useRouter();

  const notifRestTimer = useSettingsStore((s) => s.notificationsRestTimerEnabled);
  const setNotifRestTimer = useSettingsStore((s) => s.setNotificationsRestTimerEnabled);
  const notifPostWorkout = useSettingsStore((s) => s.notificationsPostWorkoutEnabled);
  const setNotifPostWorkout = useSettingsStore((s) => s.setNotificationsPostWorkoutEnabled);
  const notifPostWorkoutDelay = useSettingsStore((s) => s.notificationsPostWorkoutDelay);
  const setNotifPostWorkoutDelay = useSettingsStore((s) => s.setNotificationsPostWorkoutDelay);
  const notifReminder = useSettingsStore((s) => s.notificationsReminderEnabled);
  const setNotifReminder = useSettingsStore((s) => s.setNotificationsReminderEnabled);
  const notifReminderTime = useSettingsStore((s) => s.notificationsReminderTime);
  const setNotifReminderTime = useSettingsStore((s) => s.setNotificationsReminderTime);
  const notifMorningPlan = useSettingsStore((s) => s.notificationsMorningPlanEnabled);
  const setNotifMorningPlan = useSettingsStore((s) => s.setNotificationsMorningPlanEnabled);
  const notifMorningPlanTime = useSettingsStore((s) => s.notificationsMorningPlanTime);
  const setNotifMorningPlanTime = useSettingsStore((s) => s.setNotificationsMorningPlanTime);

  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showMorningPicker, setShowMorningPicker] = useState(false);

  const handleNotificationToggle = useCallback(
    async (setter: (enabled: boolean) => void, enabled: boolean) => {
      if (enabled) {
        const granted = await ensurePermission();
        if (!granted) return;
      }
      setter(enabled);
    },
    []
  );

  const timeToDate = (time: string): Date => {
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    return d;
  };

  const formatTimeDisplay = (time: string): string => {
    const d = timeToDate(time);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} className="p-1">
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-3xl font-bold">Notifications</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Rest Timer Alerts */}
        <Text className="mb-3 mt-4 text-sm font-medium text-muted-foreground">
          WORKOUT
        </Text>
        <View className="rounded-xl bg-card">
          <View className="flex-row items-center gap-3 px-4 py-4">
            <Icon as={Bell} size={20} className="text-primary" />
            <View className="flex-1">
              <Text className="font-medium">Rest Timer Alerts</Text>
              <Text className="text-sm text-muted-foreground">
                Notify when rest timer ends
              </Text>
            </View>
            <Switch
              checked={notifRestTimer}
              onCheckedChange={(v) => handleNotificationToggle(setNotifRestTimer, v)}
            />
          </View>

          <Separator />

          {/* Post-Workout Summary */}
          <View className="px-4 py-4">
            <View className="flex-row items-center gap-3">
              <Icon as={MessageSquare} size={20} className="text-primary" />
              <View className="flex-1">
                <Text className="font-medium">Post-Workout Summary</Text>
                <Text className="text-sm text-muted-foreground">
                  Encouragement after your workout
                </Text>
              </View>
              <Switch
                checked={notifPostWorkout}
                onCheckedChange={(v) => handleNotificationToggle(setNotifPostWorkout, v)}
              />
            </View>
            {notifPostWorkout && (
              <View className="mt-3 ml-8 flex-row flex-wrap gap-2">
                {[15, 30, 60, 120].map((mins) => (
                  <Pressable
                    key={mins}
                    onPress={() => setNotifPostWorkoutDelay(mins)}
                    className={cn(
                      "rounded-lg px-3 py-1.5",
                      notifPostWorkoutDelay === mins
                        ? "bg-primary"
                        : "border border-border",
                    )}
                  >
                    <Text
                      className={cn(
                        "text-sm font-medium",
                        notifPostWorkoutDelay === mins
                          ? "text-primary-foreground"
                          : "text-foreground",
                      )}
                    >
                      {mins < 60 ? `${mins}m` : `${mins / 60}hr`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Reminders */}
        <Text className="mb-3 mt-8 text-sm font-medium text-muted-foreground">
          REMINDERS
        </Text>
        <View className="rounded-xl bg-card">
          {/* Workout Reminder */}
          <View className="px-4 py-4">
            <View className="flex-row items-center gap-3">
              <Icon as={AlarmClock} size={20} className="text-primary" />
              <View className="flex-1">
                <Text className="font-medium">Workout Reminder</Text>
                <Text className="text-sm text-muted-foreground">
                  Remind if no workout logged
                </Text>
              </View>
              <Switch
                checked={notifReminder}
                onCheckedChange={(v) => handleNotificationToggle(setNotifReminder, v)}
              />
            </View>
            {notifReminder && (
              <Pressable
                onPress={() => setShowReminderPicker(true)}
                className="mt-3 ml-8 flex-row items-center gap-2"
              >
                <Text className="text-sm text-muted-foreground">Time:</Text>
                <Text className="text-sm font-medium text-primary">
                  {formatTimeDisplay(notifReminderTime)}
                </Text>
              </Pressable>
            )}
            {notifReminder && showReminderPicker && (
              <DateTimePicker
                value={timeToDate(notifReminderTime)}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowReminderPicker(Platform.OS === "ios");
                  if (date) {
                    const h = String(date.getHours()).padStart(2, "0");
                    const m = String(date.getMinutes()).padStart(2, "0");
                    setNotifReminderTime(`${h}:${m}`);
                  }
                }}
              />
            )}
          </View>

          <Separator />

          {/* Morning Plan Notification */}
          <View className="px-4 py-4">
            <View className="flex-row items-center gap-3">
              <Icon as={Sunrise} size={20} className="text-primary" />
              <View className="flex-1">
                <Text className="font-medium">Morning Workout Plan</Text>
                <Text className="text-sm text-muted-foreground">
                  Today&apos;s scheduled workout
                </Text>
              </View>
              <Switch
                checked={notifMorningPlan}
                onCheckedChange={(v) => handleNotificationToggle(setNotifMorningPlan, v)}
              />
            </View>
            {notifMorningPlan && (
              <Pressable
                onPress={() => setShowMorningPicker(true)}
                className="mt-3 ml-8 flex-row items-center gap-2"
              >
                <Text className="text-sm text-muted-foreground">Time:</Text>
                <Text className="text-sm font-medium text-primary">
                  {formatTimeDisplay(notifMorningPlanTime)}
                </Text>
              </Pressable>
            )}
            {notifMorningPlan && showMorningPicker && (
              <DateTimePicker
                value={timeToDate(notifMorningPlanTime)}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowMorningPicker(Platform.OS === "ios");
                  if (date) {
                    const h = String(date.getHours()).padStart(2, "0");
                    const m = String(date.getMinutes()).padStart(2, "0");
                    setNotifMorningPlanTime(`${h}:${m}`);
                  }
                }}
              />
            )}
          </View>
        </View>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}

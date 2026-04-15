import { formatDuration } from "@/lib/format";
import { useSettingsStore } from "@/stores/settings-store";
import * as Notifications from "expo-notifications";
import { Alert, Linking } from "react-native";

// Fixed identifiers for managing notification lifecycle
export const IDENTIFIERS = {
  REST_TIMER: "rest-timer",
  POST_WORKOUT: "post-workout",
  DAILY_REMINDER: "daily-reminder",
  MORNING_PLAN: "morning-plan",
} as const;

// --- Permissions ---

export async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function getPermissionStatus(): Promise<
  "granted" | "denied" | "undetermined"
> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Ensure we have permission, requesting if undetermined. Returns true if granted.
 */
async function ensureGranted(): Promise<boolean> {
  const status = await getPermissionStatus();
  if (status === "granted") return true;
  if (status === "undetermined") return requestPermissions();
  return false;
}

/**
 * Request permission, showing an alert to open Settings if previously denied.
 * Returns true if permission is granted.
 */
export async function ensurePermission(): Promise<boolean> {
  const status = await getPermissionStatus();

  if (status === "granted") return true;

  if (status === "denied") {
    Alert.alert(
      "Notifications Disabled",
      "Enable notifications in your device settings to receive workout reminders.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }

  return requestPermissions();
}

// --- Rest Timer (Type 1) ---

// Tracks whether the active workout screen is currently visible. Used by the
// foreground notification handler to decide whether to suppress the rest-timer
// alert (the screen already shows the countdown + haptic, so no notification
// needed). When the user closes the workout to use other parts of the app,
// this flips to false and the notification fires normally.
let activeWorkoutVisible = false;

export function setActiveWorkoutVisible(visible: boolean): void {
  activeWorkoutVisible = visible;
}

export function isActiveWorkoutVisible(): boolean {
  return activeWorkoutVisible;
}

export async function scheduleRestTimerNotification(
  seconds: number,
): Promise<string | null> {
  const { notificationsRestTimerEnabled } = useSettingsStore.getState();
  if (!notificationsRestTimerEnabled) return null;

  const granted = await ensureGranted();
  if (!granted) return null;

  // Cancel any existing rest timer notification
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.REST_TIMER,
  ).catch(() => {});

  try {
    const id = await Notifications.scheduleNotificationAsync({
      identifier: IDENTIFIERS.REST_TIMER,
      content: {
        title: "Rest Complete",
        body: "Time to start your next set!",
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });
    return id;
  } catch (err) {
    console.error("[Notif] failed to schedule:", err);
    return null;
  }
}

export async function cancelRestTimerNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.REST_TIMER,
  ).catch(() => {});
}

// --- Post-Workout Summary (Type 2) ---

interface PostWorkoutParams {
  templateName: string;
  exerciseCount: number;
  completedSets: number;
  durationSeconds: number;
  delayMinutes: number;
}

export async function schedulePostWorkoutNotification(
  params: PostWorkoutParams,
): Promise<string | null> {
  const { notificationsPostWorkoutEnabled } = useSettingsStore.getState();
  if (!notificationsPostWorkoutEnabled) return null;

  if (!(await ensureGranted())) return null;

  // Cancel any existing post-workout notification
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.POST_WORKOUT,
  ).catch(() => {});

  const duration = formatDuration(params.durationSeconds);

  return Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.POST_WORKOUT,
    content: {
      title: "Great workout! 💪",
      body: `${params.templateName}: ${params.completedSets} sets across ${params.exerciseCount} exercises in ${duration}`,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: params.delayMinutes * 60,
    },
  });
}

// --- Daily Workout Reminder (Type 3) ---

export async function scheduleDailyWorkoutReminder(
  hour: number,
  minute: number,
): Promise<void> {
  const { notificationsReminderEnabled } = useSettingsStore.getState();
  if (!notificationsReminderEnabled) return;

  if (!(await ensureGranted())) return;

  // Cancel existing reminder before rescheduling
  await cancelDailyWorkoutReminder();

  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.DAILY_REMINDER,
    content: {
      title: "Don't forget your workout!",
      body: "You haven't logged a workout today. Let's go!",
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelDailyWorkoutReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.DAILY_REMINDER,
  ).catch(() => {});
}

/**
 * Cancel the daily reminder for the rest of today and reschedule it starting tomorrow.
 * This prevents a "you haven't worked out" reminder on days the user already worked out.
 */
export async function rescheduleReminderAfterWorkout(): Promise<void> {
  const { notificationsReminderEnabled, notificationsReminderTime } =
    useSettingsStore.getState();
  if (!notificationsReminderEnabled) return;

  const [hour, minute] = notificationsReminderTime.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;

  await cancelDailyWorkoutReminder();

  // Schedule a one-shot for tomorrow's reminder time, then restore the daily trigger
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hour, minute, 0, 0);
  const secondsUntilTomorrow = Math.max(
    1,
    Math.floor((tomorrow.getTime() - now.getTime()) / 1000),
  );

  // One-shot timer that fires tomorrow at the configured time
  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.DAILY_REMINDER,
    content: {
      title: "Don't forget your workout!",
      body: "You haven't logged a workout today. Let's go!",
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntilTomorrow,
    },
  });
}

// --- Morning Plan Notification (Type 4) ---

interface MorningPlanParams {
  hour: number;
  minute: number;
  workoutLabel: string;
  /** The date the workout is scheduled for, used to compute the correct fire time */
  targetDate: Date;
}

export async function scheduleMorningPlanNotification(
  params: MorningPlanParams,
): Promise<void> {
  const { notificationsMorningPlanEnabled } = useSettingsStore.getState();
  if (!notificationsMorningPlanEnabled) return;

  if (!(await ensureGranted())) return;

  await cancelMorningPlanNotification();

  // Schedule for the morning of the target date
  const now = new Date();
  const target = new Date(params.targetDate);
  target.setHours(params.hour, params.minute, 0, 0);

  // If the target time is in the past, skip scheduling
  if (target <= now) return;

  const secondsUntil = Math.max(
    1,
    Math.floor((target.getTime() - now.getTime()) / 1000),
  );

  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.MORNING_PLAN,
    content: {
      title: "Today's Workout 💪",
      body: `${params.workoutLabel} is on the schedule today. You got this!`,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
    },
  });
}

export async function cancelMorningPlanNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.MORNING_PLAN,
  ).catch(() => {});
}

// --- Utility ---

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

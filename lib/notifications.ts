import { formatDuration } from "@/lib/format";
import {
  clampReviewWeekday,
  decideProteinNudge,
  planDailyReminder,
} from "@/lib/notification-rules";
import { useNutritionGoalsStore } from "@/stores/nutrition-goals-store";
import { useSettingsStore } from "@/stores/settings-store";
import * as Notifications from "expo-notifications";
import { Alert, Linking } from "react-native";
import { format } from "date-fns";

// Fixed identifiers for managing notification lifecycle
export const IDENTIFIERS = {
  REST_TIMER: "rest-timer",
  POST_WORKOUT: "post-workout",
  DAILY_REMINDER: "daily-reminder",
  MORNING_PLAN: "morning-plan",
  WEEKLY_REVIEW: "weekly-review",
  PROTEIN_NUDGE: "protein-nudge",
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
  /** Optional AI coach feedback appended after the stats line */
  feedback?: string;
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
  const statsLine = `${params.templateName}: ${params.completedSets} sets across ${params.exerciseCount} exercises in ${duration}`;

  return Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.POST_WORKOUT,
    content: {
      title: "Great workout! 💪",
      body: params.feedback ? `${statsLine}\n${params.feedback}` : statsLine,
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

  // If a workout was already logged today and today's reminder hasn't fired
  // yet, skip today: schedule a one-shot for tomorrow instead of the DAILY
  // trigger. The next app launch (or settings change) re-arms DAILY.
  const { lastWorkoutLoggedDate } = useSettingsStore.getState();
  const now = new Date();
  const plan = planDailyReminder({ now, hour, minute, lastWorkoutLoggedDate });
  if (plan.kind === "one-shot-tomorrow") {
    await Notifications.scheduleNotificationAsync({
      identifier: IDENTIFIERS.DAILY_REMINDER,
      content: {
        title: "Don't forget your workout!",
        body: "You haven't logged a workout today. Let's go!",
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: plan.seconds,
      },
    });
    return;
  }

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
 * Record that a workout was logged today and re-arm the daily reminder with
 * suppression awareness. Records the date even when reminders are disabled —
 * the user may enable them later the same day.
 *
 * Delegates all scheduling to scheduleDailyWorkoutReminder, which:
 * - skips today and schedules a one-shot for tomorrow if a workout was logged
 *   today and the reminder hasn't fired yet, or
 * - falls through to the DAILY trigger otherwise.
 *
 * Accepted limitation: if the user never relaunches the app after the one-shot
 * fires, the DAILY trigger will not be restored until the next launch. iOS
 * offers no "daily starting two days from now" trigger without double-firing.
 */
export async function rescheduleReminderAfterWorkout(): Promise<void> {
  const { notificationsReminderEnabled, notificationsReminderTime } =
    useSettingsStore.getState();
  useSettingsStore.getState().setLastWorkoutLoggedDate(format(new Date(), "yyyy-MM-dd"));
  if (!notificationsReminderEnabled) return;
  const [hour, minute] = notificationsReminderTime.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
  await scheduleDailyWorkoutReminder(hour, minute);
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

// --- Weekly Review (Type 5) ---

interface WeeklyReviewParams {
  /** 0-6, 0 = Sunday (matches settings store) */
  day: number;
  hour: number;
  minute: number;
}

export async function scheduleWeeklyReviewNotification(
  params: WeeklyReviewParams,
): Promise<void> {
  // Cancel before any early return so the scheduled state always reflects
  // current settings — a previously scheduled notification must not survive
  // the setting being turned off or permission being revoked.
  await cancelWeeklyReviewNotification();

  const { notificationsWeeklyReviewEnabled } = useSettingsStore.getState();
  if (!notificationsWeeklyReviewEnabled) return;

  // Guard persisted state drift: expo-notifications requires weekday 1-7.
  const day = clampReviewWeekday(params.day);

  if (!(await ensureGranted())) return;

  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.WEEKLY_REVIEW,
    content: {
      title: "Your weekly training review is ready 📊",
      body: "See how your week stacked up and what to focus on next.",
      sound: "default",
      // Tapping routes to the review screen — handled by the notification
      // response listener in hooks/use-notification-setup.ts.
      data: { url: "/review" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      // expo-notifications weekday is 1-7 with 1 = Sunday; settings use 0-6.
      weekday: day + 1,
      hour: params.hour,
      minute: params.minute,
    },
  });
}

export async function cancelWeeklyReviewNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.WEEKLY_REVIEW,
  ).catch(() => {});
}

// --- Evening Protein Nudge (Type 7) ---

/**
 * Schedule (or cancel) the one-shot evening protein nudge for TODAY based on
 * the user's remaining protein. Callers pass the protein consumed so far today
 * (summed from the meal-log store) — this module deliberately does not import
 * the meal-log store to avoid a circular dependency (the store calls this
 * function after every meal-log change).
 *
 * Cancels and skips scheduling when any of these hold:
 * - the nudge is disabled (opt-in setting, default off)
 * - no protein goal is set (goal <= 0)
 * - the goal is already met
 * - the configured time has already passed today
 */
export async function recomputeProteinNudge(
  proteinConsumedToday: number,
): Promise<void> {
  const { notificationsProteinNudgeEnabled, notificationsProteinNudgeTime } =
    useSettingsStore.getState();
  const proteinGoal = useNutritionGoalsStore.getState().goals.protein;

  const [hour, minute] = notificationsProteinNudgeTime.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  if (Number.isFinite(hour) && Number.isFinite(minute)) {
    target.setHours(hour, minute, 0, 0);
  }

  const decision = decideProteinNudge({
    now,
    target,
    enabled: notificationsProteinNudgeEnabled,
    hour,
    minute,
    proteinGoal,
    proteinConsumedToday,
  });

  // Cancel first, before the skip/permission checks, so a previously
  // scheduled nudge never outlives the conditions that scheduled it
  // (stale copy/time after permission revocation or setting changes).
  await cancelProteinNudgeNotification();

  if (decision.kind === "skip") return;

  if (!(await ensureGranted())) return;

  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIERS.PROTEIN_NUDGE,
    content: {
      title: "Protein check-in 🥛",
      body: `You're ${decision.remaining}g short of your protein goal — a shake or Greek yogurt closes the gap.`,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: decision.secondsUntil,
    },
  });
}

export async function cancelProteinNudgeNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    IDENTIFIERS.PROTEIN_NUDGE,
  ).catch(() => {});
}

// --- Utility ---

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

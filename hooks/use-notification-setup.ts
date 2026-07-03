import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { format } from 'date-fns';
import { capture } from '@/lib/analytics';
import { useSettingsStore } from '@/stores/settings-store';
import { usePlanStore } from '@/stores/plan-store';
import { useHistoryStore } from '@/stores/history-store';
import {
  IDENTIFIERS,
  scheduleDailyWorkoutReminder,
  cancelDailyWorkoutReminder,
  scheduleMorningPlanNotification,
  cancelMorningPlanNotification,
  scheduleWeeklyReviewNotification,
  cancelWeeklyReviewNotification,
  recomputeStreakRiskNotification,
  cancelStreakRiskNotification,
  isActiveWorkoutVisible,
} from '@/lib/notifications';
import { getPlanDayDate, isToday, isTomorrow } from '@/lib/plan-dates';
import { collectPlanRestDates, computeStreak } from '@/lib/streaks';

/**
 * Cheap, render-free snapshot of the current streak, computed from the
 * history + plan stores (outside render, so this can run from an AppState
 * listener). Deliberately mirrors `hooks/use-stats.ts`'s streak computation
 * but omits external (Apple Health) workouts — that data comes from a Convex
 * query, which isn't available outside a React render. This can under-count
 * a streak kept alive only by synced workouts; the next render-scoped
 * evaluation (e.g. opening Stats) doesn't correct this notification
 * retroactively, but the notification itself just re-arms on the next
 * foreground/settings change, so the gap is self-healing and never causes a
 * false "streak broken" ping (the notification only ever tells the user to
 * train, never that they failed).
 */
function computeCurrentStreakSnapshot(): { currentStreak: number; todayCovered: boolean } {
  const { logs } = useHistoryStore.getState();
  const { activePlanWithDays } = usePlanStore.getState();
  const { weekStartDay } = useSettingsStore.getState();

  const workoutDates = new Set<string>();
  for (const log of logs) {
    workoutDates.add(format(new Date(log.startedAt), 'yyyy-MM-dd'));
  }

  const restDates =
    activePlanWithDays && activePlanWithDays.status === 'active'
      ? collectPlanRestDates(activePlanWithDays, weekStartDay)
      : new Set<string>();

  const streak = computeStreak({
    workoutDates,
    externalWorkoutDates: new Set(),
    restDates,
    today: format(new Date(), 'yyyy-MM-dd'),
  });

  return { currentStreak: streak.current, todayCovered: streak.todayCovered };
}

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const id = notification.request.identifier;
    // Only suppress rest-timer alerts when the active workout screen is on
    // screen (the timer UI + haptic are the cue). If the user closed the
    // workout to use other parts of the app, the notification should fire.
    const show = id !== IDENTIFIERS.REST_TIMER || !isActiveWorkoutVisible();
    return {
      shouldShowAlert: show,
      shouldPlaySound: show,
      shouldSetBadge: false,
      shouldShowBanner: show,
      shouldShowList: show,
    };
  },
});

/**
 * Hook that manages scheduling of recurring/plan-based notifications.
 * Should be mounted once in the SyncEngine when the user is authenticated.
 */
export function useNotificationSetup() {
  const didMount = useRef(false);

  // Subscribe to settings changes for daily reminder
  useEffect(() => {
    let prevEnabled = useSettingsStore.getState().notificationsReminderEnabled;
    let prevTime = useSettingsStore.getState().notificationsReminderTime;

    const unsub = useSettingsStore.subscribe((state) => {
      const { notificationsReminderEnabled: enabled, notificationsReminderTime: time } = state;
      if (enabled === prevEnabled && time === prevTime) return;
      prevEnabled = enabled;
      prevTime = time;

      if (!enabled) {
        cancelDailyWorkoutReminder();
        return;
      }

      const [hour, minute] = time.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        scheduleDailyWorkoutReminder(hour, minute);
      }
    });
    return unsub;
  }, []);

  // Subscribe to settings changes for weekly review notification
  useEffect(() => {
    let prevEnabled = useSettingsStore.getState().notificationsWeeklyReviewEnabled;
    let prevDay = useSettingsStore.getState().notificationsWeeklyReviewDay;
    let prevTime = useSettingsStore.getState().notificationsWeeklyReviewTime;

    const unsub = useSettingsStore.subscribe((state) => {
      const {
        notificationsWeeklyReviewEnabled: enabled,
        notificationsWeeklyReviewDay: day,
        notificationsWeeklyReviewTime: time,
      } = state;
      if (enabled === prevEnabled && day === prevDay && time === prevTime) return;
      prevEnabled = enabled;
      prevDay = day;
      prevTime = time;

      if (!enabled) {
        cancelWeeklyReviewNotification();
        return;
      }

      const [hour, minute] = time.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        scheduleWeeklyReviewNotification({ day, hour, minute });
      }
    });
    return unsub;
  }, []);

  // Arm/disarm the streak-risk notification: on mount, on every app
  // foreground (a new day may have started, or a workout may have been
  // logged elsewhere), and whenever its settings change.
  useEffect(() => {
    const recomputeStreakRisk = () => {
      const { notificationsStreakRiskEnabled } = useSettingsStore.getState();
      if (!notificationsStreakRiskEnabled) {
        cancelStreakRiskNotification();
        return;
      }
      recomputeStreakRiskNotification(computeCurrentStreakSnapshot());
    };

    recomputeStreakRisk();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recomputeStreakRisk();
    });

    let prevEnabled = useSettingsStore.getState().notificationsStreakRiskEnabled;
    let prevTime = useSettingsStore.getState().notificationsStreakRiskTime;
    const unsubSettings = useSettingsStore.subscribe((state) => {
      const { notificationsStreakRiskEnabled: enabled, notificationsStreakRiskTime: time } = state;
      if (enabled === prevEnabled && time === prevTime) return;
      prevEnabled = enabled;
      prevTime = time;
      recomputeStreakRisk();
    });

    return () => {
      subscription.remove();
      unsubSettings();
    };
  }, []);

  // Route notification taps that carry a deep link (e.g. weekly review →
  // /review). Handles both warm taps and the cold-start notification.
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      capture({ name: 'notification_opened', props: { identifier: response.notification.request.identifier } });

      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) {
        // Notification payloads are dynamic strings; Expo Router validates
        // the route at runtime (unknown paths fall through to not-found).
        router.push(url as Href);
      }
    };

    // Cold start: the tap that launched the app is delivered here, not to
    // the listener. Clear it afterwards so it isn't replayed.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    });

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, []);

  // Subscribe to settings + plan store changes for morning plan notification
  useEffect(() => {
    const scheduleMorning = () => {
      const { notificationsMorningPlanEnabled, notificationsMorningPlanTime, weekStartDay } =
        useSettingsStore.getState();

      if (!notificationsMorningPlanEnabled) {
        cancelMorningPlanNotification();
        return;
      }

      const activePlan = usePlanStore.getState().activePlanWithDays;
      if (!activePlan?.days || !activePlan.startDate) {
        cancelMorningPlanNotification();
        return;
      }

      // Find today's or tomorrow's pending workout day, tracking the actual date
      let targetDay = null;
      let targetDate: Date | null = null;
      for (const day of activePlan.days) {
        if (day.status !== 'pending' || !day.templateClientId) continue;
        const date = getPlanDayDate(activePlan.startDate, day.week, day.dayOfWeek, weekStartDay);
        if (isToday(date) || isTomorrow(date)) {
          targetDay = day;
          targetDate = date;
          break;
        }
      }

      if (!targetDay?.label || !targetDate) {
        cancelMorningPlanNotification();
        return;
      }

      const [hour, minute] = notificationsMorningPlanTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        scheduleMorningPlanNotification({ hour, minute, workoutLabel: targetDay.label, targetDate });
      }
    };

    // Schedule on mount
    scheduleMorning();

    // Re-schedule when settings change
    const unsubSettings = useSettingsStore.subscribe((state) => {
      // This fires on every state change, but scheduleMorning reads fresh state
      scheduleMorning();
    });

    const unsubPlan = usePlanStore.subscribe((state) => {
      scheduleMorning();
    });

    return () => {
      unsubSettings();
      unsubPlan();
    };
  }, []);

  // Schedule daily reminder on mount if enabled
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;

    const {
      notificationsReminderEnabled,
      notificationsReminderTime,
      notificationsWeeklyReviewEnabled,
      notificationsWeeklyReviewDay,
      notificationsWeeklyReviewTime,
    } = useSettingsStore.getState();

    if (notificationsReminderEnabled) {
      const [hour, minute] = notificationsReminderTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        scheduleDailyWorkoutReminder(hour, minute);
      }
    }

    if (notificationsWeeklyReviewEnabled) {
      const [hour, minute] = notificationsWeeklyReviewTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        scheduleWeeklyReviewNotification({
          day: notificationsWeeklyReviewDay,
          hour,
          minute,
        });
      }
    }
  }, []);
}

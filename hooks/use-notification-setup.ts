import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { usePlanStore } from '@/stores/plan-store';
import {
  IDENTIFIERS,
  scheduleDailyWorkoutReminder,
  cancelDailyWorkoutReminder,
  scheduleMorningPlanNotification,
  cancelMorningPlanNotification,
  isActiveWorkoutVisible,
} from '@/lib/notifications';
import { getPlanDayDate, isToday, isTomorrow } from '@/lib/plan-dates';

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

    const { notificationsReminderEnabled, notificationsReminderTime } =
      useSettingsStore.getState();

    if (notificationsReminderEnabled) {
      const [hour, minute] = notificationsReminderTime.split(':').map(Number);
      if (Number.isFinite(hour) && Number.isFinite(minute)) {
        scheduleDailyWorkoutReminder(hour, minute);
      }
    }
  }, []);
}

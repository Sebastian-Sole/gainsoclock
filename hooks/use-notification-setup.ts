import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { usePlanStore } from '@/stores/plan-store';
import {
  scheduleDailyWorkoutReminder,
  cancelDailyWorkoutReminder,
  scheduleMorningPlanNotification,
  cancelMorningPlanNotification,
} from '@/lib/notifications';
import { getPlanDayDate, isToday, isTomorrow } from '@/lib/plan-dates';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const id = notification.request.identifier;
    // Suppress rest timer notifications when app is in foreground (user can see the timer UI)
    const show = id !== 'rest-timer';
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
      if (hour !== undefined && minute !== undefined) {
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

      // Find today's or tomorrow's pending workout day
      let targetDay = null;
      for (const day of activePlan.days) {
        if (day.status !== 'pending' || !day.templateClientId) continue;
        const date = getPlanDayDate(activePlan.startDate, day.week, day.dayOfWeek, weekStartDay);
        if (isToday(date) || isTomorrow(date)) {
          targetDay = day;
          break;
        }
      }

      if (!targetDay?.label) {
        cancelMorningPlanNotification();
        return;
      }

      const [hour, minute] = notificationsMorningPlanTime.split(':').map(Number);
      if (hour !== undefined && minute !== undefined) {
        scheduleMorningPlanNotification({ hour, minute, workoutLabel: targetDay.label });
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
      if (hour !== undefined && minute !== undefined) {
        scheduleDailyWorkoutReminder(hour, minute);
      }
    }
  }, []);
}

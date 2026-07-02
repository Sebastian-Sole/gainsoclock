import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';

import type { WeekStartDay } from '@/lib/types';

export type WeightUnit = 'kg' | 'lbs';
export type DistanceUnit = 'km' | 'mi';

interface SettingsState {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultRestTime: number;
  hapticsEnabled: boolean;
  healthKitEnabled: boolean;
  healthImportEnabled: boolean;
  healthImportLastSyncAt: number | null; // epoch ms
  weekStartDay: WeekStartDay;
  prefillFromLastWorkout: boolean;
  defaultSetsCount: number;
  defaultRepsCount: number;
  customRangeFrom: string | null; // ISO string
  customRangeTo: string | null;   // ISO string

  // Notification settings
  notificationsRestTimerEnabled: boolean;
  notificationsPostWorkoutEnabled: boolean;
  notificationsPostWorkoutDelay: number; // minutes
  notificationsReminderEnabled: boolean;
  notificationsReminderTime: string; // "HH:mm"
  notificationsMorningPlanEnabled: boolean;
  notificationsMorningPlanTime: string; // "HH:mm"
  notificationsWeeklyReviewEnabled: boolean;
  notificationsWeeklyReviewDay: number; // 0-6, 0 = Sunday
  notificationsWeeklyReviewTime: string; // "HH:mm"
  notificationsProteinNudgeEnabled: boolean;
  notificationsProteinNudgeTime: string; // "HH:mm"
  notificationsStreakRiskEnabled: boolean;
  notificationsStreakRiskTime: string; // "HH:mm"

  // Exercise tracking
  rpeEnabled: boolean;

  // Local-only: tracks the date (YYYY-MM-DD, local time) of the most recent
  // workout log. Used by scheduleDailyWorkoutReminder to suppress the daily
  // nag on days the user has already worked out. Not synced to Convex.
  lastWorkoutLoggedDate: string | null;

  setWeightUnit: (unit: WeightUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setDefaultRestTime: (seconds: number) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setHealthKitEnabled: (enabled: boolean) => void;
  setHealthImportEnabled: (enabled: boolean) => void;
  setHealthImportLastSyncAt: (timestamp: number | null) => void;
  setWeekStartDay: (day: WeekStartDay) => void;
  setPrefillFromLastWorkout: (enabled: boolean) => void;
  setDefaultSetsCount: (count: number) => void;
  setDefaultRepsCount: (count: number) => void;
  setCustomRange: (from: Date, to: Date | null) => void;
  setNotificationsRestTimerEnabled: (enabled: boolean) => void;
  setNotificationsPostWorkoutEnabled: (enabled: boolean) => void;
  setNotificationsPostWorkoutDelay: (minutes: number) => void;
  setNotificationsReminderEnabled: (enabled: boolean) => void;
  setNotificationsReminderTime: (time: string) => void;
  setNotificationsMorningPlanEnabled: (enabled: boolean) => void;
  setNotificationsMorningPlanTime: (time: string) => void;
  setNotificationsWeeklyReviewEnabled: (enabled: boolean) => void;
  setNotificationsWeeklyReviewDay: (day: number) => void;
  setNotificationsWeeklyReviewTime: (time: string) => void;
  setNotificationsProteinNudgeEnabled: (enabled: boolean) => void;
  setNotificationsProteinNudgeTime: (time: string) => void;
  setNotificationsStreakRiskEnabled: (enabled: boolean) => void;
  setNotificationsStreakRiskTime: (time: string) => void;
  setRpeEnabled: (enabled: boolean) => void;
  setLastWorkoutLoggedDate: (date: string) => void;
  hydrateFromServer: (serverSettings: { weightUnit: string; distanceUnit: string; defaultRestTime: number; hapticsEnabled: boolean; weekStartDay?: string; prefillFromLastWorkout?: boolean; defaultSetsCount?: number; defaultRepsCount?: number; notificationsRestTimerEnabled?: boolean; notificationsPostWorkoutEnabled?: boolean; notificationsPostWorkoutDelay?: number; notificationsReminderEnabled?: boolean; notificationsReminderTime?: string; notificationsMorningPlanEnabled?: boolean; notificationsMorningPlanTime?: string; notificationsWeeklyReviewEnabled?: boolean; notificationsWeeklyReviewDay?: number; notificationsWeeklyReviewTime?: string; notificationsProteinNudgeEnabled?: boolean; notificationsProteinNudgeTime?: string; notificationsStreakRiskEnabled?: boolean; notificationsStreakRiskTime?: string; rpeEnabled?: boolean }) => void;
}

function syncSettings(state: SettingsState) {
  syncToConvex(api.settings.upsert, {
    weightUnit: state.weightUnit,
    distanceUnit: state.distanceUnit,
    defaultRestTime: state.defaultRestTime,
    hapticsEnabled: state.hapticsEnabled,
    weekStartDay: state.weekStartDay,
    prefillFromLastWorkout: state.prefillFromLastWorkout,
    defaultSetsCount: state.defaultSetsCount,
    defaultRepsCount: state.defaultRepsCount,
    notificationsRestTimerEnabled: state.notificationsRestTimerEnabled,
    notificationsPostWorkoutEnabled: state.notificationsPostWorkoutEnabled,
    notificationsPostWorkoutDelay: state.notificationsPostWorkoutDelay,
    notificationsReminderEnabled: state.notificationsReminderEnabled,
    notificationsReminderTime: state.notificationsReminderTime,
    notificationsMorningPlanEnabled: state.notificationsMorningPlanEnabled,
    notificationsMorningPlanTime: state.notificationsMorningPlanTime,
    notificationsWeeklyReviewEnabled: state.notificationsWeeklyReviewEnabled,
    notificationsWeeklyReviewDay: state.notificationsWeeklyReviewDay,
    notificationsWeeklyReviewTime: state.notificationsWeeklyReviewTime,
    notificationsProteinNudgeEnabled: state.notificationsProteinNudgeEnabled,
    notificationsProteinNudgeTime: state.notificationsProteinNudgeTime,
    notificationsStreakRiskEnabled: state.notificationsStreakRiskEnabled,
    notificationsStreakRiskTime: state.notificationsStreakRiskTime,
    rpeEnabled: state.rpeEnabled,
  });
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      weightUnit: 'kg',
      distanceUnit: 'km',
      defaultRestTime: 90,
      hapticsEnabled: true,
      healthKitEnabled: false,
      healthImportEnabled: false,
      healthImportLastSyncAt: null,
      prefillFromLastWorkout: true,
      defaultSetsCount: 3,
      defaultRepsCount: 10,
      weekStartDay: 'monday' as WeekStartDay,
      customRangeFrom: null,
      customRangeTo: null,
      notificationsRestTimerEnabled: true,
      notificationsPostWorkoutEnabled: true,
      notificationsPostWorkoutDelay: 30,
      notificationsReminderEnabled: true,
      notificationsReminderTime: '18:00',
      notificationsMorningPlanEnabled: true,
      notificationsMorningPlanTime: '07:00',
      notificationsWeeklyReviewEnabled: true,
      notificationsWeeklyReviewDay: 0,
      notificationsWeeklyReviewTime: '18:00',
      notificationsProteinNudgeEnabled: false,
      notificationsProteinNudgeTime: '19:30',
      notificationsStreakRiskEnabled: false,
      notificationsStreakRiskTime: '18:00',
      rpeEnabled: false,
      lastWorkoutLoggedDate: null,

      setWeightUnit: (unit) => {
        set({ weightUnit: unit });
        syncSettings(get());
      },

      setDistanceUnit: (unit) => {
        set({ distanceUnit: unit });
        syncSettings(get());
      },

      setDefaultRestTime: (seconds) => {
        set({ defaultRestTime: seconds });
        syncSettings(get());
      },

      setHapticsEnabled: (enabled) => {
        set({ hapticsEnabled: enabled });
        syncSettings(get());
      },

      setHealthKitEnabled: (enabled) => {
        set({ healthKitEnabled: enabled });
        // Not synced to Convex — Apple Health is a per-device setting
      },

      setHealthImportEnabled: (enabled) => {
        set({ healthImportEnabled: enabled });
        // Not synced to Convex — Apple Health is a per-device setting
      },

      setHealthImportLastSyncAt: (timestamp) => {
        set({ healthImportLastSyncAt: timestamp });
        // Not synced to Convex — per-device sync bookkeeping
      },

      setPrefillFromLastWorkout: (enabled) => {
        set({ prefillFromLastWorkout: enabled });
        syncSettings(get());
      },

      setDefaultSetsCount: (count) => {
        set({ defaultSetsCount: count });
        syncSettings(get());
      },

      setDefaultRepsCount: (count) => {
        set({ defaultRepsCount: count });
        syncSettings(get());
      },

      setWeekStartDay: (day) => {
        set({ weekStartDay: day });
        syncSettings(get());
      },

      setNotificationsRestTimerEnabled: (enabled) => {
        set({ notificationsRestTimerEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsPostWorkoutEnabled: (enabled) => {
        set({ notificationsPostWorkoutEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsPostWorkoutDelay: (minutes) => {
        set({ notificationsPostWorkoutDelay: minutes });
        syncSettings(get());
      },

      setNotificationsReminderEnabled: (enabled) => {
        set({ notificationsReminderEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsReminderTime: (time) => {
        set({ notificationsReminderTime: time });
        syncSettings(get());
      },

      setNotificationsMorningPlanEnabled: (enabled) => {
        set({ notificationsMorningPlanEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsMorningPlanTime: (time) => {
        set({ notificationsMorningPlanTime: time });
        syncSettings(get());
      },

      setNotificationsWeeklyReviewEnabled: (enabled) => {
        set({ notificationsWeeklyReviewEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsWeeklyReviewDay: (day) => {
        set({ notificationsWeeklyReviewDay: day });
        syncSettings(get());
      },

      setNotificationsWeeklyReviewTime: (time) => {
        set({ notificationsWeeklyReviewTime: time });
        syncSettings(get());
      },

      setNotificationsStreakRiskEnabled: (enabled) => {
        set({ notificationsStreakRiskEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsStreakRiskTime: (time) => {
        set({ notificationsStreakRiskTime: time });
        syncSettings(get());
      },

      setNotificationsProteinNudgeEnabled: (enabled) => {
        set({ notificationsProteinNudgeEnabled: enabled });
        syncSettings(get());
      },

      setNotificationsProteinNudgeTime: (time) => {
        set({ notificationsProteinNudgeTime: time });
        syncSettings(get());
      },

      setRpeEnabled: (enabled) => {
        set({ rpeEnabled: enabled });
        syncSettings(get());
      },

      setLastWorkoutLoggedDate: (date) => {
        set({ lastWorkoutLoggedDate: date });
        // Not synced to Convex — per-device, local-clock concept
      },

      setCustomRange: (from, to) => {
        set({
          customRangeFrom: from.toISOString(),
          customRangeTo: to ? to.toISOString() : null,
        });
        // Not synced to Convex — per-device preference
      },

      hydrateFromServer: (serverSettings) => {
        set({
          weightUnit: serverSettings.weightUnit as WeightUnit,
          distanceUnit: serverSettings.distanceUnit as DistanceUnit,
          defaultRestTime: serverSettings.defaultRestTime,
          hapticsEnabled: serverSettings.hapticsEnabled,
          weekStartDay: (serverSettings.weekStartDay as WeekStartDay) ?? 'monday',
          prefillFromLastWorkout: serverSettings.prefillFromLastWorkout ?? true,
          defaultSetsCount: serverSettings.defaultSetsCount ?? 3,
          defaultRepsCount: serverSettings.defaultRepsCount ?? 10,
          notificationsRestTimerEnabled: serverSettings.notificationsRestTimerEnabled ?? true,
          notificationsPostWorkoutEnabled: serverSettings.notificationsPostWorkoutEnabled ?? true,
          notificationsPostWorkoutDelay: serverSettings.notificationsPostWorkoutDelay ?? 30,
          notificationsReminderEnabled: serverSettings.notificationsReminderEnabled ?? true,
          notificationsReminderTime: serverSettings.notificationsReminderTime ?? '18:00',
          notificationsMorningPlanEnabled: serverSettings.notificationsMorningPlanEnabled ?? true,
          notificationsMorningPlanTime: serverSettings.notificationsMorningPlanTime ?? '07:00',
          notificationsWeeklyReviewEnabled: serverSettings.notificationsWeeklyReviewEnabled ?? true,
          notificationsWeeklyReviewDay: serverSettings.notificationsWeeklyReviewDay ?? 0,
          notificationsWeeklyReviewTime: serverSettings.notificationsWeeklyReviewTime ?? '18:00',
          notificationsProteinNudgeEnabled: serverSettings.notificationsProteinNudgeEnabled ?? false,
          notificationsProteinNudgeTime: serverSettings.notificationsProteinNudgeTime ?? '19:30',
          notificationsStreakRiskEnabled: serverSettings.notificationsStreakRiskEnabled ?? false,
          notificationsStreakRiskTime: serverSettings.notificationsStreakRiskTime ?? '18:00',
          rpeEnabled: serverSettings.rpeEnabled ?? false,
        });
      },
    }),
    {
      name: 'settings-storage',
      storage: zustandStorage,
    }
  )
);

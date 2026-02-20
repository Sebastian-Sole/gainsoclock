import { useState, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  saveWorkoutToHealthKit,
  getLatestBodyWeight,
} from '@/lib/healthkit';
import type { WorkoutLog } from '@/lib/types';

export function useHealthKit() {
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
  const setHealthKitEnabled = useSettingsStore((s) => s.setHealthKitEnabled);

  const [isRequesting, setIsRequesting] = useState(false);

  const isAvailable = isHealthKitAvailable();

  const enable = useCallback(async () => {
    if (!isAvailable) return false;
    setIsRequesting(true);
    try {
      const granted = await requestHealthKitPermissions();
      if (granted) {
        setHealthKitEnabled(true);
      }
      return granted;
    } catch {
      return false;
    } finally {
      setIsRequesting(false);
    }
  }, [isAvailable, setHealthKitEnabled]);

  const disable = useCallback(() => {
    setHealthKitEnabled(false);
  }, [setHealthKitEnabled]);

  const syncWorkout = useCallback(
    async (log: WorkoutLog) => {
      if (!healthKitEnabled) return false;
      return saveWorkoutToHealthKit(log);
    },
    [healthKitEnabled]
  );

  return {
    isAvailable,
    isEnabled: healthKitEnabled,
    isRequesting,
    enable,
    disable,
    syncWorkout,
    getBodyWeight: getLatestBodyWeight,
  };
}

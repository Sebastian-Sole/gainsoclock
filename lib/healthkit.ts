import { Platform } from 'react-native';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkoutLog } from '@/lib/types';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

let cachedModule: HealthKitModule | null = null;
let loadFailed = false;

async function getHealthKit(): Promise<HealthKitModule | null> {
  if (loadFailed) return null;
  if (cachedModule) return cachedModule;

  try {
    cachedModule = await import('@kingstinct/react-native-healthkit');
    return cachedModule;
  } catch {
    // NitroModules not available (e.g. running in Expo Go)
    loadFailed = true;
    console.warn('[HealthKit] Native module unavailable — use a development build to enable Apple Health.');
    return null;
  }
}

export function isHealthKitAvailable(): boolean {
  return Platform.OS === 'ios';
}

function isEnabled(): boolean {
  return useSettingsStore.getState().healthKitEnabled;
}

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;

  const hk = await getHealthKit();
  if (!hk) return false;

  try {
    await hk.requestAuthorization({
      toRead: [
        'HKQuantityTypeIdentifierBodyMass',
        'HKQuantityTypeIdentifierHeight',
        'HKQuantityTypeIdentifierBodyFatPercentage',
      ],
      toShare: [
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKWorkoutTypeIdentifier',
      ],
    });
    return true;
  } catch (error) {
    console.warn('[HealthKit] Authorization failed:', error);
    return false;
  }
}

export async function saveWorkoutToHealthKit(
  log: WorkoutLog
): Promise<boolean> {
  if (!isHealthKitAvailable() || !isEnabled()) return false;

  const hk = await getHealthKit();
  if (!hk) return false;

  try {
    const startDate = new Date(log.startedAt);
    const endDate = new Date(log.completedAt);
    const estimatedCalories = estimateCaloriesBurned(log);

    await hk.saveWorkoutSample(
      hk.WorkoutActivityType.traditionalStrengthTraining,
      [
        {
          quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
          quantity: estimatedCalories,
          unit: 'kcal',
          startDate,
          endDate,
        },
      ],
      startDate,
      endDate,
      { energyBurned: estimatedCalories },
      { HKExternalUUID: log.id }
    );

    return true;
  } catch (error) {
    console.warn('[HealthKit] Failed to save workout:', error);
    return false;
  }
}

export async function getLatestBodyWeight(): Promise<{
  value: number;
  unit: string;
  date: Date;
} | null> {
  if (!isHealthKitAvailable() || !isEnabled()) return null;

  const hk = await getHealthKit();
  if (!hk) return null;

  try {
    const sample = await hk.getMostRecentQuantitySample(
      'HKQuantityTypeIdentifierBodyMass',
      'kg'
    );
    if (!sample) return null;
    return {
      value: sample.quantity,
      unit: sample.unit,
      date: new Date(sample.startDate),
    };
  } catch (error) {
    console.warn('[HealthKit] Failed to read body weight:', error);
    return null;
  }
}

function estimateCaloriesBurned(log: WorkoutLog): number {
  const minutes = log.durationSeconds / 60;
  const exerciseCount = log.exercises.length;
  const caloriesPerMinute = Math.min(5 + exerciseCount * 0.5, 10);
  return Math.round(minutes * caloriesPerMinute);
}

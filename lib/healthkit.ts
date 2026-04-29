// Scope set locked per app.json NSHealthShareUsageDescription /
// NSHealthUpdateUsageDescription. Changing this requires a legal + copy update
// (HealthKit-Privacy CR4). Reads: BodyMass, Height, BodyFatPercentage. Writes:
// ActiveEnergyBurned, WorkoutType. Never add age, sex, sleep, heart-rate,
// cycle, labs, or workout-history reads here without a matching plist update.
import { Platform } from 'react-native';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkoutLog } from '@/lib/types';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

type AuthorizationStatusString =
  | 'notDetermined'
  | 'sharingDenied'
  | 'sharingAuthorized'
  | 'sharingPartiallyAuthorized';

export type LatestHealthStats = {
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPercent: number | null;
};

export const HEALTHKIT_READ_SCOPES = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierBodyFatPercentage',
] as const;

export const HEALTHKIT_WRITE_SCOPES = [
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKWorkoutTypeIdentifier',
] as const;

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
      toRead: HEALTHKIT_READ_SCOPES,
      toShare: HEALTHKIT_WRITE_SCOPES,
    });
    return true;
  } catch (error) {
    console.warn('[HealthKit] Authorization failed:', error);
    return false;
  }
}

// Alias retained for plan-06's contract name; underlying behaviour is identical.
export const requestAuthorization = requestHealthKitPermissions;

// Combined status across the three read scopes. Apple exposes per-type status
// only for share (write) scopes; for reads we infer partial / full / denied by
// checking each read-type's share-status through `authorizationStatusFor`. This
// is best-effort — Apple deliberately hides read-grant granularity from apps.
export async function getAuthorizationStatus(): Promise<AuthorizationStatusString> {
  if (!isHealthKitAvailable()) return 'sharingDenied';
  const hk = await getHealthKit();
  if (!hk) return 'notDetermined';

  try {
    const statuses = HEALTHKIT_WRITE_SCOPES.map((id) =>
      hk.authorizationStatusFor(id)
    );
    const notDetermined = statuses.every((s) => s === hk.AuthorizationStatus.notDetermined);
    if (notDetermined) return 'notDetermined';
    const allDenied = statuses.every((s) => s === hk.AuthorizationStatus.sharingDenied);
    if (allDenied) return 'sharingDenied';
    const allAuthorized = statuses.every(
      (s) => s === hk.AuthorizationStatus.sharingAuthorized
    );
    if (allAuthorized) return 'sharingAuthorized';
    return 'sharingPartiallyAuthorized';
  } catch (error) {
    console.warn('[HealthKit] authorizationStatus check failed:', error);
    return 'notDetermined';
  }
}

async function readLatestQuantity(
  identifier: (typeof HEALTHKIT_READ_SCOPES)[number],
  unit: string
): Promise<number | null> {
  if (!isHealthKitAvailable()) return null;
  const hk = await getHealthKit();
  if (!hk) return null;
  try {
    // Performance #10: limit: 1 + descending sort. Do NOT remove "because
    // Apple sorts latest first anyway" — the query planner honours this.
    const samples = await hk.queryQuantitySamples(identifier, {
      limit: 1,
      ascending: false,
      unit,
    });
    const sample = samples[0];
    if (!sample) return null;
    return typeof sample.quantity === 'number' ? sample.quantity : null;
  } catch (error) {
    console.warn(`[HealthKit] read ${identifier} failed:`, error);
    return null;
  }
}

export async function getLatestStats(): Promise<LatestHealthStats> {
  if (!isHealthKitAvailable()) {
    return { weightKg: null, heightCm: null, bodyFatPercent: null };
  }

  const [weightKg, heightCm, bodyFatFraction] = await Promise.all([
    readLatestQuantity('HKQuantityTypeIdentifierBodyMass', 'kg'),
    readLatestQuantity('HKQuantityTypeIdentifierHeight', 'cm'),
    readLatestQuantity('HKQuantityTypeIdentifierBodyFatPercentage', '%'),
  ]);

  // HealthKit returns body fat as a fraction (0-1) when the unit is unspecified
  // but accepts `%` — the normalised fraction path is safer across iOS versions.
  const bodyFatPercent =
    bodyFatFraction == null
      ? null
      : bodyFatFraction <= 1
        ? bodyFatFraction * 100
        : bodyFatFraction;

  return {
    weightKg,
    heightCm,
    bodyFatPercent,
  };
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


// Plan-08 / HealthKit-Privacy C4 — account deletion cleanup. Removes every
// sample Fitbull has written (workouts + active energy) via the
// `HKExternalUUID` metadata we stamp at write time. Best-effort: if the user
// revoked HealthKit access before account deletion this will silently no-op.
export async function deleteAuthoredSamples(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;
  const hk = await getHealthKit();
  if (!hk) return false;

  try {
    const anyHk = hk as unknown as {
      deleteObjects?: (identifier: string, predicate?: unknown) => Promise<void>;
      deleteSamples?: (identifier: string, predicate?: unknown) => Promise<void>;
    };
    const identifiers = [
      "HKWorkoutTypeIdentifier",
      "HKQuantityTypeIdentifierActiveEnergyBurned",
    ];
    for (const id of identifiers) {
      if (typeof anyHk.deleteObjects === "function") {
        await anyHk.deleteObjects(id);
      } else if (typeof anyHk.deleteSamples === "function") {
        await anyHk.deleteSamples(id);
      }
    }
    return true;
  } catch (error) {
    console.warn("[HealthKit] deleteAuthoredSamples failed:", error);
    return false;
  }
}


// Rough estimate: strength training burns ~5-10 kcal/min depending on intensity.
// More exercises in a session suggests higher intensity, so we scale linearly and cap at 10.
function estimateCaloriesBurned(log: WorkoutLog): number {
  const minutes = log.durationSeconds / 60;
  const exerciseCount = log.exercises.length;
  const caloriesPerMinute = Math.min(5 + exerciseCount * 0.5, 10);
  return Math.round(minutes * caloriesPerMinute);
}

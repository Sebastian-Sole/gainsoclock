// Scope set locked per app.json NSHealthShareUsageDescription /
// NSHealthUpdateUsageDescription. Changing this requires a legal + copy update
// (HealthKit-Privacy CR4). Reads: BodyMass, Height, BodyFatPercentage, plus —
// added for the health-data-mesh feature — Workouts, SleepAnalysis,
// RestingHeartRate, HeartRateVariabilitySDNN, StepCount, ActiveEnergyBurned.
// The NSHealthShareUsageDescription in app.json was updated in the same change
// to honestly describe these reads; HealthKit-Privacy CR4 applies, so route
// any further scope change (and this one, before release) through legal/copy
// review. Writes: ActiveEnergyBurned, WorkoutType. Never add age, sex, cycle,
// or labs reads here without a matching plist + review update.
import { Platform } from 'react-native';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkoutLog } from '@/lib/types';
import type {
  QuantityTypeIdentifier,
  QueryStatisticsResponse,
} from '@kingstinct/react-native-healthkit';

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

// Baseline reads: requested at onboarding and by the main "Sync with Apple
// Health" toggle. The onboarding primer copy (app/onboarding/healthkit.tsx)
// describes exactly these — body stats prefill. 5.1.1(iv): the permission
// sheet shown during onboarding must never list scopes the primer doesn't
// explain, so import scopes are requested separately (below), only from the
// "Import workouts & health data" toggle whose copy describes them.
export const HEALTHKIT_BASELINE_READ_SCOPES = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierBodyFatPercentage',
] as const;

// Health-data-mesh read scopes (see scope-lock comment at the top).
export const HEALTHKIT_IMPORT_READ_SCOPES = [
  'HKWorkoutTypeIdentifier',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
] as const;

export const HEALTHKIT_READ_SCOPES = [
  ...HEALTHKIT_BASELINE_READ_SCOPES,
  ...HEALTHKIT_IMPORT_READ_SCOPES,
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
      toRead: HEALTHKIT_BASELINE_READ_SCOPES,
      toShare: HEALTHKIT_WRITE_SCOPES,
    });
    return true;
  } catch (error) {
    console.warn('[HealthKit] Authorization failed:', error);
    return false;
  }
}

// Incremental authorization for the import feature only. HealthKit allows
// requesting additional scopes after the initial grant; the sheet lists just
// the new types. Called from the "Import workouts & health data" toggle.
export async function requestHealthImportPermissions(): Promise<boolean> {
  if (!isHealthKitAvailable()) return false;

  const hk = await getHealthKit();
  if (!hk) return false;

  try {
    await hk.requestAuthorization({
      toRead: HEALTHKIT_IMPORT_READ_SCOPES,
      toShare: [],
    });
    return true;
  } catch (error) {
    console.warn('[HealthKit] Import authorization failed:', error);
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
  identifier: QuantityTypeIdentifier,
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


// ---------------------------------------------------------------------------
// Health-data-mesh read pipeline (external workouts + daily metrics)
// ---------------------------------------------------------------------------

/** A workout recorded by another app/device, shaped for
 * `api.healthData.upsertExternalWorkouts`. */
export type ExternalWorkoutSample = {
  healthKitUuid: string;
  activityType: string;
  sourceName: string;
  sourceBundleId?: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  activeEnergyKcal?: number;
  distanceMeters?: number;
  avgHeartRateBpm?: number;
};

/** Per-local-calendar-day health metrics, shaped for
 * `api.healthData.upsertDailyMetrics`. `date` is a local `YYYY-MM-DD` key. */
export type DailyHealthMetrics = {
  date: string;
  asleepSeconds?: number;
  restingHeartRateBpm?: number;
  hrvMs?: number;
  steps?: number;
  bodyMassKg?: number;
  activeEnergyKcal?: number;
};

const OWN_BUNDLE_ID_PREFIX = 'com.soleinnovations.fitbull';

// Workout distance lives under a per-activity quantity type; probe the common
// ones. Order matters — most workouts with distance are runs/walks or rides.
const DISTANCE_TYPE_IDENTIFIERS: readonly QuantityTypeIdentifier[] = [
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierDistanceWheelchair',
  'HKQuantityTypeIdentifierDistanceDownhillSnowSports',
];

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Query workouts recorded by other apps/devices in [from, to].
 * Excludes Fitbull-authored samples (our bundle id, or samples we stamped
 * with `HKExternalUUID` at write time in `saveWorkoutToHealthKit`).
 */
export async function queryExternalWorkouts(
  from: Date,
  to: Date
): Promise<ExternalWorkoutSample[]> {
  if (!isHealthKitAvailable() || !isEnabled()) return [];
  const hk = await getHealthKit();
  if (!hk) return [];

  let workouts;
  try {
    workouts = await hk.queryWorkoutSamples({
      filter: { date: { startDate: from, endDate: to } },
      limit: -1,
      ascending: true,
    });
  } catch (error) {
    console.warn('[HealthKit] queryWorkoutSamples failed:', error);
    return [];
  }

  const results: ExternalWorkoutSample[] = [];
  for (const workout of workouts) {
    try {
      let sourceName = 'Apple Health';
      let sourceBundleId: string | undefined;
      const source = workout.sourceRevision?.source;
      if (source?.name) sourceName = source.name;
      if (source?.bundleIdentifier) sourceBundleId = source.bundleIdentifier;

      // Drop self-authored samples: written by this app, or stamped with our
      // HKExternalUUID metadata at write time.
      if (sourceBundleId?.startsWith(OWN_BUNDLE_ID_PREFIX)) continue;
      if (workout.metadataExternalUUID) continue;
      const externalUuid = workout.metadata?.['HKExternalUUID'];
      if (typeof externalUuid === 'string' && externalUuid.length > 0) continue;

      const startedAt = new Date(workout.startDate).getTime();
      const endedAt = new Date(workout.endDate).getTime();
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) continue;

      const durationSeconds =
        workout.duration?.unit === 's' &&
        typeof workout.duration.quantity === 'number'
          ? Math.round(workout.duration.quantity)
          : Math.max(0, Math.round((endedAt - startedAt) / 1000));

      // Normalize the numeric activity-type enum to its readable name.
      const activityName: string | undefined =
        hk.WorkoutActivityType[workout.workoutActivityType];
      const activityType =
        typeof activityName === 'string' && activityName.length > 0
          ? activityName
          : 'other';

      // Per-workout statistics. getAllStatistics tells us which quantity
      // types exist so we only issue unit-overridden lookups for those.
      const allStats = await workout
        .getAllStatistics()
        .catch((): Record<string, QueryStatisticsResponse> | undefined => undefined);
      const hasStat = (id: QuantityTypeIdentifier) =>
        allStats == null || id in allStats;

      let activeEnergyKcal: number | undefined;
      if (hasStat('HKQuantityTypeIdentifierActiveEnergyBurned')) {
        const stat = await workout
          .getStatistic('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal')
          .catch(() => undefined);
        const kcal = stat?.sumQuantity?.quantity;
        if (typeof kcal === 'number' && kcal > 0) {
          activeEnergyKcal = Math.round(kcal);
        }
      }

      let avgHeartRateBpm: number | undefined;
      if (hasStat('HKQuantityTypeIdentifierHeartRate')) {
        const stat = await workout
          .getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min')
          .catch(() => undefined);
        const bpm = stat?.averageQuantity?.quantity;
        if (typeof bpm === 'number' && bpm > 0) {
          avgHeartRateBpm = Math.round(bpm);
        }
      }

      let distanceMeters: number | undefined;
      for (const id of DISTANCE_TYPE_IDENTIFIERS) {
        if (!hasStat(id)) continue;
        const stat = await workout.getStatistic(id, 'm').catch(() => undefined);
        const meters = stat?.sumQuantity?.quantity;
        if (typeof meters === 'number' && meters > 0) {
          distanceMeters = Math.round(meters);
          break;
        }
      }

      results.push({
        healthKitUuid: workout.uuid,
        activityType,
        sourceName,
        sourceBundleId,
        startedAt,
        endedAt,
        durationSeconds,
        activeEnergyKcal,
        distanceMeters,
        avgHeartRateBpm,
      });
    } catch (error) {
      console.warn('[HealthKit] Failed to map workout sample:', error);
    }
  }

  return results;
}

type DailyQuantityField = Exclude<keyof DailyHealthMetrics, 'date' | 'asleepSeconds'>;

const DAILY_QUANTITY_METRICS: readonly {
  field: DailyQuantityField;
  identifier: QuantityTypeIdentifier;
  statistic: 'cumulativeSum' | 'mostRecent';
  unit: string;
  round: boolean;
}[] = [
  {
    field: 'restingHeartRateBpm',
    identifier: 'HKQuantityTypeIdentifierRestingHeartRate',
    statistic: 'mostRecent',
    unit: 'count/min',
    round: true,
  },
  {
    field: 'hrvMs',
    identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    statistic: 'mostRecent',
    unit: 'ms',
    round: false,
  },
  {
    field: 'steps',
    identifier: 'HKQuantityTypeIdentifierStepCount',
    statistic: 'cumulativeSum',
    unit: 'count',
    round: true,
  },
  {
    field: 'bodyMassKg',
    identifier: 'HKQuantityTypeIdentifierBodyMass',
    statistic: 'mostRecent',
    unit: 'kg',
    round: false,
  },
  {
    field: 'activeEnergyKcal',
    identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    statistic: 'cumulativeSum',
    unit: 'kcal',
    round: true,
  },
];

/**
 * Aggregate health metrics per local calendar day in [from, to]. Each metric
 * is collected defensively: a failing metric logs a warning and yields
 * `undefined` for that field; this function never throws.
 */
export async function queryDailyMetrics(
  from: Date,
  to: Date
): Promise<DailyHealthMetrics[]> {
  if (!isHealthKitAvailable() || !isEnabled()) return [];
  const hk = await getHealthKit();
  if (!hk) return [];

  const byDate = new Map<string, DailyHealthMetrics>();
  const ensure = (dateKey: string): DailyHealthMetrics => {
    const existing = byDate.get(dateKey);
    if (existing) return existing;
    const created: DailyHealthMetrics = { date: dateKey };
    byDate.set(dateKey, created);
    return created;
  };

  // Quantity metrics via day-bucketed statistics-collection queries, anchored
  // to local midnight so buckets align with local calendar days.
  for (const metric of DAILY_QUANTITY_METRICS) {
    try {
      const responses = await hk.queryStatisticsCollectionForQuantity(
        metric.identifier,
        [metric.statistic],
        startOfLocalDay(from),
        { day: 1 },
        {
          filter: { date: { startDate: from, endDate: to } },
          unit: metric.unit,
        }
      );
      for (const response of responses) {
        const quantity =
          metric.statistic === 'cumulativeSum'
            ? response.sumQuantity
            : response.mostRecentQuantity;
        const value = quantity?.quantity;
        if (!response.startDate || typeof value !== 'number') continue;
        ensure(localDateKey(new Date(response.startDate)))[metric.field] =
          metric.round ? Math.round(value) : value;
      }
    } catch (error) {
      console.warn(`[HealthKit] daily metric ${metric.field} failed:`, error);
    }
  }

  // Sleep: sum the "asleep" category states (not inBed/awake), splitting each
  // sample's duration across the local calendar days it overlaps.
  try {
    const samples = await hk.queryCategorySamples(
      'HKCategoryTypeIdentifierSleepAnalysis',
      {
        filter: { date: { startDate: from, endDate: to } },
        limit: -1,
        ascending: true,
      }
    );
    const asleepValues = new Set<number>([
      hk.CategoryValueSleepAnalysis.asleepUnspecified,
      hk.CategoryValueSleepAnalysis.asleepCore,
      hk.CategoryValueSleepAnalysis.asleepDeep,
      hk.CategoryValueSleepAnalysis.asleepREM,
    ]);
    const sleepSecondsByDay = new Map<string, number>();
    for (const sample of samples) {
      if (typeof sample.value !== 'number' || !asleepValues.has(sample.value)) {
        continue;
      }
      const start = new Date(sample.startDate).getTime();
      const end = new Date(sample.endDate).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue;
      }
      let cursor = startOfLocalDay(new Date(start));
      while (cursor.getTime() < end) {
        const nextDay = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 1
        );
        const overlapMs =
          Math.min(end, nextDay.getTime()) - Math.max(start, cursor.getTime());
        if (overlapMs > 0) {
          const key = localDateKey(cursor);
          sleepSecondsByDay.set(
            key,
            (sleepSecondsByDay.get(key) ?? 0) + overlapMs / 1000
          );
        }
        cursor = nextDay;
      }
    }
    for (const [key, seconds] of sleepSecondsByDay) {
      ensure(key).asleepSeconds = Math.round(seconds);
    }
  } catch (error) {
    console.warn('[HealthKit] daily metric asleepSeconds failed:', error);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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

import type { ExerciseType, MetricId, WorkoutSet } from './types';

/**
 * Curated palette of composable metric primitives.
 *
 * An exercise composes an ordered list of these (`exercise.metrics`) instead of
 * carrying a single fixed `type`. Each primitive declares the flat `WorkoutSet`
 * field it reads/writes, how it's input, how it rolls up for stats, and whether
 * a higher/lower value is a PR. This registry is the single place a new metric
 * is defined — rendering, defaults, and stats all read from it.
 *
 * The palette is intentionally closed (no user-named fields) so data stays
 * comparable and stats stay general. See
 * docs/decisions/custom-exercise-metrics.md.
 */

// Flat WorkoutSet fields that hold a metric value.
export type MetricField =
  | 'reps'
  | 'weight'
  | 'time'
  | 'distance'
  | 'powerAvg'
  | 'heartRateAvg'
  | 'cadence'
  | 'calories'
  | 'speed'
  | 'paceSeconds';

// How the value is entered in the set row.
export type MetricInputKind =
  | 'integer' // whole number (reps, watts, bpm, cadence, kcal)
  | 'decimal' // fractional (weight, distance, speed)
  | 'duration' // h:m:s picker (seconds stored)
  | 'pace'; // mm:ss picker (seconds-per-unit stored)

// How the metric rolls up across a session's sets (see lib/stats.ts).
export type MetricAggregation = 'sum' | 'max' | 'avg' | 'none';

// Which direction is "better" for a personal record.
export type PrDirection = 'higher' | 'lower' | 'none';

export interface MetricSpec {
  id: MetricId;
  /** Full label, e.g. shown in chips and the customize screen. */
  label: string;
  /** Compact column header for the set table, e.g. "Watts". */
  columnLabel: string;
  /** Optional unit hint (e.g. "W", "bpm"). Undefined = unit comes from a user
   *  preference (weight/distance) or is implied by the column. */
  unit?: string;
  field: MetricField;
  inputKind: MetricInputKind;
  aggregation: MetricAggregation;
  prDirection: PrDirection;
  defaultValue: number;
  /** Increment for the −／＋ stepper in Focus Mode. Defaults by input kind. */
  step?: number;
}

export const METRICS: Record<MetricId, MetricSpec> = {
  reps: {
    id: 'reps',
    label: 'Reps',
    columnLabel: 'Reps',
    field: 'reps',
    inputKind: 'integer',
    aggregation: 'sum',
    prDirection: 'higher',
    defaultValue: 10,
  },
  weight: {
    id: 'weight',
    label: 'Weight',
    columnLabel: 'Weight',
    field: 'weight',
    inputKind: 'decimal',
    aggregation: 'none', // load; volume (weight×reps) is computed in stats
    prDirection: 'higher',
    defaultValue: 0,
    step: 2.5,
  },
  duration: {
    id: 'duration',
    label: 'Duration',
    columnLabel: 'Time',
    field: 'time',
    inputKind: 'duration',
    aggregation: 'sum',
    prDirection: 'higher',
    defaultValue: 0,
  },
  distance: {
    id: 'distance',
    label: 'Distance',
    columnLabel: 'Distance',
    field: 'distance',
    inputKind: 'decimal',
    aggregation: 'sum',
    prDirection: 'higher',
    defaultValue: 0,
  },
  power_avg: {
    id: 'power_avg',
    label: 'Avg power',
    columnLabel: 'Watts',
    unit: 'W',
    field: 'powerAvg',
    inputKind: 'integer',
    aggregation: 'avg',
    prDirection: 'higher',
    defaultValue: 0,
    step: 5,
  },
  heart_rate_avg: {
    id: 'heart_rate_avg',
    label: 'Avg heart rate',
    columnLabel: 'Avg HR',
    unit: 'bpm',
    field: 'heartRateAvg',
    inputKind: 'integer',
    aggregation: 'avg',
    prDirection: 'none',
    defaultValue: 0,
  },
  pace: {
    id: 'pace',
    label: 'Pace',
    columnLabel: 'Pace',
    field: 'paceSeconds',
    inputKind: 'pace',
    aggregation: 'avg',
    prDirection: 'lower',
    defaultValue: 0,
  },
  speed: {
    id: 'speed',
    label: 'Speed',
    columnLabel: 'Speed',
    field: 'speed',
    inputKind: 'decimal',
    aggregation: 'avg',
    prDirection: 'higher',
    defaultValue: 0,
  },
  cadence: {
    id: 'cadence',
    label: 'Cadence',
    columnLabel: 'Cadence',
    unit: 'spm',
    field: 'cadence',
    inputKind: 'integer',
    aggregation: 'avg',
    prDirection: 'higher',
    defaultValue: 0,
  },
  calories: {
    id: 'calories',
    label: 'Calories',
    columnLabel: 'Cal',
    unit: 'kcal',
    field: 'calories',
    inputKind: 'integer',
    aggregation: 'sum',
    prDirection: 'none',
    defaultValue: 0,
    step: 5,
  },
};

/** All metrics, in palette display order. */
export const METRIC_LIST: MetricSpec[] = [
  METRICS.weight,
  METRICS.reps,
  METRICS.duration,
  METRICS.distance,
  METRICS.pace,
  METRICS.speed,
  METRICS.power_avg,
  METRICS.heart_rate_avg,
  METRICS.cadence,
  METRICS.calories,
];

/** Keep the set row readable on a phone. */
export const MAX_METRICS_PER_EXERCISE = 5;

export function getMetricSpec(id: MetricId): MetricSpec {
  return METRICS[id];
}

/**
 * Unit override for metrics whose unit is a user preference (weight,
 * distance). Returns undefined for metrics with a fixed or implied unit —
 * callers fall back to the spec's `unit` or `columnLabel` as appropriate.
 */
export function metricUnitOverride(
  id: MetricId,
  weightUnit: string,
  distanceUnit: string
): string | undefined {
  if (id === 'weight') return weightUnit;
  if (id === 'distance') return distanceUnit;
  return undefined;
}

export function metricSpecs(ids: MetricId[]): MetricSpec[] {
  return ids.map((id) => METRICS[id]);
}

/** Read a metric's value off a flat set (undefined when unset). */
export function readMetricValue(set: WorkoutSet, id: MetricId): number | undefined {
  return set[METRICS[id].field];
}

/**
 * A single-field WorkoutSet patch, typed exhaustively so callers avoid `as`
 * casts on a dynamic key. Used by the default-set factory and the set row.
 */
export function metricUpdate(field: MetricField, value: number | undefined): Partial<WorkoutSet> {
  switch (field) {
    case 'reps':
      return { reps: value };
    case 'weight':
      return { weight: value };
    case 'time':
      return { time: value };
    case 'distance':
      return { distance: value };
    case 'powerAvg':
      return { powerAvg: value };
    case 'heartRateAvg':
      return { heartRateAvg: value };
    case 'cadence':
      return { cadence: value };
    case 'calories':
      return { calories: value };
    case 'speed':
      return { speed: value };
    case 'paceSeconds':
      return { paceSeconds: value };
  }
}

/**
 * The metrics a legacy `type` maps to. New exercises store `type: 'metrics'`
 * and their own list; the six legacy types are mapped here (migration +
 * defensive read fallback). 'intervals' has no flat metric list.
 */
export function metricsForLegacyType(type: ExerciseType): MetricId[] {
  switch (type) {
    case 'reps_weight':
      return ['weight', 'reps'];
    case 'reps_time':
      return ['duration', 'reps'];
    case 'time_only':
      return ['duration'];
    case 'time_distance':
      return ['duration', 'distance'];
    case 'reps_only':
      return ['reps'];
    case 'intervals':
    case 'metrics':
      return [];
  }
}

/**
 * Resolve an exercise's effective metric list. Prefers the stored `metrics`;
 * falls back to the legacy-type mapping for un-migrated data.
 */
export function resolveExerciseMetrics(
  type: ExerciseType,
  metrics: MetricId[] | undefined
): MetricId[] {
  if (metrics && metrics.length > 0) return metrics;
  return metricsForLegacyType(type);
}

const EXERCISE_TYPES: ExerciseType[] = [
  'reps_weight',
  'reps_time',
  'time_only',
  'time_distance',
  'reps_only',
  'intervals',
  'metrics',
];

export function isExerciseType(t: string): t is ExerciseType {
  return (EXERCISE_TYPES as string[]).includes(t);
}

function isMetricId(m: string): m is MetricId {
  return Object.prototype.hasOwnProperty.call(METRICS, m);
}

/** Keep only recognized metric ids from an untyped list (server hydration).
 *  De-duped, order preserved — same behavior as convex/metricsMap.ts's copy
 *  (guarded by lib/metrics-map-drift.test.ts). */
export function coerceMetricIds(input: readonly string[] | undefined): MetricId[] {
  const seen = new Set<string>();
  const out: MetricId[] = [];
  for (const m of input ?? []) {
    if (isMetricId(m) && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * Loose variant of resolveExerciseMetrics for the server-hydration boundary,
 * where `type`/`metrics` arrive as plain strings. Filters to valid metric ids,
 * falling back to the legacy-type mapping.
 */
export function resolveExerciseMetricsLoose(
  type: string,
  metrics: readonly string[] | undefined
): MetricId[] {
  const valid = coerceMetricIds(metrics);
  if (valid.length > 0) return valid;
  return isExerciseType(type) ? metricsForLegacyType(type) : [];
}

export interface ExercisePreset {
  id: string;
  label: string;
  icon: string; // lucide-react-native icon name
  description: string;
  metrics: MetricId[];
  /** Intervals is a standalone special case, not a flat metric list. */
  isIntervals?: boolean;
}

/**
 * User-facing presets for the create flow. Each maps to a metric list (or the
 * intervals special case). "Custom" starts empty and the user composes.
 */
export const EXERCISE_PRESETS: ExercisePreset[] = [
  {
    id: 'strength',
    label: 'Strength',
    icon: 'Dumbbell',
    description: 'Weight & reps',
    metrics: ['weight', 'reps'],
  },
  {
    id: 'bodyweight',
    label: 'Bodyweight',
    icon: 'Repeat',
    description: 'Reps only',
    metrics: ['reps'],
  },
  {
    id: 'watts_bike',
    label: 'Watts Bike',
    icon: 'Zap',
    description: 'Duration, watts, distance, heart rate',
    metrics: ['duration', 'power_avg', 'distance', 'heart_rate_avg'],
  },
  {
    id: 'rowing',
    label: 'Rowing',
    icon: 'Waves',
    description: 'Duration, distance, split, heart rate',
    metrics: ['duration', 'distance', 'pace', 'heart_rate_avg'],
  },
  {
    id: 'running',
    label: 'Running',
    icon: 'Footprints',
    description: 'Duration, distance, pace, heart rate',
    metrics: ['duration', 'distance', 'pace', 'heart_rate_avg'],
  },
  {
    id: 'cycling',
    label: 'Cycling',
    icon: 'Bike',
    description: 'Duration, distance, speed, heart rate',
    metrics: ['duration', 'distance', 'speed', 'heart_rate_avg'],
  },
  {
    id: 'timed',
    label: 'Timed',
    icon: 'Clock',
    description: 'Duration only',
    metrics: ['duration'],
  },
  {
    id: 'intervals',
    label: 'Intervals',
    icon: 'Activity',
    description: 'Work / rest pairs with pace, distance, or speed',
    metrics: [],
    isIntervals: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: 'SlidersHorizontal',
    description: 'Pick your own metrics',
    metrics: [],
  },
];

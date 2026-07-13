import type { ExerciseType, MetricId } from './types';
import { METRICS, resolveExerciseMetrics } from './metrics';

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatWeight(weight: number, unit: 'kg' | 'lbs'): string {
  return `${weight} ${unit}`;
}

export function formatDistance(distance: number, unit: 'km' | 'mi'): string {
  return `${distance} ${unit}`;
}

/** Parses "82,3" or "82.3" → 82.3. Returns null on invalid / empty. */
export function parseLocaleNumber(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const normalised = trimmed.replace(',', '.');
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

function boundedParse(
  input: string,
  min: number,
  max: number,
  integerOnly = false,
): number | null {
  const n = parseLocaleNumber(input);
  if (n === null) return null;
  if (integerOnly && !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** Weight in kg, bounded 30-250. */
export function parseWeightKg(input: string): number | null {
  return boundedParse(input, 30, 250);
}

/** Height in cm, bounded 120-230. */
export function parseHeightCm(input: string): number | null {
  return boundedParse(input, 120, 230);
}

/** Age in years, integer, bounded 16-100. */
export function parseAgeYears(input: string): number | null {
  return boundedParse(input, 16, 100, true);
}

const LEGACY_TYPE_LABELS: Record<Exclude<ExerciseType, 'metrics'>, string> = {
  reps_weight: 'Reps & Weight',
  reps_time: 'Reps & Time',
  time_only: 'Time Only',
  time_distance: 'Time & Distance',
  reps_only: 'Reps Only',
  intervals: 'Intervals',
};

/**
 * Short label for an exercise. Legacy types keep their fixed names; composed
 * ('metrics') exercises derive a label from their metric list (e.g.
 * "Duration · Avg power · Distance · Avg heart rate").
 */
export function exerciseTypeLabel(type: ExerciseType, metrics?: MetricId[]): string {
  if (type !== 'metrics') return LEGACY_TYPE_LABELS[type];
  const resolved = resolveExerciseMetrics(type, metrics);
  if (resolved.length === 0) return 'Custom';
  return resolved.map((m) => METRICS[m].label).join(' · ');
}

/** Format pace seconds as "m:ss" (e.g., 330 → "5:30"). */
export function formatPace(paceSeconds: number): string {
  const mins = Math.floor(paceSeconds / 60);
  const secs = Math.round(paceSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Human-readable value for a registry metric — used by stats PB rows and
 * progression charts. Unit-preference metrics (weight, distance, pace, speed)
 * take the user's units; the rest fall back to the spec's fixed unit.
 */
export function formatMetricValue(
  id: MetricId,
  value: number,
  weightUnit: 'kg' | 'lbs',
  distanceUnit: 'km' | 'mi'
): string {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  switch (id) {
    case 'weight':
      return formatWeight(round1(value), weightUnit);
    case 'distance':
      return formatDistance(round1(value), distanceUnit);
    case 'duration':
      return formatTime(Math.round(value));
    case 'pace':
      return `${formatPace(value)} /${distanceUnit}`;
    case 'speed':
      return `${round1(value)} ${distanceUnit}/h`;
    case 'reps':
      return `${Math.round(value)} reps`;
    default: {
      const unit = METRICS[id].unit;
      const rounded = Math.round(value);
      return unit ? `${rounded} ${unit}` : String(rounded);
    }
  }
}

import { formatWeight } from '@/lib/format';
import type { WeightUnit } from '@/stores/settings-store';

// kg is the unit HealthKit + healthDailyMetrics store body mass in; convert
// only at the display boundary so stored/queried values stay unit-agnostic.
export const LBS_PER_KG = 2.20462;

export interface BodyWeightPoint {
  date: string; // "YYYY-MM-DD"
  kg: number;
}

export interface BodyWeightTrend {
  /** Non-null points, ascending by date — the series to render. */
  points: BodyWeightPoint[];
  latestKg: number;
  latestDate: string;
  /**
   * Change vs the most recent point at or before 30 days prior to the
   * latest point. `null` when no point is old enough to compare against
   * (e.g. HealthKit sync just started).
   */
  deltaKg: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Reduces raw daily-metric rows (as returned by
 * `api.healthData.listDailyMetrics`) to a body-weight trend: the sorted
 * non-null series, the latest reading, and the delta vs ~30 days earlier.
 * Returns `null` when there are zero non-null `bodyMassKg` points — the
 * caller should render nothing in that case (most users without HealthKit
 * import enabled will have none).
 */
export function computeBodyWeightTrend(
  rows: readonly { date: string; bodyMassKg?: number }[]
): BodyWeightTrend | null {
  const points: BodyWeightPoint[] = rows
    .filter(
      (r): r is { date: string; bodyMassKg: number } =>
        r.bodyMassKg !== undefined
    )
    .map((r) => ({ date: r.date, kg: r.bodyMassKg }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const cutoffMs =
    Date.parse(`${latest.date}T00:00:00Z`) - 30 * 24 * 60 * 60 * 1000;

  // Most recent point at or before the 30-day-ago cutoff (dates sort
  // lexicographically the same as chronologically for "YYYY-MM-DD").
  let baseline: BodyWeightPoint | null = null;
  for (const p of points) {
    if (Date.parse(`${p.date}T00:00:00Z`) <= cutoffMs) {
      baseline = p;
    }
  }

  return {
    points,
    latestKg: latest.kg,
    latestDate: latest.date,
    deltaKg: baseline ? round1(latest.kg - baseline.kg) : null,
  };
}

export function convertKgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kg * LBS_PER_KG : kg;
}

/** Formats a kg value in the user's preferred unit, rounded to 1 decimal. */
export function formatBodyWeightKg(kg: number, unit: WeightUnit): string {
  return formatWeight(round1(convertKgToUnit(kg, unit)), unit);
}

/**
 * Formats a kg delta with an explicit sign (e.g. "+1.2 kg" / "-0.5 kg"),
 * converted to the user's preferred unit.
 */
export function formatBodyWeightDeltaKg(
  deltaKg: number,
  unit: WeightUnit
): string {
  const converted = round1(convertKgToUnit(deltaKg, unit));
  const sign = converted > 0 ? '+' : '';
  return `${sign}${formatWeight(converted, unit)}`;
}

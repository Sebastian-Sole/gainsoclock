import type { DailyHealthMetrics } from '@/lib/healthkit';

export interface WeeklyActiveEnergyEstimate {
  /** Estimated calories burned per week, scaled from the average present day. */
  weeklyCalsBurned: number;
  /** False when no day in the input had `activeEnergyKcal` data — caller
   * should fall back to a default activity multiplier. */
  hasData: boolean;
}

/**
 * Derive a weekly active-energy-burned estimate from a run of daily HealthKit
 * metrics (see `queryDailyMetrics` in `lib/healthkit.ts`). Averages over only
 * the days that have `activeEnergyKcal` present (a day can be missing the
 * field if the underlying HealthKit query failed or there's no data yet),
 * then scales that per-day average to a 7-day week.
 */
export function estimateWeeklyActiveEnergy(
  dailyMetrics: Pick<DailyHealthMetrics, 'activeEnergyKcal'>[]
): WeeklyActiveEnergyEstimate {
  const daysWithEnergy = dailyMetrics.filter(
    (d): d is { activeEnergyKcal: number } =>
      typeof d.activeEnergyKcal === 'number' && d.activeEnergyKcal >= 0
  );

  if (daysWithEnergy.length === 0) {
    return { weeklyCalsBurned: 0, hasData: false };
  }

  const avgPerDay =
    daysWithEnergy.reduce((sum, d) => sum + d.activeEnergyKcal, 0) /
    daysWithEnergy.length;

  return { weeklyCalsBurned: Math.round(avgPerDay * 7), hasData: true };
}

import { format, differenceInCalendarDays, isLeapYear, getDayOfYear, subDays } from 'date-fns';
import { METRICS, METRIC_LIST, readMetricValue } from './metrics';
import type { MetricId, WorkoutLog, WorkoutSet } from './types';

// ---- Date range types ----

export type PresetKey = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

export interface DateRangeFilter {
  preset: PresetKey;
  from: Date | null; // null = unbounded start
  to: Date | null;   // null = unbounded end (today)
}

export const PRESET_OPTIONS: { key: PresetKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '1y', label: '1Y' },
  { key: 'custom', label: 'Custom' },
];

export function presetToDateRange(preset: PresetKey, now: Date): DateRangeFilter {
  if (preset === 'all') return { preset, from: null, to: null };
  if (preset === 'custom') return { preset, from: null, to: null };

  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  return { preset, from: subDays(now, daysMap[preset]), to: null };
}

export function filterLogsByDateRange(logs: WorkoutLog[], filter: DateRangeFilter): WorkoutLog[] {
  if (!filter.from && !filter.to) return logs;

  return logs.filter((log) => {
    const logDate = new Date(log.startedAt);
    if (filter.from && logDate < filter.from) return false;
    if (filter.to) {
      // Include the entire "to" day
      const endOfDay = new Date(filter.to);
      endOfDay.setHours(23, 59, 59, 999);
      if (logDate > endOfDay) return false;
    }
    return true;
  });
}

// ---- Return types ----

/** A dated value — a personal best or one point of a progression series. */
export interface MetricValuePoint {
  value: number;
  date: string;
}

/**
 * Per-exercise stats, keyed by the metrics registry (lib/metrics.ts) rather
 * than fixed weight/reps/time/distance fields. Everything is driven by each
 * MetricSpec's declared `aggregation` and `prDirection`, so adding a metric to
 * the registry surfaces here with no change to this file.
 */
export interface ExerciseStats {
  exerciseName: string;
  exerciseId: string;
  totalAppearances: number;
  totalSets: number;
  /**
   * Metrics observed on this exercise's completed sets (a value was actually
   * recorded), in registry palette order. Observed — not the exercise's
   * declared list — so legacy logs whose declared metrics drifted from the
   * data still chart what was really logged.
   */
  metricIds: MetricId[];
  /** Lifetime totals for metrics whose aggregation is 'sum' (reps, duration,
   *  distance, calories, …). Absent key = never recorded. */
  totals: Partial<Record<MetricId, number>>;
  /** Best single completed set per metric. Respects the metric's
   *  `prDirection` — for 'lower' metrics (pace) best means minimum; metrics
   *  with prDirection 'none' never appear. */
  bests: Partial<Record<MetricId, MetricValuePoint>>;
  /** Derived volume (weight × reps) — not a registry metric. */
  totalVolume: number; // lifetime sum of reps × weight
  maxVolume?: MetricValuePoint; // best single-set reps × weight
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  longestStreakStart: string;
  longestStreakEnd: string;
  /**
   * Whether today already has a workout (Fitbull log or synced external).
   * Today not yet covered doesn't break the streak (grace until midnight)
   * but doesn't count either. Streaks are computed exclusively in
   * `hooks/use-stats.ts` via `lib/streaks.ts`; this field is always set
   * there.
   */
  todayCovered?: boolean;
  /**
   * Whether the current streak includes days covered only by synced
   * external workouts. Set by `hooks/use-stats.ts`.
   */
  includesExternal?: boolean;
}

export interface MonthRecord {
  year: number;
  month: number; // 0-indexed
  label: string; // "January 2025"
  workoutDays: number;
}

export interface YearRecord {
  year: number;
  workoutDays: number;
}

export interface CurrentYearStats {
  year: number;
  daysTrained: number;
  totalDaysSoFar: number;
  percentage: number;
  predictedTotal: number;
  daysInYear: number;
}

export interface TotalStats {
  totalWeightLifted: number;
  totalDistance: number;
  totalTimeSeconds: number;
  totalSets: number;
  totalReps: number;
  totalWorkouts: number;
}

export interface AverageStats {
  avgWorkoutDuration: number; // seconds
  avgSetsPerWorkout: number;
  avgExercisesPerWorkout: number;
  workoutsPerWeek: number;
}

export interface FavoriteStats {
  mostUsedExercise?: { name: string; count: number };
  favoriteTemplate?: { name: string; count: number };
  mostActiveWeekday?: { day: string; count: number };
  mostActiveHour?: { hour: string; count: number };
}

export interface AllStats {
  exerciseStats: ExerciseStats[];
  streaks: StreakStats;
  bestMonth: MonthRecord | null;
  bestYear: YearRecord | null;
  currentYear: CurrentYearStats;
  totals: TotalStats;
  averages: AverageStats;
  favorites: FavoriteStats;
}

// ---- Helpers ----

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Interval 'rest' sub-sets contribute nothing to totals (legacy behavior). */
function isRestInterval(set: WorkoutSet): boolean {
  return set.type === 'intervals' && set.variant === 'rest';
}

/**
 * Whether a stored metric value on this set should be read at all. Interval
 * sets keep stale values on the flat shape when the user switches their
 * effort metric (distance ↔ pace ↔ speed), so those three only count when
 * they are the selected interval metric — matching the pre-flat per-type
 * behavior for distance, extended symmetrically to pace/speed.
 */
function metricCounts(set: WorkoutSet, id: MetricId): boolean {
  if (set.type !== 'intervals') return true;
  const selected = set.metric ?? 'distance';
  if (id === 'distance' || id === 'pace' || id === 'speed') return selected === id;
  return true;
}

// ---- Session totals (shared with the workout summary screen) ----

export interface SessionTotals {
  /** Sum of weight × reps over completed sets, in the user's display unit. */
  volume: number;
  distance: number;
  reps: number;
  /** Summed per-set time (seconds), not wall-clock duration. */
  time: number;
}

/** Totals for one in-progress or finished session's exercises. Completed
 *  sets only, with the same rest-interval and stale-distance exclusions as
 *  the aggregate stats. */
export function sessionTotals(exercises: readonly { sets: WorkoutSet[] }[]): SessionTotals {
  const totals: SessionTotals = { volume: 0, distance: 0, reps: 0, time: 0 };
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.completed || isRestInterval(set)) continue;
      const reps = readMetricValue(set, 'reps');
      const time = readMetricValue(set, 'duration');
      const distance = readMetricValue(set, 'distance');
      const weight = readMetricValue(set, 'weight');
      if (reps !== undefined) totals.reps += reps;
      if (time !== undefined) totals.time += time;
      if (distance !== undefined && metricCounts(set, 'distance')) totals.distance += distance;
      if (weight !== undefined && reps !== undefined) {
        totals.volume += weight * reps;
      }
    }
  }
  return totals;
}

// ---- Computation functions ----

function computeExerciseStats(logs: WorkoutLog[]): ExerciseStats[] {
  const exerciseMap = new Map<string, ExerciseStats>();
  const seenMetrics = new Map<string, Set<MetricId>>();

  for (const log of logs) {
    const logDate = log.startedAt;

    for (const exercise of log.exercises) {
      let stats = exerciseMap.get(exercise.exerciseId);
      if (!stats) {
        stats = {
          exerciseName: exercise.name,
          exerciseId: exercise.exerciseId,
          totalAppearances: 0,
          totalSets: 0,
          metricIds: [],
          totals: {},
          bests: {},
          totalVolume: 0,
        };
        exerciseMap.set(exercise.exerciseId, stats);
        seenMetrics.set(exercise.exerciseId, new Set());
      }
      const seen = seenMetrics.get(exercise.exerciseId)!;
      stats.totalAppearances++;

      for (const set of exercise.sets) {
        if (!set.completed) continue;
        stats.totalSets++;

        // Sets are flat: read whichever registry metrics are present, driven
        // by each spec's declared aggregation/prDirection.
        for (const spec of METRIC_LIST) {
          const value = readMetricValue(set, spec.id);
          if (value === undefined || !metricCounts(set, spec.id)) continue;
          seen.add(spec.id);

          // Totals: 'sum' metrics only. Interval 'rest' sub-sets contribute
          // nothing to totals (legacy behavior) but still feed PBs, matching
          // the pre-registry code path.
          if (spec.aggregation === 'sum' && !isRestInterval(set)) {
            stats.totals[spec.id] = (stats.totals[spec.id] ?? 0) + value;
          }

          // Personal bests, per prDirection. 'lower' metrics (pace) treat the
          // minimum as best and ignore non-positive placeholder values — a
          // 0:00 pace is an unset default, not a record.
          if (spec.prDirection === 'none') continue;
          if (spec.prDirection === 'lower' && value <= 0) continue;
          const current = stats.bests[spec.id];
          const better =
            !current ||
            (spec.prDirection === 'higher'
              ? value > current.value
              : value < current.value);
          if (better) {
            stats.bests[spec.id] = { value, date: logDate };
          }
        }

        // Volume (weight × reps) is derived, not a registry metric.
        const weight = readMetricValue(set, 'weight');
        const reps = readMetricValue(set, 'reps');
        if (weight !== undefined && reps !== undefined) {
          const volume = reps * weight;
          if (!isRestInterval(set)) stats.totalVolume += volume;
          if (!stats.maxVolume || volume > stats.maxVolume.value) {
            stats.maxVolume = { value: volume, date: logDate };
          }
        }
      }
    }
  }

  for (const stats of exerciseMap.values()) {
    const seen = seenMetrics.get(stats.exerciseId)!;
    stats.metricIds = METRIC_LIST.filter((spec) => seen.has(spec.id)).map(
      (spec) => spec.id
    );
  }

  return Array.from(exerciseMap.values()).sort(
    (a, b) => b.totalAppearances - a.totalAppearances
  );
}

// ---- Progression series (per exercise, per metric) ----

/** Chronological dated points for one exercise, keyed by metric. */
export type ExerciseMetricSeries = Partial<Record<MetricId, MetricValuePoint[]>>;

/**
 * Dated progression series for one exercise: one point per session (log) per
 * metric, collapsed with the metric's declared aggregation semantics —
 * 'sum' totals the session's sets, 'avg' averages them, 'max' takes the
 * highest, 'none' (weight) takes the session's best set per prDirection.
 *
 * Computed client-side over the hydrated history store, consistent with the
 * rest of the stats read path (offline-first; no Convex query). Exclusions
 * match the aggregate stats: completed sets only, interval 'rest' sub-sets
 * skipped, stale interval distance/pace/speed skipped, and non-positive
 * values ignored for lower-is-better metrics.
 */
export function computeExerciseSeries(
  logs: WorkoutLog[],
  exerciseId: string
): ExerciseMetricSeries {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  const series: ExerciseMetricSeries = {};

  for (const log of sorted) {
    // Collect this session's raw values per metric across the exercise's sets.
    const values = new Map<MetricId, number[]>();
    for (const exercise of log.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      for (const set of exercise.sets) {
        if (!set.completed || isRestInterval(set)) continue;
        for (const spec of METRIC_LIST) {
          const value = readMetricValue(set, spec.id);
          if (value === undefined || !metricCounts(set, spec.id)) continue;
          if (spec.prDirection === 'lower' && value <= 0) continue;
          const list = values.get(spec.id);
          if (list) {
            list.push(value);
          } else {
            values.set(spec.id, [value]);
          }
        }
      }
    }

    for (const [id, vals] of values) {
      const spec = METRICS[id];
      let value: number;
      switch (spec.aggregation) {
        case 'sum':
          value = vals.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          value = vals.reduce((a, b) => a + b, 0) / vals.length;
          break;
        case 'max':
          value = Math.max(...vals);
          break;
        case 'none':
          value =
            spec.prDirection === 'lower' ? Math.min(...vals) : Math.max(...vals);
          break;
      }
      (series[id] ??= []).push({ date: log.startedAt, value });
    }
  }

  return series;
}

/** Human span between two ISO dates, for trend summaries ("3 months"). */
function describeSpan(fromIso: string, toIso: string): string {
  const days = Math.max(
    1,
    differenceInCalendarDays(new Date(toIso), new Date(fromIso))
  );
  if (days >= 60) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  if (days >= 14) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Screen-reader summary of a progression series, e.g. "Bench Press estimated
 * 1RM, up 8% over 3 months, latest 92.5 kg, 12 sessions". Used as the chart's
 * accessibilityLabel so the trend is never visual-only.
 */
export function trendAccessibilitySummary(
  subject: string,
  points: readonly MetricValuePoint[],
  formatValue: (value: number) => string
): string {
  if (points.length === 0) {
    return `${subject}, no data in the selected range`;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const latestPart = `latest ${formatValue(last.value)}`;
  if (points.length === 1) {
    return `${subject}, one session in the selected range, ${latestPart}`;
  }

  const delta = last.value - first.value;
  let phrase: string;
  if (first.value !== 0) {
    const pct = Math.round(Math.abs(delta / first.value) * 100);
    phrase = pct === 0 ? 'steady' : `${delta > 0 ? 'up' : 'down'} ${pct}%`;
  } else {
    phrase = delta === 0 ? 'steady' : delta > 0 ? 'up' : 'down';
  }

  const span = describeSpan(first.date, last.date);
  return `${subject}, ${phrase} over ${span}, ${latestPart}, ${points.length} sessions`;
}

function computeBestMonth(logs: WorkoutLog[]): MonthRecord | null {
  if (logs.length === 0) return null;

  const monthMap = new Map<string, Set<string>>();

  for (const log of logs) {
    const date = new Date(log.startedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const dayStr = format(date, 'yyyy-MM-dd');

    if (!monthMap.has(key)) monthMap.set(key, new Set());
    monthMap.get(key)!.add(dayStr);
  }

  let best: MonthRecord | null = null;

  for (const [key, days] of monthMap) {
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const workoutDays = days.size;

    if (!best || workoutDays > best.workoutDays) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      best = { year, month, label: `${monthNames[month]} ${year}`, workoutDays };
    }
  }

  return best;
}

function computeBestYear(logs: WorkoutLog[]): YearRecord | null {
  if (logs.length === 0) return null;

  const yearMap = new Map<number, Set<string>>();

  for (const log of logs) {
    const date = new Date(log.startedAt);
    const year = date.getFullYear();
    const dayStr = format(date, 'yyyy-MM-dd');

    if (!yearMap.has(year)) yearMap.set(year, new Set());
    yearMap.get(year)!.add(dayStr);
  }

  let best: YearRecord | null = null;

  for (const [year, days] of yearMap) {
    if (!best || days.size > best.workoutDays) {
      best = { year, workoutDays: days.size };
    }
  }

  return best;
}

function computeCurrentYearStats(logs: WorkoutLog[], now: Date): CurrentYearStats {
  const year = now.getFullYear();
  const daysInYear = isLeapYear(now) ? 366 : 365;
  const totalDaysSoFar = getDayOfYear(now);

  const uniqueDays = new Set<string>();
  for (const log of logs) {
    const date = new Date(log.startedAt);
    if (date.getFullYear() === year) {
      uniqueDays.add(format(date, 'yyyy-MM-dd'));
    }
  }

  const daysTrained = uniqueDays.size;
  const percentage = totalDaysSoFar > 0 ? (daysTrained / totalDaysSoFar) * 100 : 0;
  const predictedTotal = totalDaysSoFar > 0
    ? Math.round((daysTrained / totalDaysSoFar) * daysInYear)
    : 0;

  return { year, daysTrained, totalDaysSoFar, percentage, predictedTotal, daysInYear };
}

function computeTotals(logs: WorkoutLog[]): TotalStats {
  let totalWeightLifted = 0;
  let totalDistance = 0;
  let totalTimeSeconds = 0;
  let totalSets = 0;
  let totalReps = 0;

  for (const log of logs) {
    totalTimeSeconds += log.durationSeconds;

    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        if (!set.completed) continue;
        totalSets++;

        // Flat accumulation; interval 'rest' sub-sets contribute nothing.
        if (!isRestInterval(set)) {
          const reps = readMetricValue(set, 'reps');
          const distance = readMetricValue(set, 'distance');
          const weight = readMetricValue(set, 'weight');
          if (reps !== undefined) totalReps += reps;
          if (distance !== undefined && metricCounts(set, 'distance')) {
            totalDistance += distance;
          }
          if (weight !== undefined && reps !== undefined) {
            totalWeightLifted += reps * weight;
          }
        }
      }
    }
  }

  return {
    totalWeightLifted,
    totalDistance,
    totalTimeSeconds,
    totalSets,
    totalReps,
    totalWorkouts: logs.length,
  };
}

function computeAverages(logs: WorkoutLog[], totals: TotalStats): AverageStats {
  const n = logs.length;

  if (n === 0) {
    return { avgWorkoutDuration: 0, avgSetsPerWorkout: 0, avgExercisesPerWorkout: 0, workoutsPerWeek: 0 };
  }

  const totalExercises = logs.reduce((sum, log) => sum + log.exercises.length, 0);

  let workoutsPerWeek = 0;
  if (n >= 2) {
    const sorted = [...logs].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
    const firstDate = new Date(sorted[0].startedAt);
    const lastDate = new Date(sorted[sorted.length - 1].startedAt);
    const weeks = differenceInCalendarDays(lastDate, firstDate) / 7;
    workoutsPerWeek = weeks > 0 ? n / weeks : n;
  } else {
    workoutsPerWeek = n;
  }

  return {
    avgWorkoutDuration: totals.totalTimeSeconds / n,
    avgSetsPerWorkout: totals.totalSets / n,
    avgExercisesPerWorkout: totalExercises / n,
    workoutsPerWeek,
  };
}

function computeFavorites(logs: WorkoutLog[]): FavoriteStats {
  if (logs.length === 0) return {};

  const exerciseCounts = new Map<string, { name: string; count: number }>();
  for (const log of logs) {
    for (const exercise of log.exercises) {
      const existing = exerciseCounts.get(exercise.exerciseId);
      if (existing) {
        existing.count++;
      } else {
        exerciseCounts.set(exercise.exerciseId, { name: exercise.name, count: 1 });
      }
    }
  }

  let mostUsedExercise: { name: string; count: number } | undefined;
  for (const entry of exerciseCounts.values()) {
    if (!mostUsedExercise || entry.count > mostUsedExercise.count) {
      mostUsedExercise = entry;
    }
  }

  const templateCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.templateName) {
      templateCounts.set(log.templateName, (templateCounts.get(log.templateName) ?? 0) + 1);
    }
  }

  let favoriteTemplate: { name: string; count: number } | undefined;
  for (const [name, count] of templateCounts) {
    if (!favoriteTemplate || count > favoriteTemplate.count) {
      favoriteTemplate = { name, count };
    }
  }

  const weekdayCounts = new Array(7).fill(0);
  for (const log of logs) {
    const day = new Date(log.startedAt).getDay();
    weekdayCounts[day]++;
  }

  let maxDayIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (weekdayCounts[i] > weekdayCounts[maxDayIdx]) maxDayIdx = i;
  }
  const mostActiveWeekday = weekdayCounts[maxDayIdx] > 0
    ? { day: WEEKDAYS[maxDayIdx], count: weekdayCounts[maxDayIdx] }
    : undefined;

  const hourCounts = new Array(24).fill(0);
  for (const log of logs) {
    const hour = new Date(log.startedAt).getHours();
    hourCounts[hour]++;
  }

  let maxHour = 0;
  for (let i = 1; i < 24; i++) {
    if (hourCounts[i] > hourCounts[maxHour]) maxHour = i;
  }
  const mostActiveHour = hourCounts[maxHour] > 0
    ? { hour: formatHour(maxHour), count: hourCounts[maxHour] }
    : undefined;

  return { mostUsedExercise, favoriteTemplate, mostActiveWeekday, mostActiveHour };
}

// ---- Main entry point ----

// Streaks are not computed here. Both callers (`hooks/use-stats.ts` and
// `components/achievements/monthly-recap-card.tsx`) compute streaks
// themselves via the rest-day-aware + external-workout-aware engine in
// `lib/streaks.ts`; `hooks/use-stats.ts` fills in `AllStats.streaks`
// explicitly. See plan 043.
export function computeAllStats(logs: WorkoutLog[], now: Date): Omit<AllStats, 'streaks'> {
  const totals = computeTotals(logs);

  return {
    exerciseStats: computeExerciseStats(logs),
    bestMonth: computeBestMonth(logs),
    bestYear: computeBestYear(logs),
    currentYear: computeCurrentYearStats(logs, now),
    totals,
    averages: computeAverages(logs, totals),
    favorites: computeFavorites(logs),
  };
}

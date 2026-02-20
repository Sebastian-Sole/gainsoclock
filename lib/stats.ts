import { format, differenceInCalendarDays, isLeapYear, getDayOfYear, subDays } from 'date-fns';
import type { WorkoutLog } from './types';

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

export interface ExerciseStats {
  exerciseName: string;
  exerciseId: string;
  totalAppearances: number;
  // Totals
  totalReps: number;
  totalWeight: number; // sum of reps × weight
  totalDistance: number;
  totalTime: number; // seconds
  totalSets: number;
  // Personal bests
  maxWeight?: { value: number; date: string };
  maxReps?: { value: number; date: string };
  maxTime?: { value: number; date: string };
  maxDistance?: { value: number; date: string };
  maxVolume?: { value: number; date: string }; // single-set reps × weight
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  longestStreakStart: string;
  longestStreakEnd: string;
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

function getUniqueDates(logs: WorkoutLog[]): string[] {
  const dateSet = new Set<string>();
  for (const log of logs) {
    dateSet.add(format(new Date(log.startedAt), 'yyyy-MM-dd'));
  }
  return Array.from(dateSet).sort();
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

// ---- Computation functions ----

function computeExerciseStats(logs: WorkoutLog[]): ExerciseStats[] {
  const exerciseMap = new Map<string, ExerciseStats>();

  for (const log of logs) {
    const logDate = log.startedAt;

    for (const exercise of log.exercises) {
      let stats = exerciseMap.get(exercise.exerciseId);
      if (!stats) {
        stats = {
          exerciseName: exercise.name,
          exerciseId: exercise.exerciseId,
          totalAppearances: 0,
          totalReps: 0,
          totalWeight: 0,
          totalDistance: 0,
          totalTime: 0,
          totalSets: 0,
        };
        exerciseMap.set(exercise.exerciseId, stats);
      }
      stats.totalAppearances++;

      for (const set of exercise.sets) {
        if (!set.completed) continue;
        stats.totalSets++;

        // Accumulate totals
        if (set.type === 'reps_weight') {
          stats.totalReps += set.reps;
          stats.totalWeight += set.reps * set.weight;
        } else if (set.type === 'reps_time') {
          stats.totalReps += set.reps;
          stats.totalTime += set.time;
        } else if (set.type === 'time_only') {
          stats.totalTime += set.time;
        } else if (set.type === 'time_distance') {
          stats.totalTime += set.time;
          stats.totalDistance += set.distance;
        } else if (set.type === 'reps_only') {
          stats.totalReps += set.reps;
        }

        // Track personal bests
        if ('weight' in set && set.weight !== undefined) {
          if (!stats.maxWeight || set.weight > stats.maxWeight.value) {
            stats.maxWeight = { value: set.weight, date: logDate };
          }
        }

        if ('reps' in set && set.reps !== undefined) {
          if (!stats.maxReps || set.reps > stats.maxReps.value) {
            stats.maxReps = { value: set.reps, date: logDate };
          }
        }

        if ('time' in set && set.time !== undefined) {
          if (!stats.maxTime || set.time > stats.maxTime.value) {
            stats.maxTime = { value: set.time, date: logDate };
          }
        }

        if ('distance' in set && set.distance !== undefined) {
          if (!stats.maxDistance || set.distance > stats.maxDistance.value) {
            stats.maxDistance = { value: set.distance, date: logDate };
          }
        }

        if (set.type === 'reps_weight') {
          const volume = set.reps * set.weight;
          if (!stats.maxVolume || volume > stats.maxVolume.value) {
            stats.maxVolume = { value: volume, date: logDate };
          }
        }
      }
    }
  }

  return Array.from(exerciseMap.values()).sort(
    (a, b) => b.totalAppearances - a.totalAppearances
  );
}

function computeStreaks(logs: WorkoutLog[], now: Date): StreakStats {
  const dates = getUniqueDates(logs);

  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, longestStreakStart: '', longestStreakEnd: '' };
  }

  // Compute longest streak
  let longestStreak = 1;
  let longestStart = 0;
  let currentRun = 1;
  let runStart = 0;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = differenceInCalendarDays(curr, prev);

    if (diff === 1) {
      currentRun++;
      if (currentRun > longestStreak) {
        longestStreak = currentRun;
        longestStart = runStart;
      }
    } else {
      currentRun = 1;
      runStart = i;
    }
  }

  const longestStreakStart = dates[longestStart];
  const longestStreakEnd = dates[longestStart + longestStreak - 1];

  // Compute current streak (count back from today or yesterday)
  const todayStr = format(now, 'yyyy-MM-dd');
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = format(yesterdayDate, 'yyyy-MM-dd');

  let currentStreak = 0;
  const lastDate = dates[dates.length - 1];

  if (lastDate === todayStr || lastDate === yesterdayStr) {
    currentStreak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const curr = new Date(dates[i + 1]);
      const prev = new Date(dates[i]);
      if (differenceInCalendarDays(curr, prev) === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { currentStreak, longestStreak, longestStreakStart, longestStreakEnd };
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

        if (set.type === 'reps_weight') {
          totalWeightLifted += set.reps * set.weight;
          totalReps += set.reps;
        } else if (set.type === 'reps_time') {
          totalReps += set.reps;
        } else if (set.type === 'time_distance') {
          totalDistance += set.distance;
        } else if (set.type === 'reps_only') {
          totalReps += set.reps;
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

export function computeAllStats(logs: WorkoutLog[], now: Date): AllStats {
  const totals = computeTotals(logs);

  return {
    exerciseStats: computeExerciseStats(logs),
    streaks: computeStreaks(logs, now),
    bestMonth: computeBestMonth(logs),
    bestYear: computeBestYear(logs),
    currentYear: computeCurrentYearStats(logs, now),
    totals,
    averages: computeAverages(logs, totals),
    favorites: computeFavorites(logs),
  };
}

import { format } from 'date-fns';
import { getPlanDayDate } from './plan-dates';
import type { PlanDay, WeekStartDay, WorkoutPlan } from './types';

/**
 * Rest-day-aware + mesh-aware streak computation.
 *
 * All dates are local-day strings in `YYYY-MM-DD` format. Day arithmetic is
 * done in UTC on the parsed strings, which is safe because the strings are
 * opaque, totally-ordered day labels — no timezone conversion ever happens.
 */

const DAY_MS = 86_400_000;

/** Parse `YYYY-MM-DD` into a day ordinal (days since Unix epoch, UTC). */
function toDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Inverse of {@link toDayNumber}. */
function toDateString(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export interface StreakInput {
  /** Local days (`YYYY-MM-DD`) with at least one Fitbull workout log. */
  workoutDates: Set<string>;
  /** Local days with at least one synced external workout (Apple Health etc.). */
  externalWorkoutDates: Set<string>;
  /** Local days that are planned rest days (`status: "rest"`) in the active plan. */
  restDates: Set<string>;
  /** Today as a local `YYYY-MM-DD` string. */
  today: string;
}

export interface StreakResult {
  /** Length of the streak ending today (or yesterday, under today's grace). */
  current: number;
  /** Longest streak across all supplied history, under the same rules. */
  longest: number;
  /** Whether today already has a Fitbull or external workout. */
  todayCovered: boolean;
  /** First/last ACTIVE day of the longest streak (`''` when `longest` is 0). Supplemental to the core result, used to render the streak date range. */
  longestStart: string;
  longestEnd: string;
  /** True when the current streak contains at least one day covered ONLY by an external workout (i.e. the streak would be shorter without synced data). Supplemental. */
  currentIncludesExternal: boolean;
}

/**
 * Computes current and longest workout streaks.
 *
 * Semantics:
 * - A day COUNTS toward a streak if it has a Fitbull workout log OR an
 *   external (synced) workout.
 * - A planned rest day is NEUTRAL: it neither breaks nor extends a streak.
 *   A day that is both a rest day and an active day counts as active.
 * - Today gets grace until midnight: an uncovered today never breaks the
 *   current streak, but it doesn't count either (`todayCovered` tells the UI
 *   whether training today would extend the streak).
 * - The longest streak is computed under the same rules over all history.
 *   Leading/trailing rest days never inflate a streak — only active days are
 *   counted, and the reported range starts/ends on active days.
 * - Future-dated entries (after `today`) are ignored.
 *
 * @example Empty inputs → zeros.
 * computeStreak({ workoutDates: new Set(), externalWorkoutDates: new Set(), restDates: new Set(), today: '2026-06-10' })
 * // → { current: 0, longest: 0, todayCovered: false, longestStart: '', longestEnd: '', currentIncludesExternal: false }
 *
 * @example Simple consecutive days ending today.
 * computeStreak({ workoutDates: new Set(['2026-06-08', '2026-06-09', '2026-06-10']), externalWorkoutDates: new Set(), restDates: new Set(), today: '2026-06-10' })
 * // → { current: 3, longest: 3, todayCovered: true, longestStart: '2026-06-08', longestEnd: '2026-06-10', currentIncludesExternal: false }
 *
 * @example Today uncovered → grace, streak preserved but not extended.
 * computeStreak({ workoutDates: new Set(['2026-06-08', '2026-06-09']), externalWorkoutDates: new Set(), restDates: new Set(), today: '2026-06-10' })
 * // → { current: 2, longest: 2, todayCovered: false, ... }
 *
 * @example A one-day gap (not a rest day) breaks the streak.
 * computeStreak({ workoutDates: new Set(['2026-06-06', '2026-06-07', '2026-06-09', '2026-06-10']), externalWorkoutDates: new Set(), restDates: new Set(), today: '2026-06-10' })
 * // → { current: 2, longest: 2, todayCovered: true, longestStart: '2026-06-09', longestEnd: '2026-06-10', ... }
 * // (two runs of 2; the most recent one is reported as longest)
 *
 * @example A planned rest day bridges the gap (neutral, doesn't count).
 * computeStreak({ workoutDates: new Set(['2026-06-07', '2026-06-09', '2026-06-10']), externalWorkoutDates: new Set(), restDates: new Set(['2026-06-08']), today: '2026-06-10' })
 * // → { current: 3, longest: 3, todayCovered: true, longestStart: '2026-06-07', longestEnd: '2026-06-10', ... }
 * // (3 active days; the rest day in between neither broke nor extended)
 *
 * @example An external (Garmin/Apple Health) workout keeps the streak alive.
 * computeStreak({ workoutDates: new Set(['2026-06-08', '2026-06-10']), externalWorkoutDates: new Set(['2026-06-09']), restDates: new Set(), today: '2026-06-10' })
 * // → { current: 3, longest: 3, todayCovered: true, currentIncludesExternal: true, ... }
 *
 * @example Rest-only history → no streak (rest days alone never count).
 * computeStreak({ workoutDates: new Set(), externalWorkoutDates: new Set(), restDates: new Set(['2026-06-09', '2026-06-10']), today: '2026-06-10' })
 * // → { current: 0, longest: 0, todayCovered: false, ... }
 *
 * @example Yesterday neither active nor rest → current streak is 0 even with older history.
 * computeStreak({ workoutDates: new Set(['2026-06-01', '2026-06-02', '2026-06-03']), externalWorkoutDates: new Set(), restDates: new Set(), today: '2026-06-10' })
 * // → { current: 0, longest: 3, longestStart: '2026-06-01', longestEnd: '2026-06-03', ... }
 *
 * @example Trailing rest days between the last workout and today are neutral.
 * computeStreak({ workoutDates: new Set(['2026-06-06', '2026-06-07']), externalWorkoutDates: new Set(), restDates: new Set(['2026-06-08', '2026-06-09']), today: '2026-06-10' })
 * // → { current: 2, longest: 2, todayCovered: false, ... }
 * // (today under grace, 2 rest days skipped, then 2 active days counted)
 */
export function computeStreak(input: StreakInput): StreakResult {
  const { workoutDates, externalWorkoutDates, restDates, today } = input;

  const todayNum = toDayNumber(today);

  // Union of countable days, clamped to today (future entries ignored).
  const activeNums = new Set<number>();
  for (const d of workoutDates) {
    const n = toDayNumber(d);
    if (n <= todayNum) activeNums.add(n);
  }
  for (const d of externalWorkoutDates) {
    const n = toDayNumber(d);
    if (n <= todayNum) activeNums.add(n);
  }

  const restNums = new Set<number>();
  for (const d of restDates) restNums.add(toDayNumber(d));

  const isExternalOnly = (n: number): boolean => {
    const iso = toDateString(n);
    return externalWorkoutDates.has(iso) && !workoutDates.has(iso);
  };

  const todayCovered = activeNums.has(todayNum);

  // ── Current streak: walk back from today (or yesterday under grace).
  let current = 0;
  let currentIncludesExternal = false;
  let cursor = todayCovered ? todayNum : todayNum - 1;
  for (;;) {
    if (activeNums.has(cursor)) {
      current++;
      if (isExternalOnly(cursor)) currentIncludesExternal = true;
      cursor--;
    } else if (restNums.has(cursor)) {
      cursor--; // neutral: skip without counting
    } else {
      break;
    }
  }

  // ── Longest streak: single pass over [first active day, last active day].
  // Bounding by active days is correct because leading/trailing rest days are
  // neutral and can never start or end a run. The current streak is always
  // fully contained in this range (same counting rules), so no extra max()
  // against `current` is needed.
  let longest = 0;
  let longestStart = '';
  let longestEnd = '';

  if (activeNums.size > 0) {
    const sorted = [...activeNums].sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let run = 0;
    let runFirstActive = first;
    let runLastActive = first;

    for (let n = first; n <= last; n++) {
      if (activeNums.has(n)) {
        if (run === 0) runFirstActive = n;
        run++;
        runLastActive = n;
        if (run >= longest) {
          // `>=` so ties resolve to the most recent run.
          longest = run;
          longestStart = toDateString(runFirstActive);
          longestEnd = toDateString(runLastActive);
        }
      } else if (!restNums.has(n)) {
        run = 0; // hard gap: neither active nor planned rest
      }
      // else: planned rest day — neutral, run continues uncounted
    }
  }

  return { current, longest, todayCovered, longestStart, longestEnd, currentIncludesExternal };
}

/**
 * Collects the local calendar dates (`YYYY-MM-DD`) of all planned rest days
 * (`status: "rest"`) in a plan, across every week the plan covers.
 *
 * Pure helper so `hooks/use-stats.ts` can stay thin. Pass the active plan
 * only — rest days from paused/completed plans are not honest adherence.
 */
export function collectPlanRestDates(
  plan: (Pick<WorkoutPlan, 'startDate'> & { days: PlanDay[] }) | null,
  weekStartDay: WeekStartDay
): Set<string> {
  const dates = new Set<string>();
  if (!plan) return dates;

  for (const day of plan.days) {
    if (day.status !== 'rest') continue;
    const date = getPlanDayDate(plan.startDate, day.week, day.dayOfWeek, weekStartDay);
    dates.add(format(date, 'yyyy-MM-dd'));
  }
  return dates;
}

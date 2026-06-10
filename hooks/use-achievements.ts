import { useQuery } from 'convex/react';
import { format, subDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@/convex/_generated/api';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_TARGETS,
  countWeightPrs,
  evaluateAchievements,
  type AchievementDef,
  type AchievementFacts,
} from '@/lib/achievements';
import type { DateRangeFilter } from '@/lib/stats';
import type { PlanDay } from '@/lib/types';
import { useStats } from '@/hooks/use-stats';
import { useAchievementsStore } from '@/stores/achievements-store';
import { useHistoryStore } from '@/stores/history-store';
import { usePlanStore } from '@/stores/plan-store';
import { useSettingsStore } from '@/stores/settings-store';

const ALL_TIME: DateRangeFilter = { preset: 'all', from: null, to: null };

const KG_PER_LB = 0.45359237;

/**
 * Max run of consecutive fully-adherent weeks in the active plan.
 *
 * A week is fully adherent when it has at least one day, every day is either
 * 'completed' or 'rest', and at least one day is 'completed' (an all-rest
 * week can't earn adherence). Weeks with any 'pending' or 'skipped' day —
 * including the current in-progress week — break the run.
 *
 * Limitation: only the ACTIVE plan's days are available client-side, so
 * adherence earned in past (completed) plans is not counted. Good enough for
 * the "Locked In" unlock, which only needs a 4-week run within one plan.
 */
function computeWeeksFullPlanAdherence(
  plan: { durationWeeks: number; days: PlanDay[] } | null
): number {
  if (!plan || plan.days.length === 0) return 0;

  const daysByWeek = new Map<number, PlanDay[]>();
  for (const day of plan.days) {
    const list = daysByWeek.get(day.week);
    if (list) list.push(day);
    else daysByWeek.set(day.week, [day]);
  }

  let maxRun = 0;
  let run = 0;
  for (let week = 1; week <= plan.durationWeeks; week++) {
    const days = daysByWeek.get(week) ?? [];
    const adherent =
      days.length > 0 &&
      days.every((d) => d.status === 'completed' || d.status === 'rest') &&
      days.some((d) => d.status === 'completed');

    run = adherent ? run + 1 : 0;
    if (run > maxRun) maxRun = run;
  }
  return maxRun;
}

export interface UseAchievementsResult {
  /** Every achievement definition, in display order. */
  all: AchievementDef[];
  /** Achievement key → unlock timestamp (ISO 8601). */
  unlocked: Map<string, string>;
  /** Achievements unlocked during this app session (for toasts/celebrations). */
  newlyUnlocked: AchievementDef[];
  /** Progress toward a countable achievement, or null when not trackable. */
  progress: (def: AchievementDef) => { current: number; target: number } | null;
}

/**
 * Assembles {@link AchievementFacts} from existing stores/hooks, evaluates
 * the achievement definitions whenever the facts change, persists new
 * unlocks, and reports session-level "newly unlocked" defs for the UI.
 *
 * Fact sourcing (and what is approximate):
 * - totalWorkouts / totalVolumeKg / streaks — `useStats` over the all-time
 *   filter (covers the history store's loaded window; older history loads on
 *   demand as the user browses, so very old data may be undercounted until
 *   fetched — unlocks are permanent, so this only delays them).
 * - totalVolumeKg — `totals.totalWeightLifted` is stored in the user's
 *   current weight unit; converted to kg when the unit is lbs.
 * - totalPrCount — `countWeightPrs` over loaded logs, mirroring the
 *   server-side weight-PR semantics in `convex/weeklyReview.ts`.
 * - externalWorkoutCount — same `listExternalWorkouts` subscription (same
 *   args) as `use-stats`, so Convex dedupes it; counts synced workouts in
 *   the history window.
 * - mealsLoggedCount — `api.mealLogs.listDateRange` over the trailing 365
 *   days. The meal-log store only holds TODAY's meals, so a server query is
 *   required; a 1-year window keeps the payload bounded and is plenty to
 *   reach the 10/100 thresholds (unlocks persist once earned).
 * - weeksFullPlanAdherence — computed from the active plan's days in the
 *   plan store; past plans' days aren't client-side (documented above).
 */
export function useAchievements(): UseAchievementsResult {
  const stats = useStats(ALL_TIME);
  const logs = useHistoryStore((s) => s.logs);
  const loadedRange = useHistoryStore((s) => s.loadedRange);
  const activePlan = usePlanStore((s) => s.activePlanWithDays);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const unlocked = useAchievementsStore((s) => s.unlocked);
  const markUnlocked = useAchievementsStore((s) => s.markUnlocked);

  // Identical args to the subscription inside use-stats → Convex dedupes.
  const externalRange = useMemo(
    () => ({
      start: new Date(loadedRange.from).getTime(),
      end: new Date(loadedRange.to).getTime() + 1,
    }),
    [loadedRange]
  );
  const externalWorkouts = useQuery(api.healthData.listExternalWorkouts, externalRange);

  // Computed once per mount so the query args stay referentially stable.
  const [mealRange] = useState(() => {
    const now = new Date();
    return {
      from: format(subDays(now, 365), 'yyyy-MM-dd'),
      to: format(now, 'yyyy-MM-dd'),
    };
  });
  const meals = useQuery(api.mealLogs.listDateRange, mealRange);

  const facts: AchievementFacts = useMemo(
    () => ({
      totalWorkouts: stats.totals.totalWorkouts,
      totalVolumeKg:
        weightUnit === 'lbs'
          ? stats.totals.totalWeightLifted * KG_PER_LB
          : stats.totals.totalWeightLifted,
      totalPrCount: countWeightPrs(logs),
      currentStreak: stats.streaks.currentStreak,
      longestStreak: stats.streaks.longestStreak,
      externalWorkoutCount: externalWorkouts?.length ?? 0,
      mealsLoggedCount: meals?.length ?? 0,
      weeksFullPlanAdherence: computeWeeksFullPlanAdherence(
        activePlan && activePlan.status === 'active' ? activePlan : null
      ),
    }),
    [stats, logs, weightUnit, externalWorkouts, meals, activePlan]
  );

  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementDef[]>([]);

  // Evaluate on mount and whenever facts (or persisted unlocks) change.
  // Loading states only yield zeroed facts → false negatives that resolve on
  // the next evaluation; never false unlocks.
  useEffect(() => {
    const newly = evaluateAchievements(facts, new Set(Object.keys(unlocked)));
    if (newly.length === 0) return;

    markUnlocked(newly.map((d) => d.key));
    setNewlyUnlocked((prev) => {
      const seen = new Set(prev.map((d) => d.key));
      const additions = newly.filter((d) => !seen.has(d.key));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, [facts, unlocked, markUnlocked]);

  const unlockedMap = useMemo(() => new Map(Object.entries(unlocked)), [unlocked]);

  const progress = useCallback(
    (def: AchievementDef): { current: number; target: number } | null => {
      const entry = ACHIEVEMENT_TARGETS[def.key];
      if (!entry) return null;
      return { current: facts[entry.metric], target: entry.target };
    },
    [facts]
  );

  return { all: ACHIEVEMENTS, unlocked: unlockedMap, newlyUnlocked, progress };
}

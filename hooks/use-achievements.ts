import { useQuery } from 'convex/react';
import { format, subDays } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/convex/_generated/api';
import {
  buildAchievementGroups,
  computeMealDaySignals,
  computeWorkoutSignals,
  countWeightPrs,
  evaluateAchievements,
  type AchievementDef,
  type AchievementFacts,
  type AchievementGroup,
} from '@/lib/achievements';
import { capture } from '@/lib/analytics';
import type { DateRangeFilter } from '@/lib/stats';
import type { PlanDay } from '@/lib/types';
import { useStats } from '@/hooks/use-stats';
import { useAchievementEventsStore } from '@/stores/achievement-events-store';
import { useAchievementsStore } from '@/stores/achievements-store';
import { useGroceryStore } from '@/stores/grocery-store';
import { useHistoryStore } from '@/stores/history-store';
import { useNutritionGoalsStore } from '@/stores/nutrition-goals-store';
import { usePlanStore } from '@/stores/plan-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { useSettingsStore } from '@/stores/settings-store';

const ALL_TIME: DateRangeFilter = { preset: 'all', from: null, to: null };

const KG_PER_LB = 0.45359237;

// Quiet period after the last backfill unlock before we lock in the baseline.
// Facts hydrate asynchronously (stores + several Convex queries resolve at
// different times), so the initial "unlock" burst trickles in across a few
// evaluations. We keep absorbing silently until it stops for this long, then
// treat everything after as genuine gameplay worth a toast.
const BASELINE_SETTLE_MS = 4000;

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
  /** One entry per leveled family + one-off, with current level & progress. */
  groups: AchievementGroup[];
  /** Achievement (flat) key → unlock timestamp (ISO 8601). */
  unlocked: Map<string, string>;
  /** Flat per-level defs unlocked during this session (for toasts/celebrations). */
  newlyUnlocked: AchievementDef[];
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
  const allPlans = usePlanStore((s) => s.plans);
  const recipes = useRecipeStore((s) => s.recipes);
  const groceryItems = useGroceryStore((s) => s.items);
  const nutritionGoals = useNutritionGoalsStore((s) => s.goals);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const chatMessageSent = useAchievementEventsStore((s) => s.chatMessageSent);
  const chatMealLogged = useAchievementEventsStore((s) => s.chatMealLogged);
  const aiMacrosGenerated = useAchievementEventsStore((s) => s.aiMacrosGenerated);
  const unlocked = useAchievementsStore((s) => s.unlocked);
  const markUnlocked = useAchievementsStore((s) => s.markUnlocked);
  const hasSeededBaseline = useAchievementsStore((s) => s.hasSeededBaseline);
  const markBaselineSeeded = useAchievementsStore((s) => s.markBaselineSeeded);

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

  // Last-7-days health summary (sleep / steps / bodyweight presence). The
  // window is narrow, but unlocks persist once earned, so an active syncer
  // trips these on any session with recent data.
  const healthSummary = useQuery(api.healthData.getHealthSummary, {});

  const facts: AchievementFacts = useMemo(() => {
    const workout = computeWorkoutSignals(logs, weightUnit === 'lbs');
    const mealDays = computeMealDaySignals(meals ?? [], nutritionGoals);
    const dailyMetrics = healthSummary?.dailyMetrics ?? [];
    return {
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

      // Plans
      plansCreated: allPlans.length,
      plansCompleted: allPlans.filter((p) => p.status === 'completed').length,
      plansFromChat: allPlans.filter((p) => p.sourceConversationClientId).length,

      // Nutrition
      recipesCreated: recipes.length,
      maxMealsInDay: mealDays.maxMealsInDay,
      macroGoalDays: mealDays.macroGoalDays,
      groceryItems: groceryItems.length,

      // AI coach / engagement
      chatMessages: chatMessageSent ? 1 : 0,
      chatMealsLogged: chatMealLogged ? 1 : 0,
      aiMacrosGenerated: aiMacrosGenerated ? 1 : 0,

      // Health import presence
      sleepImported: dailyMetrics.some((d) => d.asleepSeconds !== undefined) ? 1 : 0,
      stepsImported: dailyMetrics.some((d) => d.steps !== undefined) ? 1 : 0,
      bodyweightLogged: dailyMetrics.some((d) => d.bodyMassKg !== undefined) ? 1 : 0,

      // Quirky / single-session (from workout logs)
      ...workout,
    };
  }, [
    stats,
    logs,
    weightUnit,
    externalWorkouts,
    meals,
    activePlan,
    allPlans,
    recipes,
    groceryItems,
    nutritionGoals,
    chatMessageSent,
    chatMealLogged,
    aiMacrosGenerated,
    healthSummary,
  ]);

  const [newlyUnlocked, setNewlyUnlocked] = useState<AchievementDef[]>([]);
  const baselineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (baselineTimerRef.current) clearTimeout(baselineTimerRef.current);
    },
    []
  );

  // Evaluate on mount and whenever facts (or persisted unlocks) change.
  // Loading states only yield zeroed facts → false negatives that resolve on
  // the next evaluation; never false unlocks.
  useEffect(() => {
    const newly = evaluateAchievements(facts, new Set(Object.keys(unlocked)));

    // First sync on this device: the batch that resolves as history hydrates is
    // backfill of already-earned progress, not fresh gameplay. Persist it, but
    // do NOT toast — otherwise signing in floods the user with dozens of banners.
    // Re-arm a settle timer on each backfill batch; lock in the baseline once
    // the burst goes quiet so genuine future unlocks surface normally.
    if (!hasSeededBaseline) {
      if (newly.length > 0) {
        markUnlocked(newly.map((d) => d.key));
      }
      if (baselineTimerRef.current) clearTimeout(baselineTimerRef.current);
      baselineTimerRef.current = setTimeout(markBaselineSeeded, BASELINE_SETTLE_MS);
      return;
    }

    if (newly.length === 0) return;

    markUnlocked(newly.map((d) => d.key));
    // Fired here (unlock detection), not where the toast renders — the
    // baseline-backfill branch above returns before this point, so backfill
    // unlocks on a fresh sign-in never flood analytics (mirrors the toast
    // anti-flood fix).
    for (const def of newly) {
      capture({ name: 'achievement_unlocked', props: { achievementId: def.key } });
    }
    setNewlyUnlocked((prev) => {
      const seen = new Set(prev.map((d) => d.key));
      const additions = newly.filter((d) => !seen.has(d.key));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, [facts, unlocked, markUnlocked, hasSeededBaseline, markBaselineSeeded]);

  const unlockedMap = useMemo(() => new Map(Object.entries(unlocked)), [unlocked]);

  const groups = useMemo(
    () => buildAchievementGroups(facts, unlockedMap),
    [facts, unlockedMap]
  );

  return { groups, unlocked: unlockedMap, newlyUnlocked };
}

import { useQuery } from 'convex/react';
import { format, subDays } from 'date-fns';
import { useMemo, useState } from 'react';

import { api } from '@/convex/_generated/api';
import {
  assembleAchievementFacts,
  buildAchievementGroups,
  type AchievementFacts,
  type AchievementGroup,
} from '@/lib/achievements';
import type { DateRangeFilter } from '@/lib/stats';
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

export interface UseAchievementsResult {
  /** One entry per leveled family + one-off, with current level & progress. */
  groups: AchievementGroup[];
  /** Achievement (flat) key → unlock timestamp (ISO 8601). */
  unlocked: Map<string, string>;
}

/**
 * Assembles {@link AchievementFacts} from existing stores/hooks and builds
 * the grouped view model consumed by the achievements screen and the stats
 * records section.
 *
 * Unlock DETECTION — evaluating facts against thresholds, persisting new
 * unlocks, and feeding the toast — no longer happens here. It runs in
 * `lib/achievement-engine.ts`, initialized once from
 * `providers/convex-sync-provider.tsx`, so it isn't re-run (and its Convex
 * subscriptions aren't re-opened) every time a screen mounts this hook. This
 * hook only reads the persisted `unlocked` map to render progress; see plan
 * 038 for the split.
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

  const facts: AchievementFacts = useMemo(
    () =>
      assembleAchievementFacts({
        logs,
        totals: {
          totalWorkouts: stats.totals.totalWorkouts,
          totalWeightLifted: stats.totals.totalWeightLifted,
        },
        streaks: {
          currentStreak: stats.streaks.currentStreak,
          longestStreak: stats.streaks.longestStreak,
        },
        weightUnit,
        externalWorkoutCount: externalWorkouts?.length ?? 0,
        meals: meals ?? [],
        nutritionGoals,
        activePlan,
        allPlans,
        recipesCount: recipes.length,
        groceryItemsCount: groceryItems.length,
        events: { chatMessageSent, chatMealLogged, aiMacrosGenerated },
        healthDailyMetrics: healthSummary?.dailyMetrics ?? [],
      }),
    [
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
    ]
  );

  const unlockedMap = useMemo(() => new Map(Object.entries(unlocked)), [unlocked]);

  const groups = useMemo(
    () => buildAchievementGroups(facts, unlockedMap),
    [facts, unlockedMap]
  );

  return { groups, unlocked: unlockedMap };
}

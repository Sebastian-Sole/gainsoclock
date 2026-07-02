import type { ConvexReactClient } from 'convex/react';
import { format, subDays } from 'date-fns';

import { api } from '@/convex/_generated/api';
import { useAchievementEventsStore } from '@/stores/achievement-events-store';
import { useAchievementsStore } from '@/stores/achievements-store';
import { useGroceryStore } from '@/stores/grocery-store';
import { useHistoryStore } from '@/stores/history-store';
import { useMealLogStore } from '@/stores/meal-log-store';
import { useNutritionGoalsStore } from '@/stores/nutrition-goals-store';
import { usePlanStore } from '@/stores/plan-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUnlockToastStore } from '@/stores/unlock-toast-store';
import { assembleAchievementFacts, evaluateAchievements } from './achievements';
import { computeAllStats } from './stats';
import { collectPlanRestDates, computeStreak } from './streaks';

/**
 * Event-driven achievement-unlock engine. Runs OUTSIDE React so it can be
 * initialized once (from `providers/convex-sync-provider.tsx`) instead of
 * every screen that happens to mount `useAchievements()` paying for three
 * permanent Convex subscriptions + a full-history stats scan.
 *
 * Trigger set: the eight stores subscribed in {@link initAchievementEngine}.
 * A feature whose achievement facts change without touching any of those
 * stores needs an explicit `schedule()` call or unlocks will only be
 * noticed on the next unrelated trigger (see plan 038 maintenance notes).
 */

// Trailing debounce: multiple store notifications within this window collapse
// into a single evaluation attempt.
const DEBOUNCE_MS = 2000;
// Floor: two evaluation RUNS are never closer than this together, even if
// triggers keep arriving — a run requested during the floor executes once
// the floor expires (never dropped).
const FLOOR_MS = 10_000;
// First evaluation after init, giving stores/queries a moment to rehydrate.
const INITIAL_DELAY_MS = 3000;

// Quiet period after the last backfill unlock before we lock in the baseline.
// Mirrors `hooks/use-achievements.ts`'s BASELINE_SETTLE_MS (moved here by
// hotfix 4c74c6a + plan 038): the first sync's "unlocks" are backfill, not
// fresh gameplay, so they're persisted silently until the burst goes quiet.
const BASELINE_SETTLE_MS = 4000;

let convexClient: ConvexReactClient | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let floorTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAfterFloor = false;
let lastRunAt = 0;

let isEvaluating = false;
let pendingRerun = false;

let baselineTimer: ReturnType<typeof setTimeout> | null = null;

function clearAllTimers(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (floorTimer) clearTimeout(floorTimer);
  if (baselineTimer) clearTimeout(baselineTimer);
  debounceTimer = null;
  floorTimer = null;
  baselineTimer = null;
  pendingAfterFloor = false;
}

function runOrDefer(): void {
  const elapsed = Date.now() - lastRunAt;
  if (elapsed >= FLOOR_MS) {
    void evaluate();
    return;
  }
  pendingAfterFloor = true;
  if (!floorTimer) {
    floorTimer = setTimeout(() => {
      floorTimer = null;
      if (pendingAfterFloor) {
        pendingAfterFloor = false;
        void evaluate();
      }
    }, FLOOR_MS - elapsed);
  }
}

/** Debounced trigger — called on every subscribed store notification. */
function schedule(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runOrDefer();
  }, DEBOUNCE_MS);
}

/**
 * Runs one fact-assembly + evaluation pass. Concurrent calls collapse: if a
 * run is already in flight, this just flags a follow-up run instead of
 * starting a second one.
 */
async function evaluate(): Promise<void> {
  if (isEvaluating) {
    pendingRerun = true;
    return;
  }
  isEvaluating = true;
  lastRunAt = Date.now();

  try {
    const client = convexClient;
    if (!client) return;

    const history = useHistoryStore.getState();
    const plan = usePlanStore.getState();
    const settings = useSettingsStore.getState();
    const activePlan = plan.activePlanWithDays;

    // Identical args to `hooks/use-achievements.ts` / `hooks/use-stats.ts`,
    // but as one-shot fetches instead of live subscriptions. Any failure
    // degrades to zeroed facts (false negatives only, never a false unlock)
    // — never throws out of evaluate().
    const externalRange = {
      start: new Date(history.loadedRange.from).getTime(),
      end: new Date(history.loadedRange.to).getTime() + 1,
    };
    const now = new Date();
    const mealRange = {
      from: format(subDays(now, 365), 'yyyy-MM-dd'),
      to: format(now, 'yyyy-MM-dd'),
    };

    const [externalWorkouts, meals, healthSummary] = await Promise.all([
      client.query(api.healthData.listExternalWorkouts, externalRange).catch(() => []),
      client.query(api.mealLogs.listDateRange, mealRange).catch(() => []),
      client.query(api.healthData.getHealthSummary, {}).catch(() => undefined),
    ]);

    // ── totals/streaks: same assembly as `hooks/use-stats.ts:37-88` for the
    // all-time filter (no date filtering). ──
    const logs = history.logs;
    const { totals } = computeAllStats(logs, now);

    const workoutDates = new Set<string>();
    for (const log of logs) {
      workoutDates.add(format(new Date(log.startedAt), 'yyyy-MM-dd'));
    }

    const externalWorkoutDates = new Set<string>();
    for (const w of externalWorkouts ?? []) {
      externalWorkoutDates.add(format(new Date(w.startedAt), 'yyyy-MM-dd'));
    }

    const restDates =
      activePlan && activePlan.status === 'active'
        ? collectPlanRestDates(activePlan, settings.weekStartDay)
        : new Set<string>();

    const streak = computeStreak({
      workoutDates,
      externalWorkoutDates,
      restDates,
      today: format(now, 'yyyy-MM-dd'),
    });

    const events = useAchievementEventsStore.getState();

    const facts = assembleAchievementFacts({
      logs,
      totals: { totalWorkouts: totals.totalWorkouts, totalWeightLifted: totals.totalWeightLifted },
      streaks: { currentStreak: streak.current, longestStreak: streak.longest },
      weightUnit: settings.weightUnit,
      externalWorkoutCount: externalWorkouts?.length ?? 0,
      meals: meals ?? [],
      nutritionGoals: useNutritionGoalsStore.getState().goals,
      activePlan,
      allPlans: plan.plans,
      recipesCount: useRecipeStore.getState().recipes.length,
      groceryItemsCount: useGroceryStore.getState().items.length,
      events: {
        chatMessageSent: events.chatMessageSent,
        chatMealLogged: events.chatMealLogged,
        aiMacrosGenerated: events.aiMacrosGenerated,
      },
      healthDailyMetrics: healthSummary?.dailyMetrics ?? [],
    });

    const achievements = useAchievementsStore.getState();
    const newly = evaluateAchievements(facts, new Set(Object.keys(achievements.unlocked)));
    if (newly.length === 0) return;

    // Baseline-seeding rule, moved verbatim from `hooks/use-achievements.ts`
    // (introduced by hotfix 4c74c6a): the first sync's "unlocks" are backfill
    // of already-earned progress, not fresh gameplay — persist silently, re-arm
    // the settle timer per backfill batch, and only toast once the baseline
    // is locked in.
    if (!achievements.hasSeededBaseline) {
      achievements.markUnlocked(newly.map((d) => d.key));
      if (baselineTimer) clearTimeout(baselineTimer);
      baselineTimer = setTimeout(() => {
        baselineTimer = null;
        useAchievementsStore.getState().markBaselineSeeded();
      }, BASELINE_SETTLE_MS);
      return;
    }

    achievements.markUnlocked(newly.map((d) => d.key));
    useUnlockToastStore.getState().push(newly);
  } finally {
    isEvaluating = false;
    if (pendingRerun) {
      pendingRerun = false;
      void evaluate();
    }
  }
}

/**
 * Wires the engine to a Convex client and starts listening for store changes.
 * Idempotent-safe under React effect double-invocation: each call disposes
 * any previously-registered subscriptions/timers before re-registering, so a
 * mount → unmount → remount (StrictMode / Fast Refresh) never leaks a second
 * set of listeners.
 *
 * @returns a disposer that unsubscribes from every store and clears all
 * timers (debounce, floor, and the baseline settle timer).
 */
export function initAchievementEngine(client: ConvexReactClient): () => void {
  clearAllTimers();
  convexClient = client;

  const unsubscribers = [
    useHistoryStore.subscribe(schedule),
    usePlanStore.subscribe(schedule),
    useRecipeStore.subscribe(schedule),
    useGroceryStore.subscribe(schedule),
    useNutritionGoalsStore.subscribe(schedule),
    useMealLogStore.subscribe(schedule),
    useSettingsStore.subscribe(schedule),
    useAchievementEventsStore.subscribe(schedule),
  ];

  const initialTimer = setTimeout(() => {
    runOrDefer();
  }, INITIAL_DELAY_MS);

  return () => {
    convexClient = null;
    clearTimeout(initialTimer);
    clearAllTimers();
    for (const unsub of unsubscribers) unsub();
  };
}

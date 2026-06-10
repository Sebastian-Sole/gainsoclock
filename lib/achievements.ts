import type { WorkoutLog } from './types';

/**
 * Achievements engine — pure definitions and evaluation.
 *
 * Facts are assembled client-side by `hooks/use-achievements.ts`; unlock
 * state persists in `stores/achievements-store.ts`. Definitions are
 * threshold-based: every achievement unlocks when a single numeric fact
 * reaches a target, which also gives us progress reporting for free via
 * {@link ACHIEVEMENT_TARGETS}.
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementFacts {
  totalWorkouts: number;
  totalVolumeKg: number;
  totalPrCount: number;
  currentStreak: number;
  longestStreak: number;
  externalWorkoutCount: number;
  mealsLoggedCount: number;
  weeksFullPlanAdherence: number;
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  /** lucide-react-native export name, e.g. "Dumbbell" — render via `Icon as={...}`. */
  icon: string;
  tier: AchievementTier;
  check: (facts: AchievementFacts) => boolean;
}

interface ThresholdSpec {
  key: string;
  title: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  metric: keyof AchievementFacts;
  target: number;
}

// Streak achievements use longestStreak (not currentStreak) so an unlock can
// never be "missed" by a streak that breaks between evaluations.
const SPECS: ThresholdSpec[] = [
  // Workouts
  { key: 'first-workout', title: 'First Rep', description: 'Log your first workout', icon: 'Dumbbell', tier: 'bronze', metric: 'totalWorkouts', target: 1 },
  { key: 'workouts-10', title: 'Showing Up', description: 'Log 10 workouts', icon: 'Dumbbell', tier: 'bronze', metric: 'totalWorkouts', target: 10 },
  { key: 'workouts-50', title: 'Committed', description: 'Log 50 workouts', icon: 'Medal', tier: 'silver', metric: 'totalWorkouts', target: 50 },
  { key: 'workouts-100', title: 'Century Club', description: 'Log 100 workouts', icon: 'Trophy', tier: 'gold', metric: 'totalWorkouts', target: 100 },
  // Volume lifted (kg)
  { key: 'volume-10k', title: 'Ton Up', description: 'Lift a total of 10,000 kg', icon: 'Weight', tier: 'bronze', metric: 'totalVolumeKg', target: 10_000 },
  { key: 'volume-100k', title: 'Heavy Hauler', description: 'Lift a total of 100,000 kg', icon: 'Weight', tier: 'silver', metric: 'totalVolumeKg', target: 100_000 },
  { key: 'volume-500k', title: 'Mountain Mover', description: 'Lift a total of 500,000 kg', icon: 'Weight', tier: 'gold', metric: 'totalVolumeKg', target: 500_000 },
  // Streaks
  { key: 'streak-7', title: 'One Week Strong', description: 'Reach a 7-day workout streak', icon: 'Flame', tier: 'bronze', metric: 'longestStreak', target: 7 },
  { key: 'streak-30', title: 'Habit Formed', description: 'Reach a 30-day workout streak', icon: 'Flame', tier: 'silver', metric: 'longestStreak', target: 30 },
  { key: 'streak-100', title: 'Unstoppable', description: 'Reach a 100-day workout streak', icon: 'Flame', tier: 'gold', metric: 'longestStreak', target: 100 },
  // Personal records
  { key: 'first-pr', title: 'Record Breaker', description: 'Beat a previous best for the first time', icon: 'TrendingUp', tier: 'bronze', metric: 'totalPrCount', target: 1 },
  { key: 'prs-10', title: 'PR Machine', description: 'Set 10 personal records', icon: 'TrendingUp', tier: 'silver', metric: 'totalPrCount', target: 10 },
  // Health data mesh
  { key: 'first-external', title: 'Connected', description: 'Sync your first workout from Apple Health', icon: 'Watch', tier: 'bronze', metric: 'externalWorkoutCount', target: 1 },
  // Nutrition
  { key: 'meals-10', title: 'Fuel Log', description: 'Log 10 meals', icon: 'Utensils', tier: 'bronze', metric: 'mealsLoggedCount', target: 10 },
  { key: 'meals-100', title: 'Nutrition Nerd', description: 'Log 100 meals', icon: 'Utensils', tier: 'silver', metric: 'mealsLoggedCount', target: 100 },
  // Plan adherence
  { key: 'locked-in', title: 'Locked In', description: 'Complete 4 consecutive weeks of your plan with full adherence', icon: 'Lock', tier: 'gold', metric: 'weeksFullPlanAdherence', target: 4 },
];

/**
 * Per-achievement progress targets: which fact drives the achievement and
 * the value at which it unlocks. Used by `useAchievements().progress(def)`.
 */
export const ACHIEVEMENT_TARGETS: Record<string, { metric: keyof AchievementFacts; target: number }> =
  Object.fromEntries(SPECS.map((s) => [s.key, { metric: s.metric, target: s.target }]));

/** All achievement definitions, in display order. */
export const ACHIEVEMENTS: AchievementDef[] = SPECS.map((s) => ({
  key: s.key,
  title: s.title,
  description: s.description,
  icon: s.icon,
  tier: s.tier,
  check: (facts) => facts[s.metric] >= s.target,
}));

/**
 * Returns the definitions that are NEWLY unlocked: their check passes against
 * `facts` and their key is not already in `unlockedKeys`. Pure — callers are
 * responsible for persisting the result.
 */
export function evaluateAchievements(
  facts: AchievementFacts,
  unlockedKeys: Set<string>
): AchievementDef[] {
  return ACHIEVEMENTS.filter((def) => !unlockedKeys.has(def.key) && def.check(facts));
}

/**
 * Counts weight PRs across workout logs, mirroring the server-side semantics
 * in `convex/weeklyReview.ts`: a PR is a session whose best completed
 * `reps_weight` set for an exercise strictly exceeds that exercise's best
 * across all PRIOR sessions. The first session for an exercise establishes
 * the baseline and is not a PR.
 *
 * Weights are compared in the unit they were logged in, which is consistent
 * within an exercise unless the user switches units mid-history (accepted
 * approximation — the client store doesn't record per-set units).
 */
export function countWeightPrs(logs: WorkoutLog[]): number {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  const bestByExercise = new Map<string, number>();
  let prCount = 0;

  for (const log of sorted) {
    // Best completed weight per exercise within this session.
    const sessionBest = new Map<string, number>();
    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        if (!set.completed || set.type !== 'reps_weight') continue;
        const current = sessionBest.get(exercise.exerciseId);
        if (current === undefined || set.weight > current) {
          sessionBest.set(exercise.exerciseId, set.weight);
        }
      }
    }

    for (const [exerciseId, weight] of sessionBest) {
      const prior = bestByExercise.get(exerciseId);
      if (prior === undefined) {
        bestByExercise.set(exerciseId, weight); // baseline, not a PR
      } else if (weight > prior) {
        prCount++;
        bestByExercise.set(exerciseId, weight);
      }
    }
  }

  return prCount;
}

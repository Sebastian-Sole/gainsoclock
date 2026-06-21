import type { WorkoutLog } from './types';

/**
 * Achievements engine — pure definitions and evaluation.
 *
 * Two kinds of achievement:
 * - **Leveled families** (e.g. "Streaker"): a single achievement with tiers
 *   (Streaker I/II/III…). Each level is a numeric threshold on one fact. The
 *   per-level definitions are flattened into {@link ACHIEVEMENTS} with keys
 *   `${family}.${level}` so the existing evaluate/unlock/toast machinery works
 *   unchanged; the grouped UI view comes from {@link buildAchievementGroups}.
 * - **One-offs** (e.g. "Connected"): a single milestone, no levels.
 *
 * Facts are assembled client-side by `hooks/use-achievements.ts`; unlock state
 * persists in `stores/achievements-store.ts`.
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

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** 1-indexed level → roman numeral (falls back to the number past X). */
export function romanNumeral(level: number): string {
  return ROMAN[level - 1] ?? String(level);
}

// Tier scales with how far up a family's ladder a level sits: bottom third
// bronze, middle silver, top gold. Single-level families (and one-offs) are
// bronze. Keeps the existing 3-tone primary tint system in the card.
function tierForLevel(index: number, total: number): AchievementTier {
  if (total <= 1) return 'bronze';
  const ratio = index / (total - 1);
  if (ratio < 0.34) return 'bronze';
  if (ratio < 0.67) return 'silver';
  return 'gold';
}

interface LeveledFamily {
  /** Stable family id; level keys are `${key}.${level}` (1-indexed). */
  key: string;
  /** Base title; per-level title is `${title} ${roman}`. */
  title: string;
  icon: string;
  metric: keyof AchievementFacts;
  /** Per-level description for a given threshold. */
  describe: (target: number) => string;
  /** Thresholds, ascending. */
  levels: number[];
}

interface OneOffSpec {
  key: string;
  title: string;
  description: string;
  icon: string;
  metric: keyof AchievementFacts;
  target: number;
}

// Streak family uses longestStreak (not currentStreak) so an unlock can never
// be "missed" by a streak that breaks between evaluations.
const LEVELED_FAMILIES: LeveledFamily[] = [
  {
    key: 'workouts',
    title: 'Grinder',
    icon: 'Dumbbell',
    metric: 'totalWorkouts',
    describe: (t) => `Log ${t.toLocaleString()} workout${t === 1 ? '' : 's'}`,
    levels: [1, 10, 25, 50, 100],
  },
  {
    key: 'volume',
    title: 'Heavy Lifter',
    icon: 'Weight',
    metric: 'totalVolumeKg',
    describe: (t) => `Lift a total of ${t.toLocaleString()} kg`,
    levels: [10_000, 50_000, 100_000, 250_000, 500_000],
  },
  {
    key: 'streaker',
    title: 'Streaker',
    icon: 'Flame',
    metric: 'longestStreak',
    describe: (t) => `Reach a ${t}-day workout streak`,
    levels: [3, 7, 14, 30, 60, 100],
  },
  {
    key: 'record-breaker',
    title: 'Record Breaker',
    icon: 'TrendingUp',
    metric: 'totalPrCount',
    describe: (t) =>
      t === 1 ? 'Set your first personal record' : `Set ${t} personal records`,
    levels: [1, 10, 25, 50],
  },
  {
    key: 'nutritionist',
    title: 'Nutritionist',
    icon: 'Utensils',
    metric: 'mealsLoggedCount',
    describe: (t) => `Log ${t.toLocaleString()} meals`,
    levels: [10, 50, 100, 365],
  },
  {
    key: 'adherence',
    title: 'Locked In',
    icon: 'Lock',
    metric: 'weeksFullPlanAdherence',
    describe: (t) =>
      `Complete ${t} consecutive weeks of your plan with full adherence`,
    levels: [4, 8, 12],
  },
];

const ONE_OFFS: OneOffSpec[] = [
  {
    key: 'first-external',
    title: 'Connected',
    description: 'Sync your first workout from Apple Health',
    icon: 'Watch',
    metric: 'externalWorkoutCount',
    target: 1,
  },
];

const ONE_OFF_KEYS = new Set(ONE_OFFS.map((o) => o.key));

interface FlatSpec {
  key: string;
  title: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  metric: keyof AchievementFacts;
  target: number;
}

// Flatten leveled families (one spec per level) + one-offs into the single
// threshold list the evaluate/unlock/progress machinery operates on.
const FLAT_SPECS: FlatSpec[] = [
  ...LEVELED_FAMILIES.flatMap((fam) =>
    fam.levels.map(
      (target, i): FlatSpec => ({
        key: `${fam.key}.${i + 1}`,
        title: `${fam.title} ${romanNumeral(i + 1)}`,
        description: fam.describe(target),
        icon: fam.icon,
        tier: tierForLevel(i, fam.levels.length),
        metric: fam.metric,
        target,
      })
    )
  ),
  ...ONE_OFFS.map(
    (o): FlatSpec => ({
      key: o.key,
      title: o.title,
      description: o.description,
      icon: o.icon,
      tier: 'bronze',
      metric: o.metric,
      target: o.target,
    })
  ),
];

/**
 * Per-achievement progress targets: which fact drives the achievement and the
 * value at which it unlocks. Keyed by the flat (per-level) achievement key.
 */
export const ACHIEVEMENT_TARGETS: Record<
  string,
  { metric: keyof AchievementFacts; target: number }
> = Object.fromEntries(FLAT_SPECS.map((s) => [s.key, { metric: s.metric, target: s.target }]));

/** All flat achievement definitions (one per level + one-offs), in display order. */
export const ACHIEVEMENTS: AchievementDef[] = FLAT_SPECS.map((s) => ({
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
 * A user-facing achievement card model: one entry per leveled family (showing
 * the current level and progress to the next) and one per one-off. This is what
 * the achievements grid and the records entry render — NOT the flat per-level
 * list, so "Streaker" appears once, not six times.
 */
export interface AchievementGroup {
  /** Family key (leveled) or one-off key — card key, testID, sort tiebreak. */
  key: string;
  kind: 'leveled' | 'oneoff';
  /** Current display title, e.g. "Streaker III" or "Connected". */
  title: string;
  /** Family base title without the level, e.g. "Streaker". */
  baseTitle: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  /** Highest unlocked level (0 = none unlocked yet). */
  level: number;
  /** Total levels in the family (1 for one-offs). */
  maxLevel: number;
  /** ISO timestamp of the current level's unlock, or null while locked. */
  unlockedAt: string | null;
  /** Progress toward the NEXT level, or null when maxed out. */
  progress: { current: number; target: number } | null;
}

/**
 * Builds the grouped view model from raw facts + the unlocked-key map. For a
 * leveled family the current level is the highest unlocked `${key}.${n}`, the
 * unlock date is that level's timestamp, and progress climbs toward the next
 * level's threshold (null once maxed).
 */
export function buildAchievementGroups(
  facts: AchievementFacts,
  unlocked: Map<string, string>
): AchievementGroup[] {
  const groups: AchievementGroup[] = [];

  for (const fam of LEVELED_FAMILIES) {
    const maxLevel = fam.levels.length;
    let level = 0;
    for (let i = maxLevel; i >= 1; i--) {
      if (unlocked.has(`${fam.key}.${i}`)) {
        level = i;
        break;
      }
    }
    const current = facts[fam.metric];
    const unlockedAt = level >= 1 ? unlocked.get(`${fam.key}.${level}`) ?? null : null;
    const nextTarget = level < maxLevel ? fam.levels[level] : null;

    const description =
      level === 0
        ? fam.describe(fam.levels[0])
        : nextTarget !== null
          ? `Next: ${fam.describe(nextTarget)}`
          : fam.describe(fam.levels[maxLevel - 1]);

    groups.push({
      key: fam.key,
      kind: 'leveled',
      title: level >= 1 ? `${fam.title} ${romanNumeral(level)}` : fam.title,
      baseTitle: fam.title,
      description,
      icon: fam.icon,
      tier: tierForLevel(level >= 1 ? level - 1 : 0, maxLevel),
      level,
      maxLevel,
      unlockedAt,
      progress: nextTarget !== null ? { current, target: nextTarget } : null,
    });
  }

  for (const o of ONE_OFFS) {
    const unlockedAt = unlocked.get(o.key) ?? null;
    groups.push({
      key: o.key,
      kind: 'oneoff',
      title: o.title,
      baseTitle: o.title,
      description: o.description,
      icon: o.icon,
      tier: 'bronze',
      level: unlockedAt ? 1 : 0,
      maxLevel: 1,
      unlockedAt,
      progress: unlockedAt ? null : { current: facts[o.metric], target: o.target },
    });
  }

  return groups;
}

// Legacy (pre-levels) achievement key → its family + threshold. Used by the
// store's persist migration so existing unlocks map onto the new level keys
// instead of re-firing as a burst of "unlocked" toasts after the update.
const LEGACY_KEY_MAP: Record<string, { family: string; threshold: number }> = {
  'first-workout': { family: 'workouts', threshold: 1 },
  'workouts-10': { family: 'workouts', threshold: 10 },
  'workouts-50': { family: 'workouts', threshold: 50 },
  'workouts-100': { family: 'workouts', threshold: 100 },
  'volume-10k': { family: 'volume', threshold: 10_000 },
  'volume-100k': { family: 'volume', threshold: 100_000 },
  'volume-500k': { family: 'volume', threshold: 500_000 },
  'streak-7': { family: 'streaker', threshold: 7 },
  'streak-30': { family: 'streaker', threshold: 30 },
  'streak-100': { family: 'streaker', threshold: 100 },
  'first-pr': { family: 'record-breaker', threshold: 1 },
  'prs-10': { family: 'record-breaker', threshold: 10 },
  'meals-10': { family: 'nutritionist', threshold: 10 },
  'meals-100': { family: 'nutritionist', threshold: 100 },
  'locked-in': { family: 'adherence', threshold: 4 },
  // 'first-external' is unchanged — still a one-off key in the new catalog.
};

/**
 * Maps a legacy unlocked-keys map onto the new leveled keys. For each family it
 * finds the highest legacy threshold the user earned and grants every new level
 * at or below it (carrying that unlock timestamp), so prior progress is
 * preserved without re-toasting. Already-new keys (re-runs) and current
 * one-offs pass through untouched. Pure.
 */
export function migrateLegacyUnlocks(
  old: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  const familyMax = new Map<string, { threshold: number; ts: string }>();

  for (const [key, ts] of Object.entries(old)) {
    if (key.includes('.') || ONE_OFF_KEYS.has(key)) {
      result[key] = ts; // already-new level key, or a current one-off
      continue;
    }
    const mapping = LEGACY_KEY_MAP[key];
    if (!mapping) continue; // unknown legacy key — drop; re-derives from facts
    const cur = familyMax.get(mapping.family);
    if (!cur || mapping.threshold > cur.threshold) {
      familyMax.set(mapping.family, { threshold: mapping.threshold, ts });
    }
  }

  for (const fam of LEVELED_FAMILIES) {
    const earned = familyMax.get(fam.key);
    if (!earned) continue;
    fam.levels.forEach((target, i) => {
      if (target <= earned.threshold) {
        const newKey = `${fam.key}.${i + 1}`;
        if (!(newKey in result)) result[newKey] = earned.ts;
      }
    });
  }

  return result;
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

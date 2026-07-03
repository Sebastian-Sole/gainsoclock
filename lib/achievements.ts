import { addDays, differenceInCalendarDays, getDay, startOfDay } from 'date-fns';

import type { NutritionGoals, PlanDay, WorkoutLog, WorkoutPlan } from './types';

/** 1 lb in kg — weights are logged in the user's current unit. */
const KG_PER_LB = 0.45359237;

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

  // Plans
  plansCreated: number;
  plansCompleted: number;
  plansFromChat: number;

  // Nutrition
  recipesCreated: number;
  maxMealsInDay: number;
  macroGoalDays: number;
  groceryItems: number;

  // AI coach / engagement (0/1 flags from the events store)
  chatMessages: number;
  chatMealsLogged: number;
  aiMacrosGenerated: number;

  // Health import presence (0/1)
  sleepImported: number;
  stepsImported: number;
  bodyweightLogged: number;

  // Quirky / time-of-day (0/1 flags derived from workout logs)
  workoutBefore7am: number;
  workoutAfter9pm: number;
  workoutMidnightTo4am: number;
  workoutLunch: number;
  weekendWarrior: number;
  doubleDay: number;
  comebackAfterGap: number;
  newYearWorkout: number;
  marathonSession: number;
  quickSession: number;

  // Single-session bests
  maxSessionVolumeKg: number;
  maxSessionReps: number;
  maxSessionExercises: number;
  maxSingleSetKg: number;
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

  // Plans
  { key: 'plan-architect', title: 'Architect', description: 'Create your first workout plan', icon: 'ClipboardList', metric: 'plansCreated', target: 1 },
  { key: 'perfect-week', title: 'Perfect Week', description: 'Complete every workout in a plan week', icon: 'CalendarCheck', metric: 'weeksFullPlanAdherence', target: 1 },
  { key: 'plan-finisher', title: 'Finisher', description: 'Complete an entire workout plan', icon: 'Flag', metric: 'plansCompleted', target: 1 },
  { key: 'coached-up', title: 'Coached Up', description: 'Create a workout plan with the AI coach', icon: 'Bot', metric: 'plansFromChat', target: 1 },

  // AI coach / chat
  { key: 'first-words', title: 'First Words', description: 'Send your first message to the AI coach', icon: 'MessageCircle', metric: 'chatMessages', target: 1 },
  { key: 'ai-cook', title: 'Let AI Cook', description: 'Log a meal with the AI coach', icon: 'ChefHat', metric: 'chatMealsLogged', target: 1 },
  { key: 'sous-chef', title: 'Sous Chef', description: "Estimate a recipe's macros with AI", icon: 'Sparkles', metric: 'aiMacrosGenerated', target: 1 },

  // Nutrition
  { key: 'recipe-rookie', title: 'Recipe Rookie', description: 'Create your first recipe', icon: 'BookOpen', metric: 'recipesCreated', target: 1 },
  { key: 'full-plate', title: 'Full Plate', description: 'Log 3 meals in a single day', icon: 'UtensilsCrossed', metric: 'maxMealsInDay', target: 3 },
  { key: 'macro-master', title: 'Macro Master', description: 'Hit all your macro goals in a day', icon: 'Target', metric: 'macroGoalDays', target: 1 },
  { key: 'stocked-up', title: 'Stocked Up', description: 'Build a shopping list', icon: 'ShoppingCart', metric: 'groceryItems', target: 1 },

  // Health import
  { key: 'well-rested', title: 'Well Rested', description: 'Import a night of sleep from Apple Health', icon: 'Moon', metric: 'sleepImported', target: 1 },
  { key: 'step-it-up', title: 'Step It Up', description: 'Sync your steps from Apple Health', icon: 'Footprints', metric: 'stepsImported', target: 1 },
  { key: 'weigh-in', title: 'Weigh In', description: 'Record your bodyweight via Apple Health', icon: 'Scale', metric: 'bodyweightLogged', target: 1 },

  // Quirky / time-of-day
  { key: 'early-bird', title: 'Early Bird', description: 'Start a workout before 7am', icon: 'Sunrise', metric: 'workoutBefore7am', target: 1 },
  { key: 'night-owl', title: 'Night Owl', description: 'Start a workout after 9pm', icon: 'MoonStar', metric: 'workoutAfter9pm', target: 1 },
  { key: 'midnight-oil', title: 'Burning the Midnight Oil', description: 'Work out between midnight and 4am', icon: 'Clock', metric: 'workoutMidnightTo4am', target: 1 },
  { key: 'weekend-warrior', title: 'Weekend Warrior', description: 'Train on both Saturday and Sunday', icon: 'Swords', metric: 'weekendWarrior', target: 1 },
  { key: 'lunch-break', title: 'Lunch Break', description: 'Squeeze in a workout midday (11am–2pm)', icon: 'Sandwich', metric: 'workoutLunch', target: 1 },
  { key: 'double-day', title: 'Double Day', description: 'Log two workouts in one day', icon: 'Layers', metric: 'doubleDay', target: 1 },
  { key: 'comeback-kid', title: 'Comeback Kid', description: 'Return to training after a 30-day break', icon: 'RotateCcw', metric: 'comebackAfterGap', target: 1 },
  { key: 'new-year', title: 'New Year, New Me', description: 'Work out on January 1st', icon: 'PartyPopper', metric: 'newYearWorkout', target: 1 },
  { key: 'marathoner', title: 'Marathoner', description: 'Finish a workout over 90 minutes long', icon: 'Hourglass', metric: 'marathonSession', target: 1 },
  { key: 'in-and-out', title: 'In & Out', description: 'Finish a focused workout in under 20 minutes', icon: 'Zap', metric: 'quickSession', target: 1 },

  // Single-session bests
  { key: 'volume-bomb', title: 'Volume Bomb', description: 'Lift 10,000 kg in a single workout', icon: 'Bomb', metric: 'maxSessionVolumeKg', target: 10_000 },
  { key: 'centurion', title: 'Centurion', description: 'Do 100 reps in a single workout', icon: 'Repeat2', metric: 'maxSessionReps', target: 100 },
  { key: 'variety-hour', title: 'Variety Hour', description: 'Train 8 different exercises in one workout', icon: 'Shapes', metric: 'maxSessionExercises', target: 8 },
  { key: 'heavy-single', title: 'Heavy Single', description: 'Lift 100 kg in a single set', icon: 'Anvil', metric: 'maxSingleSetKg', target: 100 },
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
 * Counts weight PRs across ALL provided workout logs: a PR is a session
 * whose best completed `reps_weight` set for an exercise strictly exceeds
 * that exercise's best across all PRIOR sessions (all-time running best).
 * The first session for an exercise establishes the baseline and is not a PR.
 *
 * DELIBERATELY DIFFERENT from the server: `convex/weeklyReview.ts` counts a
 * week's PRs against only the last MAX_PRIOR_LOGS(=60) workouts ("PR vs the
 * recent past" for the digest), so the two counts can legitimately disagree.
 * Do not "reconcile" one to the other without a product decision.
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

/** Workout-derived signals for the quirky / time-of-day / single-session achievements. */
export interface WorkoutSignals {
  workoutBefore7am: number;
  workoutAfter9pm: number;
  workoutMidnightTo4am: number;
  workoutLunch: number;
  weekendWarrior: number;
  doubleDay: number;
  comebackAfterGap: number;
  newYearWorkout: number;
  marathonSession: number;
  quickSession: number;
  maxSessionVolumeKg: number;
  maxSessionReps: number;
  maxSessionExercises: number;
  maxSingleSetKg: number;
}

const COMEBACK_GAP_DAYS = 30;

/**
 * Derives the quirky/time/single-session signals from workout logs. All times
 * are interpreted in the device's local zone (so "before 7am" means the user's
 * 7am). Weights convert to kg when the user logs in lbs, matching the
 * volume-fact convention. Pure.
 */
export function computeWorkoutSignals(
  logs: WorkoutLog[],
  weightUnitIsLbs: boolean
): WorkoutSignals {
  const factor = weightUnitIsLbs ? KG_PER_LB : 1;
  const s: WorkoutSignals = {
    workoutBefore7am: 0,
    workoutAfter9pm: 0,
    workoutMidnightTo4am: 0,
    workoutLunch: 0,
    weekendWarrior: 0,
    doubleDay: 0,
    comebackAfterGap: 0,
    newYearWorkout: 0,
    marathonSession: 0,
    quickSession: 0,
    maxSessionVolumeKg: 0,
    maxSessionReps: 0,
    maxSessionExercises: 0,
    maxSingleSetKg: 0,
  };

  // Local-midnight epoch (ms) → count of workouts that day.
  const dayCounts = new Map<number, number>();

  for (const log of logs) {
    const started = new Date(log.startedAt);
    const hour = started.getHours();
    if (hour < 7) s.workoutBefore7am = 1;
    if (hour >= 21) s.workoutAfter9pm = 1;
    if (hour < 4) s.workoutMidnightTo4am = 1;
    if (hour >= 11 && hour < 14) s.workoutLunch = 1;
    if (started.getMonth() === 0 && started.getDate() === 1) s.newYearWorkout = 1;

    // Strict bounds to match the copy ("over 90 minutes" / "under 20 minutes").
    const minutes = (log.durationSeconds ?? 0) / 60;
    if (minutes > 90) s.marathonSession = 1;
    if (minutes > 0 && minutes < 20) s.quickSession = 1;

    const dayMs = startOfDay(started).getTime();
    dayCounts.set(dayMs, (dayCounts.get(dayMs) ?? 0) + 1);

    let sessionVolume = 0;
    let sessionReps = 0;
    const exerciseIds = new Set<string>();
    for (const exercise of log.exercises) {
      exerciseIds.add(exercise.exerciseId);
      for (const set of exercise.sets) {
        if (!set.completed) continue;
        if (set.type === 'reps_weight') {
          const weightKg = (set.weight ?? 0) * factor;
          const reps = set.reps ?? 0;
          sessionVolume += weightKg * reps;
          sessionReps += reps;
          if (weightKg > s.maxSingleSetKg) s.maxSingleSetKg = weightKg;
        } else if (set.type === 'reps_time' || set.type === 'reps_only') {
          sessionReps += set.reps ?? 0;
        }
      }
    }
    if (sessionVolume > s.maxSessionVolumeKg) s.maxSessionVolumeKg = sessionVolume;
    if (sessionReps > s.maxSessionReps) s.maxSessionReps = sessionReps;
    if (exerciseIds.size > s.maxSessionExercises) s.maxSessionExercises = exerciseIds.size;
  }

  const days = [...dayCounts.keys()].sort((a, b) => a - b);
  if ([...dayCounts.values()].some((c) => c >= 2)) s.doubleDay = 1;

  const daySet = new Set(days);
  for (const dayMs of days) {
    // Saturday with a workout the next day → trained the whole weekend.
    if (getDay(new Date(dayMs)) === 6) {
      const sunday = startOfDay(addDays(new Date(dayMs), 1)).getTime();
      if (daySet.has(sunday)) {
        s.weekendWarrior = 1;
        break;
      }
    }
  }

  // Calendar-day diff (not raw ms) so a 30-day gap spanning a DST change still
  // counts — ms-deltas between local midnights drift by the ±1h offset.
  for (let i = 1; i < days.length; i++) {
    if (differenceInCalendarDays(new Date(days[i]), new Date(days[i - 1])) >= COMEBACK_GAP_DAYS) {
      s.comebackAfterGap = 1;
      break;
    }
  }

  return s;
}

/** Per-day nutrition signals: busiest logging day + days that hit every macro goal. */
export function computeMealDaySignals(
  meals: { date: string; macros: { calories: number; protein: number; carbs: number; fat: number } }[],
  goals: { calories: number; protein: number; carbs: number; fat: number }
): { maxMealsInDay: number; macroGoalDays: number } {
  const byDate = new Map<
    string,
    { count: number; calories: number; protein: number; carbs: number; fat: number }
  >();
  for (const meal of meals) {
    const entry =
      byDate.get(meal.date) ?? { count: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
    entry.count += 1;
    entry.calories += meal.macros.calories;
    entry.protein += meal.macros.protein;
    entry.carbs += meal.macros.carbs;
    entry.fat += meal.macros.fat;
    byDate.set(meal.date, entry);
  }

  // A "goal day" requires every goal to be set (>0) and met — otherwise a
  // zeroed goal would unlock it trivially.
  const goalsSet =
    goals.calories > 0 && goals.protein > 0 && goals.carbs > 0 && goals.fat > 0;

  let maxMealsInDay = 0;
  let macroGoalDays = 0;
  for (const entry of byDate.values()) {
    if (entry.count > maxMealsInDay) maxMealsInDay = entry.count;
    if (
      goalsSet &&
      entry.calories >= goals.calories &&
      entry.protein >= goals.protein &&
      entry.carbs >= goals.carbs &&
      entry.fat >= goals.fat
    ) {
      macroGoalDays += 1;
    }
  }

  return { maxMealsInDay, macroGoalDays };
}

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
export function computeWeeksFullPlanAdherence(
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

/** A single meal-log row's fields consumed by fact assembly (superset OK). */
export interface MealLogFact {
  date: string;
  macros: { calories: number; protein: number; carbs: number; fat: number };
}

/** A single `getHealthSummary` daily-metric row's fields consumed by fact assembly. */
export interface HealthDailyMetricFact {
  date: string;
  asleepSeconds?: number;
  steps?: number;
  bodyMassKg?: number;
}

/** The active plan, with its days, as needed for adherence tracking. */
export interface ActivePlanFact extends Pick<WorkoutPlan, 'status' | 'durationWeeks'> {
  days: PlanDay[];
}

/**
 * Everything {@link assembleAchievementFacts} needs, pre-resolved by the
 * caller (a hook or the standalone engine). Loading/missing data is
 * represented as `[]`/`0`/`false` — never `undefined` — so the function
 * itself never has to special-case "not loaded yet".
 */
export interface FactSources {
  logs: WorkoutLog[];
  totals: { totalWorkouts: number; totalWeightLifted: number };
  streaks: { currentStreak: number; longestStreak: number };
  weightUnit: 'kg' | 'lbs';
  externalWorkoutCount: number;
  meals: MealLogFact[];
  nutritionGoals: NutritionGoals;
  activePlan: ActivePlanFact | null;
  allPlans: WorkoutPlan[];
  recipesCount: number;
  groceryItemsCount: number;
  events: { chatMessageSent: boolean; chatMealLogged: boolean; aiMacrosGenerated: boolean };
  healthDailyMetrics: HealthDailyMetricFact[];
}

/**
 * Assembles {@link AchievementFacts} from pre-resolved fact sources. Pure —
 * callers (currently `hooks/use-achievements.ts` and `lib/achievement-engine.ts`)
 * are responsible for sourcing `FactSources` from stores/Convex and passing
 * `[]`/`0` for anything still loading (false negatives only, never false
 * unlocks — see field docs on `FactSources`).
 */
export function assembleAchievementFacts(src: FactSources): AchievementFacts {
  const workout = computeWorkoutSignals(src.logs, src.weightUnit === 'lbs');
  const mealDays = computeMealDaySignals(src.meals, src.nutritionGoals);

  return {
    totalWorkouts: src.totals.totalWorkouts,
    totalVolumeKg:
      src.weightUnit === 'lbs'
        ? src.totals.totalWeightLifted * KG_PER_LB
        : src.totals.totalWeightLifted,
    totalPrCount: countWeightPrs(src.logs),
    currentStreak: src.streaks.currentStreak,
    longestStreak: src.streaks.longestStreak,
    externalWorkoutCount: src.externalWorkoutCount,
    mealsLoggedCount: src.meals.length,
    weeksFullPlanAdherence: computeWeeksFullPlanAdherence(
      src.activePlan && src.activePlan.status === 'active' ? src.activePlan : null
    ),

    // Plans
    plansCreated: src.allPlans.length,
    plansCompleted: src.allPlans.filter((p) => p.status === 'completed').length,
    plansFromChat: src.allPlans.filter((p) => p.sourceConversationClientId).length,

    // Nutrition
    recipesCreated: src.recipesCount,
    maxMealsInDay: mealDays.maxMealsInDay,
    macroGoalDays: mealDays.macroGoalDays,
    groceryItems: src.groceryItemsCount,

    // AI coach / engagement
    chatMessages: src.events.chatMessageSent ? 1 : 0,
    chatMealsLogged: src.events.chatMealLogged ? 1 : 0,
    aiMacrosGenerated: src.events.aiMacrosGenerated ? 1 : 0,

    // Health import presence
    sleepImported: src.healthDailyMetrics.some((d) => d.asleepSeconds !== undefined) ? 1 : 0,
    stepsImported: src.healthDailyMetrics.some((d) => d.steps !== undefined) ? 1 : 0,
    bodyweightLogged: src.healthDailyMetrics.some((d) => d.bodyMassKg !== undefined) ? 1 : 0,

    // Quirky / single-session (from workout logs)
    ...workout,
  };
}

import { describe, expect, it } from 'vitest';

import {
  assembleAchievementFacts,
  buildAchievementGroups,
  computeMealDaySignals,
  computeWeeksFullPlanAdherence,
  computeWorkoutSignals,
  countWeightPrs,
  migrateLegacyUnlocks,
  type AchievementFacts,
  type FactSources,
} from './achievements';
import type { PlanDay, WorkoutLog, WorkoutLogExercise, WorkoutPlan, WorkoutSet } from './types';

// --- workout fixtures (local-time ISO strings, no `Z`, so getHours() is stable) ---
function rw(weight: number, reps: number): WorkoutSet {
  return { id: 's', type: 'reps_weight', completed: true, weight, reps };
}
function ex(exerciseId: string, sets: WorkoutSet[]): WorkoutLogExercise {
  return {
    id: `ex-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    type: 'reps_weight',
    order: 0,
    restTimeSeconds: 0,
    sets,
  };
}
function mkLog(
  startedAt: string,
  exercises: WorkoutLogExercise[],
  durationSeconds = 3600
): WorkoutLog {
  return { id: `log-${startedAt}`, templateName: 'T', exercises, startedAt, completedAt: startedAt, durationSeconds };
}

const TS = '2026-01-02T03:04:05.000Z';

function facts(partial: Partial<AchievementFacts> = {}): AchievementFacts {
  return {
    totalWorkouts: 0,
    totalVolumeKg: 0,
    totalPrCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    externalWorkoutCount: 0,
    mealsLoggedCount: 0,
    weeksFullPlanAdherence: 0,
    plansCreated: 0,
    plansCompleted: 0,
    plansFromChat: 0,
    recipesCreated: 0,
    maxMealsInDay: 0,
    macroGoalDays: 0,
    groceryItems: 0,
    chatMessages: 0,
    chatMealsLogged: 0,
    aiMacrosGenerated: 0,
    sleepImported: 0,
    stepsImported: 0,
    bodyweightLogged: 0,
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
    ...partial,
  };
}

function group(groups: ReturnType<typeof buildAchievementGroups>, key: string) {
  const g = groups.find((x) => x.key === key);
  if (!g) throw new Error(`no group ${key}`);
  return g;
}

function mkPlan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: 'plan-1',
    name: 'Plan',
    description: '',
    durationWeeks: 4,
    startDate: '2026-01-01',
    status: 'active',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function mkDay(week: number, dayOfWeek: number, status: PlanDay['status']): PlanDay {
  return { planClientId: 'plan-1', week, dayOfWeek, status };
}

/** All-zeroed FactSources — every array/count field empty or 0. */
function zeroedSources(): FactSources {
  return {
    logs: [],
    totals: { totalWorkouts: 0, totalWeightLifted: 0 },
    streaks: { currentStreak: 0, longestStreak: 0 },
    weightUnit: 'kg',
    externalWorkoutCount: 0,
    meals: [],
    nutritionGoals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    activePlan: null,
    allPlans: [],
    recipesCount: 0,
    groceryItemsCount: 0,
    events: { chatMessageSent: false, chatMealLogged: false, aiMacrosGenerated: false },
    healthDailyMetrics: [],
  };
}

describe('migrateLegacyUnlocks', () => {
  it('maps a legacy streak key onto every level at or below its threshold', () => {
    // streak-7 → streaker levels [3, 7] (both ≤ 7), not 14+.
    const out = migrateLegacyUnlocks({ 'streak-7': TS });
    expect(out).toEqual({ 'streaker.1': TS, 'streaker.2': TS });
  });

  it('fills intermediate levels up to the highest earned threshold', () => {
    // workouts-50 → workouts levels [1, 10, 25, 50], not 100.
    const out = migrateLegacyUnlocks({ 'workouts-50': TS });
    expect(Object.keys(out).sort()).toEqual([
      'workouts.1',
      'workouts.2',
      'workouts.3',
      'workouts.4',
    ]);
  });

  it('uses the highest earned legacy threshold when several are present', () => {
    const out = migrateLegacyUnlocks({
      'first-workout': '2025-01-01T00:00:00.000Z',
      'workouts-10': TS,
    });
    // max earned = 10 → levels 1 and 2, both carrying the max key's timestamp.
    expect(out).toEqual({ 'workouts.1': TS, 'workouts.2': TS });
  });

  it('passes one-off keys through unchanged', () => {
    const out = migrateLegacyUnlocks({ 'first-external': TS });
    expect(out).toEqual({ 'first-external': TS });
  });

  it('is idempotent for already-migrated (dotted) keys', () => {
    const already = { 'streaker.1': TS, 'streaker.2': TS };
    expect(migrateLegacyUnlocks(already)).toEqual(already);
  });

  it('drops unknown legacy keys (they re-derive from facts)', () => {
    expect(migrateLegacyUnlocks({ 'bogus-key': TS })).toEqual({});
  });
});

describe('buildAchievementGroups', () => {
  it('reports level 0 and progress to the first threshold when nothing is unlocked', () => {
    const groups = buildAchievementGroups(facts({ longestStreak: 2 }), new Map());
    const streaker = group(groups, 'streaker');
    expect(streaker.level).toBe(0);
    expect(streaker.title).toBe('Streaker');
    expect(streaker.unlockedAt).toBeNull();
    expect(streaker.progress).toEqual({ current: 2, target: 3 });
  });

  it('reports the current level, title, and climb to the next level', () => {
    const unlocked = new Map([
      ['streaker.1', TS],
      ['streaker.2', TS],
    ]);
    const streaker = group(
      buildAchievementGroups(facts({ longestStreak: 7 }), unlocked),
      'streaker'
    );
    expect(streaker.level).toBe(2);
    expect(streaker.title).toBe('Streaker II');
    expect(streaker.unlockedAt).toBe(TS);
    // next level is 14; current longestStreak is 7.
    expect(streaker.progress).toEqual({ current: 7, target: 14 });
  });

  it('has null progress once the family is maxed out', () => {
    const unlocked = new Map(
      ['streaker.1', 'streaker.2', 'streaker.3', 'streaker.4', 'streaker.5', 'streaker.6'].map(
        (k) => [k, TS] as const
      )
    );
    const streaker = group(
      buildAchievementGroups(facts({ longestStreak: 120 }), unlocked),
      'streaker'
    );
    expect(streaker.level).toBe(streaker.maxLevel);
    expect(streaker.progress).toBeNull();
  });

  it('treats one-offs as a single unlockable with no levels', () => {
    const locked = group(buildAchievementGroups(facts(), new Map()), 'first-external');
    expect(locked.kind).toBe('oneoff');
    expect(locked.maxLevel).toBe(1);
    expect(locked.level).toBe(0);
    expect(locked.progress).toEqual({ current: 0, target: 1 });

    const unlocked = group(
      buildAchievementGroups(
        facts({ externalWorkoutCount: 1 }),
        new Map([['first-external', TS]])
      ),
      'first-external'
    );
    expect(unlocked.level).toBe(1);
    expect(unlocked.unlockedAt).toBe(TS);
    expect(unlocked.progress).toBeNull();
  });

  it('renders a new one-off (Early Bird) as a single unlockable', () => {
    const g = group(
      buildAchievementGroups(
        facts({ workoutBefore7am: 1 }),
        new Map([['early-bird', TS]])
      ),
      'early-bird'
    );
    expect(g.title).toBe('Early Bird');
    expect(g.level).toBe(1);
    expect(g.unlockedAt).toBe(TS);
  });
});

describe('computeWorkoutSignals', () => {
  it('flags an early-bird workout and computes single-session bests (kg)', () => {
    const s = computeWorkoutSignals(
      [mkLog('2026-03-10T06:30:00', [ex('bench', [rw(100, 5)])])],
      false
    );
    expect(s.workoutBefore7am).toBe(1);
    expect(s.maxSingleSetKg).toBe(100);
    expect(s.maxSessionVolumeKg).toBe(500);
    expect(s.maxSessionReps).toBe(5);
    expect(s.maxSessionExercises).toBe(1);
  });

  it('converts weights to kg when the user logs in lbs', () => {
    const s = computeWorkoutSignals(
      [mkLog('2026-03-10T10:00:00', [ex('bench', [rw(100, 1)])])],
      true
    );
    expect(s.maxSingleSetKg).toBeCloseTo(45.359, 2);
  });

  it('detects two workouts in one day', () => {
    const s = computeWorkoutSignals(
      [
        mkLog('2026-03-10T08:00:00', [ex('a', [rw(50, 5)])]),
        mkLog('2026-03-10T18:00:00', [ex('a', [rw(50, 5)])]),
      ],
      false
    );
    expect(s.doubleDay).toBe(1);
  });

  it('detects a 30+ day comeback gap', () => {
    const s = computeWorkoutSignals(
      [
        mkLog('2026-01-01T10:00:00', [ex('a', [rw(50, 5)])]),
        mkLog('2026-02-20T10:00:00', [ex('a', [rw(50, 5)])]),
      ],
      false
    );
    expect(s.comebackAfterGap).toBe(1);
  });

  it('detects a Saturday+Sunday weekend (2026-01-03/04)', () => {
    const s = computeWorkoutSignals(
      [
        mkLog('2026-01-03T10:00:00', [ex('a', [rw(50, 5)])]),
        mkLog('2026-01-04T10:00:00', [ex('a', [rw(50, 5)])]),
      ],
      false
    );
    expect(s.weekendWarrior).toBe(1);
  });

  it('flags marathon and quick sessions by duration', () => {
    const s = computeWorkoutSignals(
      [
        mkLog('2026-03-10T10:00:00', [ex('a', [rw(50, 5)])], 6000), // 100 min
        mkLog('2026-03-11T10:00:00', [ex('a', [rw(50, 5)])], 600), // 10 min
      ],
      false
    );
    expect(s.marathonSession).toBe(1);
    expect(s.quickSession).toBe(1);
  });

  it('uses strict duration bounds matching the copy (exactly 20/90 do not count)', () => {
    const s = computeWorkoutSignals(
      [
        mkLog('2026-03-10T10:00:00', [ex('a', [rw(50, 5)])], 5400), // exactly 90 min
        mkLog('2026-03-11T10:00:00', [ex('a', [rw(50, 5)])], 1200), // exactly 20 min
      ],
      false
    );
    expect(s.marathonSession).toBe(0);
    expect(s.quickSession).toBe(0);
  });

  it('counts a comeback gap that spans the US spring-forward DST change', () => {
    // 2026-03-08 is spring-forward in US zones; this 30-calendar-day gap is
    // 30*24h − 1h in raw ms, which a millisecond threshold would miss.
    const s = computeWorkoutSignals(
      [
        mkLog('2026-02-20T10:00:00', [ex('a', [rw(50, 5)])]),
        mkLog('2026-03-22T10:00:00', [ex('a', [rw(50, 5)])]),
      ],
      false
    );
    expect(s.comebackAfterGap).toBe(1);
  });

  it('counts distinct exercises in a single session', () => {
    const exercises = Array.from({ length: 8 }, (_, i) => ex(`e${i}`, [rw(20, 10)]));
    const s = computeWorkoutSignals([mkLog('2026-03-10T10:00:00', exercises)], false);
    expect(s.maxSessionExercises).toBe(8);
  });

  it('returns all-zero for no logs', () => {
    const s = computeWorkoutSignals([], false);
    expect(s.doubleDay).toBe(0);
    expect(s.maxSessionExercises).toBe(0);
    expect(s.weekendWarrior).toBe(0);
  });
});

// Characterization tests for the client's all-time PR count. These pin
// CURRENT behavior — see the divergence note on countWeightPrs's doc
// comment for why this differs from convex/weeklyReview.ts's bounded window.
describe('countWeightPrs', () => {
  it('returns 0 for no logs', () => {
    expect(countWeightPrs([])).toBe(0);
  });

  it('does not count the first session for an exercise as a PR (baseline)', () => {
    const logs = [mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])])];
    expect(countWeightPrs(logs)).toBe(0);
  });

  it('counts a strictly heavier session as a PR; an equal-weight session is not a PR', () => {
    const logs = [
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])]), // baseline
      mkLog('2026-01-08T10:00:00', [ex('bench', [rw(110, 5)])]), // PR
      mkLog('2026-01-15T10:00:00', [ex('bench', [rw(110, 5)])]), // equal, not a PR (strict >)
    ];
    expect(countWeightPrs(logs)).toBe(1);
  });

  it('counts only one PR per session even with multiple improving sets', () => {
    const logs = [
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])]), // baseline
      mkLog('2026-01-08T10:00:00', [
        ex('bench', [rw(110, 5), rw(120, 3)]), // both beat the baseline; session best is 120
      ]),
    ];
    expect(countWeightPrs(logs)).toBe(1);
  });

  it('ignores uncompleted sets and non-reps_weight sets', () => {
    const logs = [
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])]), // baseline
      mkLog('2026-01-08T10:00:00', [
        ex('bench', [
          { id: 's', type: 'reps_weight', completed: false, weight: 200, reps: 5 }, // uncompleted, ignored
          { id: 's', type: 'reps_only', completed: true, reps: 20 }, // wrong type, ignored
        ]),
      ]),
    ];
    expect(countWeightPrs(logs)).toBe(0);
  });

  it('tracks two exercises independently, one PR each', () => {
    const logs = [
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)]), ex('squat', [rw(150, 5)])]),
      mkLog('2026-01-08T10:00:00', [ex('bench', [rw(110, 5)]), ex('squat', [rw(160, 5)])]),
    ];
    expect(countWeightPrs(logs)).toBe(2);
  });

  it('sorts logs by startedAt regardless of input order', () => {
    const logs = [
      mkLog('2026-01-08T10:00:00', [ex('bench', [rw(110, 5)])]), // later session, given first
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])]), // earlier session (baseline), given second
    ];
    expect(countWeightPrs(logs)).toBe(1);
  });

  it('does not reset the baseline on a lighter (regression) session', () => {
    const logs = [
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])]), // baseline
      mkLog('2026-01-08T10:00:00', [ex('bench', [rw(80, 5)])]), // regression, not a PR
      mkLog('2026-01-15T10:00:00', [ex('bench', [rw(100, 5)])]), // ties original best, not a PR
      mkLog('2026-01-22T10:00:00', [ex('bench', [rw(105, 5)])]), // PR vs 100
    ];
    expect(countWeightPrs(logs)).toBe(1);
  });
});

describe('computeMealDaySignals', () => {
  const goals = { calories: 2000, protein: 150, carbs: 200, fat: 60 };

  it('counts the busiest day and days that meet every macro goal', () => {
    const meals = [
      { date: '2026-03-10', macros: { calories: 800, protein: 60, carbs: 80, fat: 25 } },
      { date: '2026-03-10', macros: { calories: 800, protein: 60, carbs: 80, fat: 25 } },
      { date: '2026-03-10', macros: { calories: 600, protein: 40, carbs: 60, fat: 15 } },
      { date: '2026-03-11', macros: { calories: 100, protein: 5, carbs: 10, fat: 2 } },
    ];
    const r = computeMealDaySignals(meals, goals);
    expect(r.maxMealsInDay).toBe(3);
    expect(r.macroGoalDays).toBe(1); // only 03-10 totals clear every goal
  });

  it('never counts a goal day when goals are unset (all zero)', () => {
    const r = computeMealDaySignals(
      [{ date: 'd', macros: { calories: 9999, protein: 999, carbs: 999, fat: 999 } }],
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    expect(r.macroGoalDays).toBe(0);
    expect(r.maxMealsInDay).toBe(1);
  });
});

describe('computeWeeksFullPlanAdherence', () => {
  it('counts a fully-adherent run across every week', () => {
    const plan = {
      durationWeeks: 4,
      days: [
        mkDay(1, 1, 'completed'),
        mkDay(1, 3, 'rest'),
        mkDay(2, 1, 'completed'),
        mkDay(2, 3, 'completed'),
        mkDay(3, 1, 'rest'),
        mkDay(3, 3, 'completed'),
        mkDay(4, 1, 'completed'),
        mkDay(4, 3, 'rest'),
      ],
    };
    expect(computeWeeksFullPlanAdherence(plan)).toBe(4);
  });

  it('breaks the run at a week with a pending or skipped day', () => {
    const plan = {
      durationWeeks: 4,
      days: [
        mkDay(1, 1, 'completed'),
        mkDay(2, 1, 'completed'),
        mkDay(3, 1, 'pending'), // breaks the run
        mkDay(4, 1, 'completed'),
      ],
    };
    // Weeks 1-2 form a 2-week adherent run; week 3 (pending) resets it, and
    // week 4 alone only reaches a run of 1 — so the max run is 2.
    expect(computeWeeksFullPlanAdherence(plan)).toBe(2);
  });

  it('does not count an all-rest week as adherent', () => {
    const plan = {
      durationWeeks: 2,
      days: [mkDay(1, 1, 'rest'), mkDay(1, 3, 'rest'), mkDay(2, 1, 'completed')],
    };
    // Week 1 has no completed day → not adherent → run resets before week 2.
    expect(computeWeeksFullPlanAdherence(plan)).toBe(1);
  });

  it('returns 0 for a null plan or a plan with no days', () => {
    expect(computeWeeksFullPlanAdherence(null)).toBe(0);
    expect(computeWeeksFullPlanAdherence({ durationWeeks: 4, days: [] })).toBe(0);
  });
});

describe('assembleAchievementFacts', () => {
  it('zeroed sources produce zeroed facts (loading contract)', () => {
    expect(assembleAchievementFacts(zeroedSources())).toEqual(facts());
  });

  it('spot-checks totalPrCount, mealsLoggedCount, plansCompleted, and kg conversion', () => {
    const logs: WorkoutLog[] = [
      mkLog('2026-01-01T10:00:00', [ex('bench', [rw(100, 5)])]),
      mkLog('2026-01-08T10:00:00', [ex('bench', [rw(120, 5)])]), // PR: 120 > 100
    ];
    const meals = [
      { date: '2026-03-10', macros: { calories: 800, protein: 60, carbs: 80, fat: 25 } },
      { date: '2026-03-11', macros: { calories: 800, protein: 60, carbs: 80, fat: 25 } },
      { date: '2026-03-12', macros: { calories: 800, protein: 60, carbs: 80, fat: 25 } },
    ];
    const allPlans = [
      mkPlan({ id: 'p1', status: 'completed' }),
      mkPlan({ id: 'p2', status: 'active' }),
      mkPlan({ id: 'p3', status: 'completed', sourceConversationClientId: 'c1' }),
    ];

    const result = assembleAchievementFacts({
      ...zeroedSources(),
      logs,
      totals: { totalWorkouts: 2, totalWeightLifted: 1000 },
      weightUnit: 'lbs',
      meals,
      allPlans,
    });

    expect(result.totalPrCount).toBe(1);
    expect(result.mealsLoggedCount).toBe(3);
    expect(result.plansCompleted).toBe(2);
    expect(result.plansFromChat).toBe(1);
    // 1000 lbs → kg conversion (1 lb = 0.45359237 kg).
    expect(result.totalVolumeKg).toBeCloseTo(453.59237, 4);
  });

  it('does not convert totalVolumeKg when the unit is already kg', () => {
    const result = assembleAchievementFacts({
      ...zeroedSources(),
      totals: { totalWorkouts: 1, totalWeightLifted: 1000 },
      weightUnit: 'kg',
    });
    expect(result.totalVolumeKg).toBe(1000);
  });

  it('feeds an active plan into weeksFullPlanAdherence but ignores a paused/completed one', () => {
    const days: PlanDay[] = [mkDay(1, 1, 'completed'), mkDay(2, 1, 'completed')];

    const active = assembleAchievementFacts({
      ...zeroedSources(),
      activePlan: { status: 'active', durationWeeks: 2, days },
    });
    expect(active.weeksFullPlanAdherence).toBe(2);

    const paused = assembleAchievementFacts({
      ...zeroedSources(),
      activePlan: { status: 'paused', durationWeeks: 2, days },
    });
    expect(paused.weeksFullPlanAdherence).toBe(0);
  });

  it('derives health-import flags from healthDailyMetrics presence', () => {
    const result = assembleAchievementFacts({
      ...zeroedSources(),
      healthDailyMetrics: [{ date: '2026-01-01', asleepSeconds: 1000, steps: 500 }],
    });
    expect(result.sleepImported).toBe(1);
    expect(result.stepsImported).toBe(1);
    expect(result.bodyweightLogged).toBe(0);
  });

  it('maps engagement events to 0/1 flags', () => {
    const result = assembleAchievementFacts({
      ...zeroedSources(),
      events: { chatMessageSent: true, chatMealLogged: false, aiMacrosGenerated: true },
    });
    expect(result.chatMessages).toBe(1);
    expect(result.chatMealsLogged).toBe(0);
    expect(result.aiMacrosGenerated).toBe(1);
  });
});

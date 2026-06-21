import { describe, expect, it } from 'vitest';

import {
  buildAchievementGroups,
  migrateLegacyUnlocks,
  type AchievementFacts,
} from './achievements';

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
    ...partial,
  };
}

function group(groups: ReturnType<typeof buildAchievementGroups>, key: string) {
  const g = groups.find((x) => x.key === key);
  if (!g) throw new Error(`no group ${key}`);
  return g;
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
});

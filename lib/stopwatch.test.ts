import { describe, expect, it } from 'vitest';

import {
  applyEffortsToSets,
  createStopwatch,
  discardEffort,
  effortLogSeconds,
  effortMs,
  effortTarget,
  formatStopwatch,
  hasStopwatchData,
  isStopwatchRunning,
  pauseStopwatch,
  pendingEffortsSeconds,
  resetEffort,
  restMs,
  startNextEffort,
  startStopwatch,
} from './stopwatch';
import type { WorkoutSet } from './types';

const T0 = 1_700_000_000_000;

const makeSet = (id: string, completed = false, time?: number): WorkoutSet => ({
  id,
  completed,
  type: 'time_only',
  time,
});

describe('effort recording', () => {
  it('starts idle: not running, no data, zero readouts', () => {
    const sw = createStopwatch('ex1');
    expect(isStopwatchRunning(sw)).toBe(false);
    expect(hasStopwatchData(sw)).toBe(false);
    expect(effortMs(sw, T0)).toBe(0);
    expect(restMs(sw, T0)).toBe(0);
  });

  it('counts the current effort while running', () => {
    const sw = startStopwatch(createStopwatch('ex1'), T0);
    expect(isStopwatchRunning(sw)).toBe(true);
    expect(hasStopwatchData(sw)).toBe(true);
    expect(effortMs(sw, T0 + 5_500)).toBe(5_500);
  });

  it('start is a no-op while running (anchor preserved)', () => {
    const sw = startStopwatch(createStopwatch('ex1'), T0);
    expect(startStopwatch(sw, T0 + 3_000)).toBe(sw);
  });

  it('stop freezes the effort and starts the rest readout', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 45_000);
    expect(effortMs(sw, T0 + 90_000)).toBe(45_000); // frozen
    expect(restMs(sw, T0 + 77_000)).toBe(32_000); // rest ticks
  });

  it('resume continues the same effort and clears the rest readout', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 40_000); // accidental stop
    sw = startStopwatch(sw, T0 + 45_000);
    expect(restMs(sw, T0 + 50_000)).toBe(0);
    expect(effortMs(sw, T0 + 50_000)).toBe(45_000); // 40s + 5s, rest not counted
  });

  it('start next set banks the frozen effort and times the next from zero', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 45_000);
    sw = startNextEffort(sw, T0 + 105_000); // after 60s untimed rest
    expect(sw.efforts).toEqual([45_000]);
    expect(isStopwatchRunning(sw)).toBe(true);
    expect(effortMs(sw, T0 + 110_000)).toBe(5_000);
  });

  it('start next set refuses while running or with a sub-second effort', () => {
    const running = startStopwatch(createStopwatch('ex1'), T0);
    expect(startNextEffort(running, T0 + 5_000)).toBe(running);
    const blip = pauseStopwatch(running, T0 + 500);
    expect(startNextEffort(blip, T0 + 2_000)).toBe(blip);
  });

  it('resetEffort clears only the current stopped time, keeping recorded efforts', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 30_000);
    sw = startNextEffort(sw, T0 + 60_000);
    sw = pauseStopwatch(sw, T0 + 75_000);
    const r = resetEffort(sw);
    expect(r.efforts).toEqual([30_000]);
    expect(effortMs(r, T0 + 99_000)).toBe(0);
    expect(restMs(r, T0 + 99_000)).toBe(0);
  });

  it('resetEffort is a no-op while running', () => {
    const sw = startStopwatch(createStopwatch('ex1'), T0);
    expect(resetEffort(sw)).toBe(sw);
  });

  it('discardEffort drops one recorded effort, ignoring bad indices', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 30_000);
    sw = startNextEffort(sw, T0 + 60_000);
    sw = pauseStopwatch(sw, T0 + 100_000);
    sw = startNextEffort(sw, T0 + 130_000);
    sw = pauseStopwatch(sw, T0 + 165_000);
    expect(discardEffort(sw, 1).efforts).toEqual([30_000]);
    expect(discardEffort(sw, 5)).toBe(sw);
  });

  it('elapsed never shrinks if the clock jumps backwards', () => {
    const sw = startStopwatch(createStopwatch('ex1'), T0);
    expect(effortMs(sw, T0 - 5_000)).toBe(0);
  });
});

describe('pendingEffortsSeconds', () => {
  it('includes the current frozen effort so Start→Stop→Log works', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 83_400);
    expect(pendingEffortsSeconds(sw, T0 + 90_000)).toEqual([83]);
  });

  it('combines banked efforts with the frozen one', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 45_000);
    sw = startNextEffort(sw, T0 + 105_000);
    sw = pauseStopwatch(sw, T0 + 146_000);
    expect(pendingEffortsSeconds(sw, T0 + 150_000)).toEqual([45, 41]);
  });

  it('excludes a sub-second frozen blip and anything while running', () => {
    let sw = startStopwatch(createStopwatch('ex1'), T0);
    sw = pauseStopwatch(sw, T0 + 400);
    expect(pendingEffortsSeconds(sw, T0 + 5_000)).toEqual([]);
    const running = startStopwatch(createStopwatch('ex1'), T0);
    expect(pendingEffortsSeconds(running, T0 + 30_000)).toEqual([]);
  });
});

describe('effortLogSeconds', () => {
  it('rounds to whole seconds and never logs zero', () => {
    expect(effortLogSeconds(45_400)).toBe(45);
    expect(effortLogSeconds(45_600)).toBe(46);
    expect(effortLogSeconds(0)).toBe(1);
  });
});

describe('applyEffortsToSets', () => {
  const create = (() => {
    let n = 0;
    return (template: WorkoutSet | undefined): WorkoutSet => ({
      ...(template ?? makeSet('tpl')),
      id: `new${++n}`,
      completed: false,
    });
  })();

  it('fills incomplete sets in order and completes them', () => {
    const sets = [makeSet('a'), makeSet('b'), makeSet('c')];
    const result = applyEffortsToSets(sets, [45, 41], create);
    expect(result.map((s) => [s.time, s.completed])).toEqual([
      [45, true],
      [41, true],
      [undefined, false],
    ]);
  });

  it('skips already-completed sets without touching them', () => {
    const sets = [makeSet('a', true, 50), makeSet('b'), makeSet('c', true, 48), makeSet('d')];
    const result = applyEffortsToSets(sets, [45, 41], create);
    expect(result.map((s) => s.time)).toEqual([50, 45, 48, 41]);
    expect(result[0].completed && result[2].completed).toBe(true);
  });

  it('creates sets for efforts beyond the plan — 5 efforts, 3 planned sets → 5 sets', () => {
    const sets = [makeSet('a'), makeSet('b'), makeSet('c')];
    const result = applyEffortsToSets(sets, [45, 41, 38, 36, 33], create);
    expect(result).toHaveLength(5);
    expect(result.map((s) => s.time)).toEqual([45, 41, 38, 36, 33]);
    expect(result.every((s) => s.completed)).toBe(true);
  });

  it('creates from a template even when the exercise had no sets', () => {
    const result = applyEffortsToSets([], [30], create);
    expect(result).toHaveLength(1);
    expect(result[0].time).toBe(30);
    expect(result[0].completed).toBe(true);
  });
});

describe('effortTarget', () => {
  const sets = [makeSet('a', true), makeSet('b'), makeSet('c')];

  it('points at incomplete sets in order', () => {
    expect(effortTarget(sets, 0)).toEqual({ setNumber: 2, isNew: false });
    expect(effortTarget(sets, 1)).toEqual({ setNumber: 3, isNew: false });
  });

  it('flags overflow efforts as new sets with continuing numbers', () => {
    expect(effortTarget(sets, 2)).toEqual({ setNumber: 4, isNew: true });
    expect(effortTarget(sets, 3)).toEqual({ setNumber: 5, isNew: true });
  });
});

describe('formatStopwatch', () => {
  it('shows m:ss.tenths under an hour', () => {
    expect(formatStopwatch(0)).toBe('0:00.0');
    expect(formatStopwatch(83_450)).toBe('1:23.4');
    expect(formatStopwatch(59 * 60_000 + 59_900)).toBe('59:59.9');
  });

  it('drops tenths and adds hours at one hour', () => {
    expect(formatStopwatch(3_600_000)).toBe('1:00:00');
    expect(formatStopwatch(3_600_000 + 75_000)).toBe('1:01:15');
  });

  it('truncates (not rounds) so the readout never shows a second early', () => {
    expect(formatStopwatch(999)).toBe('0:00.9');
  });
});

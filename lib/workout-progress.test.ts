import { describe, expect, it } from 'vitest';
import { hasIncompleteSets } from './workout-progress';

const sets = (...completed: boolean[]) => completed.map((c) => ({ completed: c }));

describe('hasIncompleteSets', () => {
  it('returns false for an empty workout', () => {
    expect(hasIncompleteSets([])).toBe(false);
  });

  it('returns false when an exercise has no sets', () => {
    expect(hasIncompleteSets([{ sets: [] }])).toBe(false);
  });

  it('returns false when every set in every exercise is completed', () => {
    expect(
      hasIncompleteSets([{ sets: sets(true, true) }, { sets: sets(true) }])
    ).toBe(false);
  });

  it('returns true when the current exercise still has an incomplete set', () => {
    expect(hasIncompleteSets([{ sets: sets(true, false) }])).toBe(true);
  });

  it('returns true when only a later exercise has an incomplete set', () => {
    expect(
      hasIncompleteSets([{ sets: sets(true, true) }, { sets: sets(false) }])
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { sleepNightKey } from '@/lib/sleep-attribution';

// Characterization tests for sleep-night attribution — the fix for the weekly
// review reporting artificially low average sleep. The old importer split a
// night that crossed midnight across two calendar days; these pin the new
// rule: a whole sample lands on ONE "sleep night" day (the wake-up morning),
// using a 6 PM local boundary.
//
// All timestamps are constructed with `new Date(y, m, d, h, ...)` so they are
// interpreted in the runner's LOCAL time — the same local calendar the
// importer keys on.

const at = (y: number, mo: number, d: number, h: number, min = 0): number =>
  new Date(y, mo - 1, d, h, min).getTime();

describe('sleepNightKey', () => {
  it('attributes an evening bedtime to the next morning', () => {
    // Fall asleep Sunday 23:00 -> counts as the night of Monday.
    expect(sleepNightKey(at(2026, 7, 12, 23, 0))).toBe('2026-07-13');
  });

  it('attributes a post-midnight fragment to the same wake-up day', () => {
    // A REM stage at 02:00 Monday belongs to Monday's night, matching the
    // 23:00 fragment above so the whole night sums onto one day.
    expect(sleepNightKey(at(2026, 7, 13, 2, 0))).toBe('2026-07-13');
  });

  it('keeps the boundary exclusive at exactly 18:00', () => {
    // 18:00 sharp rolls into the next day (>= boundary)...
    expect(sleepNightKey(at(2026, 7, 12, 18, 0))).toBe('2026-07-13');
    // ...but 17:59 stays on the same day.
    expect(sleepNightKey(at(2026, 7, 12, 17, 59))).toBe('2026-07-12');
  });

  it('keeps a daytime nap on the day it started', () => {
    expect(sleepNightKey(at(2026, 7, 12, 14, 0))).toBe('2026-07-12');
  });

  it('handles a night that starts just after midnight', () => {
    // Late sleeper: asleep 01:30 Monday -> still Monday's night.
    expect(sleepNightKey(at(2026, 7, 13, 1, 30))).toBe('2026-07-13');
  });

  it('rolls month and year boundaries forward correctly', () => {
    expect(sleepNightKey(at(2026, 7, 31, 23, 0))).toBe('2026-08-01');
    expect(sleepNightKey(at(2026, 12, 31, 22, 0))).toBe('2027-01-01');
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeBodyWeightTrend,
  convertKgToUnit,
  formatBodyWeightKg,
  formatBodyWeightDeltaKg,
  LBS_PER_KG,
} from '@/lib/body-weight-trend';

describe('computeBodyWeightTrend', () => {
  it('returns null for an empty row list', () => {
    expect(computeBodyWeightTrend([])).toBeNull();
  });

  it('returns null when every row has no bodyMassKg', () => {
    expect(
      computeBodyWeightTrend([
        { date: '2026-06-01' },
        { date: '2026-06-02', bodyMassKg: undefined },
      ])
    ).toBeNull();
  });

  it('sorts sparse dates ascending and reports the latest reading', () => {
    const trend = computeBodyWeightTrend([
      { date: '2026-06-15', bodyMassKg: 81 },
      { date: '2026-05-01', bodyMassKg: 83 },
      { date: '2026-06-01' }, // no reading that day — filtered out
    ]);

    expect(trend).not.toBeNull();
    expect(trend?.points).toEqual([
      { date: '2026-05-01', kg: 83 },
      { date: '2026-06-15', kg: 81 },
    ]);
    expect(trend?.latestDate).toBe('2026-06-15');
    expect(trend?.latestKg).toBe(81);
  });

  it('computes delta vs the most recent point at/before 30 days prior', () => {
    // latest = 2026-06-15; cutoff = 2026-05-16. The 2026-05-01 point is
    // before the cutoff and is the only candidate, so it's the baseline.
    const trend = computeBodyWeightTrend([
      { date: '2026-05-01', bodyMassKg: 83 },
      { date: '2026-06-15', bodyMassKg: 81 },
    ]);
    // 81 - 83 = -2
    expect(trend?.deltaKg).toBe(-2);
  });

  it('picks the most recent baseline candidate at/before the cutoff', () => {
    // cutoff = 2026-06-15 - 30d = 2026-05-16. Both 2026-05-01 and
    // 2026-05-20 are... 05-20 is AFTER cutoff so only 05-01 qualifies.
    const trend = computeBodyWeightTrend([
      { date: '2026-05-01', bodyMassKg: 85 },
      { date: '2026-05-20', bodyMassKg: 84 },
      { date: '2026-06-15', bodyMassKg: 81 },
    ]);
    // baseline should be 2026-05-01 (85), not 2026-05-20 (84), since only
    // 05-01 is at/before the 2026-05-16 cutoff.
    expect(trend?.deltaKg).toBe(-4);
  });

  it('returns null delta when no point is old enough (all within 30 days)', () => {
    const trend = computeBodyWeightTrend([
      { date: '2026-06-01', bodyMassKg: 82 },
      { date: '2026-06-15', bodyMassKg: 81 },
    ]);
    expect(trend?.deltaKg).toBeNull();
  });

  it('single point: latest set, delta null', () => {
    const trend = computeBodyWeightTrend([{ date: '2026-06-15', bodyMassKg: 80 }]);
    expect(trend?.latestKg).toBe(80);
    expect(trend?.deltaKg).toBeNull();
  });
});

describe('convertKgToUnit', () => {
  it('passes kg through unchanged for unit "kg"', () => {
    expect(convertKgToUnit(80, 'kg')).toBe(80);
  });

  it('converts kg to lbs using LBS_PER_KG', () => {
    expect(convertKgToUnit(80, 'lbs')).toBeCloseTo(80 * LBS_PER_KG, 5);
  });
});

describe('formatBodyWeightKg', () => {
  it('formats kg with the "kg" suffix, rounded to 1 decimal', () => {
    expect(formatBodyWeightKg(80.44, 'kg')).toBe('80.4 kg');
  });

  it('converts to lbs and formats with the "lbs" suffix', () => {
    // 80 kg * 2.20462 = 176.3696 -> rounds to 176.4
    expect(formatBodyWeightKg(80, 'lbs')).toBe('176.4 lbs');
  });
});

describe('formatBodyWeightDeltaKg', () => {
  it('prefixes a positive delta with "+"', () => {
    expect(formatBodyWeightDeltaKg(1.2, 'kg')).toBe('+1.2 kg');
  });

  it('leaves a negative delta with its own "-" sign', () => {
    expect(formatBodyWeightDeltaKg(-0.5, 'kg')).toBe('-0.5 kg');
  });

  it('formats a zero delta with no sign prefix', () => {
    expect(formatBodyWeightDeltaKg(0, 'kg')).toBe('0 kg');
  });

  it('converts the delta to lbs before formatting', () => {
    // 1 kg * 2.20462 = 2.20462 -> rounds to 2.2
    expect(formatBodyWeightDeltaKg(1, 'lbs')).toBe('+2.2 lbs');
  });
});

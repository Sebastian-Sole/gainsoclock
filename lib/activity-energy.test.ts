import { describe, it, expect } from "vitest";
import { estimateWeeklyActiveEnergy } from "@/lib/activity-energy";

describe("estimateWeeklyActiveEnergy", () => {
  it("empty metrics array → hasData false, weeklyCalsBurned 0", () => {
    expect(estimateWeeklyActiveEnergy([])).toEqual({
      weeklyCalsBurned: 0,
      hasData: false,
    });
  });

  it("all days missing activeEnergyKcal → hasData false", () => {
    const metrics = [{ activeEnergyKcal: undefined }, { activeEnergyKcal: undefined }];
    expect(estimateWeeklyActiveEnergy(metrics)).toEqual({
      weeklyCalsBurned: 0,
      hasData: false,
    });
  });

  it("14 days of uniform data → correct weekly average", () => {
    // 14 days at 300 kcal/day → avg/day = 300, weekly = round(300 * 7) = 2100
    const metrics = Array.from({ length: 14 }, () => ({ activeEnergyKcal: 300 }));
    expect(estimateWeeklyActiveEnergy(metrics)).toEqual({
      weeklyCalsBurned: 2100,
      hasData: true,
    });
  });

  it("14 days of varying data → averages then scales to a week", () => {
    // sum = 7*200 + 7*400 = 1400 + 2800 = 4200; avg/day = 4200/14 = 300
    // weekly = round(300 * 7) = 2100
    const metrics = [
      ...Array.from({ length: 7 }, () => ({ activeEnergyKcal: 200 })),
      ...Array.from({ length: 7 }, () => ({ activeEnergyKcal: 400 })),
    ];
    expect(estimateWeeklyActiveEnergy(metrics)).toEqual({
      weeklyCalsBurned: 2100,
      hasData: true,
    });
  });

  it("partial data → averages only over present days, ignoring missing ones", () => {
    // Only 2 of 5 days have data: 100 and 300 → avg/day = 200
    // weekly = round(200 * 7) = 1400
    const metrics = [
      { activeEnergyKcal: 100 },
      { activeEnergyKcal: undefined },
      { activeEnergyKcal: undefined },
      { activeEnergyKcal: 300 },
      { activeEnergyKcal: undefined },
    ];
    expect(estimateWeeklyActiveEnergy(metrics)).toEqual({
      weeklyCalsBurned: 1400,
      hasData: true,
    });
  });

  it("a single zero-kcal day still counts as data (not missing)", () => {
    const metrics = [{ activeEnergyKcal: 0 }];
    expect(estimateWeeklyActiveEnergy(metrics)).toEqual({
      weeklyCalsBurned: 0,
      hasData: true,
    });
  });
});

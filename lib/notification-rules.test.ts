import { describe, it, expect } from "vitest";
import { decideStreakRisk } from "@/lib/notification-rules";

// Table-driven characterization tests for decideStreakRisk. Model: lib/streaks.test.ts.

function args(overrides: Partial<Parameters<typeof decideStreakRisk>[0]> = {}) {
  return {
    enabled: true,
    currentStreak: 5,
    todayCovered: false,
    now: new Date("2026-06-10T12:00:00"),
    fireHour: 18,
    fireMinute: 0,
    ...overrides,
  };
}

describe("decideStreakRisk", () => {
  it("does not schedule when disabled", () => {
    const r = decideStreakRisk(args({ enabled: false }));
    expect(r.schedule).toBe(false);
  });

  it("does not schedule when there is no active streak", () => {
    const r = decideStreakRisk(args({ currentStreak: 0 }));
    expect(r.schedule).toBe(false);
  });

  it("does not schedule when today is already covered", () => {
    const r = decideStreakRisk(args({ todayCovered: true }));
    expect(r.schedule).toBe(false);
  });

  it("does not schedule when the fire time has already passed today", () => {
    const r = decideStreakRisk(
      args({ now: new Date("2026-06-10T19:00:00"), fireHour: 18, fireMinute: 0 })
    );
    expect(r.schedule).toBe(false);
  });

  it("schedules the normal evening case with seconds-from-now computed to the fire time", () => {
    const r = decideStreakRisk(
      args({ now: new Date("2026-06-10T12:00:00"), fireHour: 18, fireMinute: 0, currentStreak: 5 })
    );
    expect(r.schedule).toBe(true);
    if (r.schedule) {
      // 12:00 -> 18:00 is exactly 6 hours = 21600 seconds; allow 1s tolerance
      // for the Math.floor truncation in the implementation.
      expect(r.secondsFromNow).toBeGreaterThanOrEqual(21599);
      expect(r.secondsFromNow).toBeLessThanOrEqual(21600);
      expect(r.streakLength).toBe(5);
    }
  });

  it("midnight boundary: still schedules a minute before a late fire time today", () => {
    const r = decideStreakRisk(
      args({ now: new Date("2026-06-10T23:58:00"), fireHour: 23, fireMinute: 59 })
    );
    expect(r.schedule).toBe(true);
    if (r.schedule) {
      expect(r.secondsFromNow).toBeLessThanOrEqual(60);
    }
  });

  it("midnight boundary: does not carry a missed fire time into the next day", () => {
    // Just after midnight on the day after a 23:59 fire time was missed —
    // the decision re-evaluates fresh against the new day's 23:59, which is
    // still in the future, so it schedules again (never replays yesterday's
    // miss, never silently skips today).
    const r = decideStreakRisk(
      args({ now: new Date("2026-06-11T00:01:00"), fireHour: 23, fireMinute: 59 })
    );
    expect(r.schedule).toBe(true);
  });
});

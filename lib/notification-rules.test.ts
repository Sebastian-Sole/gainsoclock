import { describe, it, expect } from "vitest";
import {
  planDailyReminder,
  decideProteinNudge,
  clampReviewWeekday,
  decideStreakRisk,
} from "@/lib/notification-rules";

// Characterization tests: pin CURRENT notification scheduling decisions,
// extracted verbatim from lib/notifications.ts. All functions take `now`
// (and `target`, where relevant) as parameters, so no fake timers are
// needed — every case below uses a fixed local Date.

describe("planDailyReminder", () => {
  it("logged today + before reminder time -> one-shot for tomorrow with exact seconds", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0); // 2026-06-15 10:00
    const plan = planDailyReminder({
      now,
      hour: 18,
      minute: 0,
      lastWorkoutLoggedDate: "2026-06-15",
    });
    // 2026-06-16 18:00 - 2026-06-15 10:00 = 32h = 115200s exactly.
    expect(plan).toEqual({ kind: "one-shot-tomorrow", seconds: 115200 });
  });

  it("logged today + after reminder time -> repeating daily", () => {
    const now = new Date(2026, 5, 15, 19, 0, 0); // after 18:00 reminder
    const plan = planDailyReminder({
      now,
      hour: 18,
      minute: 0,
      lastWorkoutLoggedDate: "2026-06-15",
    });
    expect(plan).toEqual({ kind: "repeating-daily" });
  });

  it("not logged today -> repeating daily", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const plan = planDailyReminder({
      now,
      hour: 18,
      minute: 0,
      lastWorkoutLoggedDate: null,
    });
    expect(plan).toEqual({ kind: "repeating-daily" });
  });

  it("logged yesterday (date-string mismatch) -> repeating daily", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const plan = planDailyReminder({
      now,
      hour: 18,
      minute: 0,
      lastWorkoutLoggedDate: "2026-06-14",
    });
    expect(plan).toEqual({ kind: "repeating-daily" });
  });

  it("midnight edge: now 23:59 logged today, reminder was 23:58 -> repeating (time already passed)", () => {
    const now = new Date(2026, 5, 15, 23, 59, 0);
    const plan = planDailyReminder({
      now,
      hour: 23,
      minute: 58,
      lastWorkoutLoggedDate: "2026-06-15",
    });
    expect(plan).toEqual({ kind: "repeating-daily" });
  });

  it("seconds floor is clamped to >= 1 even when now is 1 second before the reminder", () => {
    const now = new Date(2026, 5, 15, 17, 59, 59);
    const plan = planDailyReminder({
      now,
      hour: 18,
      minute: 0,
      lastWorkoutLoggedDate: "2026-06-15",
    });
    // now < reminderToday (17:59:59 < 18:00:00), so one-shot-tomorrow fires;
    // tomorrow 18:00:00 - now 17:59:59 = 86401s.
    expect(plan).toEqual({ kind: "one-shot-tomorrow", seconds: 86401 });
  });

  it("undefined lastWorkoutLoggedDate -> repeating daily", () => {
    const now = new Date(2026, 5, 15, 10, 0, 0);
    const plan = planDailyReminder({
      now,
      hour: 18,
      minute: 0,
      lastWorkoutLoggedDate: undefined,
    });
    expect(plan).toEqual({ kind: "repeating-daily" });
  });
});

describe("decideProteinNudge", () => {
  const now = new Date(2026, 5, 15, 15, 0, 0); // 2026-06-15 15:00
  const target = new Date(2026, 5, 15, 19, 30, 0); // 2026-06-15 19:30

  it("disabled -> skip", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: false,
      hour: 19,
      minute: 30,
      proteinGoal: 150,
      proteinConsumedToday: 50,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("goal is zero -> skip", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: 30,
      proteinGoal: 0,
      proteinConsumedToday: 50,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("goal is negative -> skip", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: 30,
      proteinGoal: -10,
      proteinConsumedToday: 50,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("remaining is exactly 0 (goal met) -> skip", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: 30,
      proteinGoal: 150,
      proteinConsumedToday: 150,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("remaining rounds to 0 (goal 100, consumed 99.6 -> Math.round(0.4)=0) -> skip; pins the rounding boundary", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: 30,
      proteinGoal: 100,
      proteinConsumedToday: 99.6,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("remaining rounds up to 1 (goal 100, consumed 99.4 -> Math.round(0.6)=1) -> schedule, just past the rounding boundary", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: 30,
      proteinGoal: 100,
      proteinConsumedToday: 99.4,
    });
    expect(decision).toEqual({
      kind: "schedule",
      secondsUntil: 16200,
      remaining: 1,
    });
  });

  it("target already in the past -> skip", () => {
    const pastTarget = new Date(2026, 5, 15, 10, 0, 0);
    const decision = decideProteinNudge({
      now,
      target: pastTarget,
      enabled: true,
      hour: 9,
      minute: 0,
      proteinGoal: 150,
      proteinConsumedToday: 50,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("happy path -> schedule with exact secondsUntil and remaining", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: 30,
      proteinGoal: 150,
      proteinConsumedToday: 50,
    });
    // 19:30 - 15:00 = 4h30m = 16200s exactly.
    expect(decision).toEqual({
      kind: "schedule",
      secondsUntil: 16200,
      remaining: 100,
    });
  });

  it("NaN hour -> skip", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: NaN,
      minute: 30,
      proteinGoal: 150,
      proteinConsumedToday: 50,
    });
    expect(decision).toEqual({ kind: "skip" });
  });

  it("NaN minute -> skip", () => {
    const decision = decideProteinNudge({
      now,
      target,
      enabled: true,
      hour: 19,
      minute: NaN,
      proteinGoal: 150,
      proteinConsumedToday: 50,
    });
    expect(decision).toEqual({ kind: "skip" });
  });
});

describe("clampReviewWeekday", () => {
  it("passes through a valid mid-range weekday", () => {
    expect(clampReviewWeekday(3)).toBe(3);
  });

  it("clamps a negative weekday up to 0 (Sunday)", () => {
    expect(clampReviewWeekday(-1)).toBe(0);
  });

  it("passes through the upper bound (6, Saturday)", () => {
    expect(clampReviewWeekday(6)).toBe(6);
  });

  it("clamps an out-of-range weekday down to 6 (Saturday)", () => {
    expect(clampReviewWeekday(7)).toBe(6);
  });

  it("falls back to 0 for a non-integer value", () => {
    expect(clampReviewWeekday(0.5)).toBe(0);
  });

  it("falls back to 0 for NaN", () => {
    expect(clampReviewWeekday(NaN)).toBe(0);
  });
});

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

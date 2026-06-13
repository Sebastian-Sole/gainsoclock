import { describe, it, expect } from "vitest";
import { computeStreak, type StreakInput } from "@/lib/streaks";

// Characterization tests: pin CURRENT rest-day-aware + external-aware streak
// semantics. Cases mirror the documented @example blocks in lib/streaks.ts so a
// behavioral regression is caught. Day strings are opaque, totally-ordered
// YYYY-MM-DD labels; arithmetic is UTC-ordinal under the hood.

function input(overrides: Partial<StreakInput>): StreakInput {
  return {
    workoutDates: new Set(),
    externalWorkoutDates: new Set(),
    restDates: new Set(),
    today: "2026-06-10",
    ...overrides,
  };
}

describe("computeStreak", () => {
  it("empty inputs -> all zeros", () => {
    const r = computeStreak(input({}));
    expect(r.current).toBe(0);
    expect(r.longest).toBe(0);
    expect(r.todayCovered).toBe(false);
    expect(r.longestStart).toBe("");
    expect(r.longestEnd).toBe("");
    expect(r.currentIncludesExternal).toBe(false);
  });

  it("consecutive days ending today", () => {
    const r = computeStreak(
      input({ workoutDates: new Set(["2026-06-08", "2026-06-09", "2026-06-10"]) })
    );
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.todayCovered).toBe(true);
    expect(r.longestStart).toBe("2026-06-08");
    expect(r.longestEnd).toBe("2026-06-10");
  });

  it("today uncovered -> grace: streak survives but does not count today", () => {
    const r = computeStreak(
      input({ workoutDates: new Set(["2026-06-08", "2026-06-09"]) })
    );
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
    expect(r.todayCovered).toBe(false);
  });

  it("a one-day gap (not a rest day) breaks the streak", () => {
    const r = computeStreak(
      input({
        workoutDates: new Set([
          "2026-06-06",
          "2026-06-07",
          "2026-06-09",
          "2026-06-10",
        ]),
      })
    );
    // Two runs of 2; the most recent run is reported as longest (tie -> recent).
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
    expect(r.longestStart).toBe("2026-06-09");
    expect(r.longestEnd).toBe("2026-06-10");
  });

  it("a planned rest day bridges the gap (neutral, not counted)", () => {
    const r = computeStreak(
      input({
        workoutDates: new Set(["2026-06-07", "2026-06-09", "2026-06-10"]),
        restDates: new Set(["2026-06-08"]),
      })
    );
    // 3 active days; the rest day in between neither broke nor extended.
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.longestStart).toBe("2026-06-07");
    expect(r.longestEnd).toBe("2026-06-10");
  });

  it("an external (synced) workout keeps the streak alive and flags it", () => {
    const r = computeStreak(
      input({
        workoutDates: new Set(["2026-06-08", "2026-06-10"]),
        externalWorkoutDates: new Set(["2026-06-09"]),
      })
    );
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.todayCovered).toBe(true);
    expect(r.currentIncludesExternal).toBe(true);
  });

  it("rest-only history -> no streak (rest days alone never count)", () => {
    const r = computeStreak(
      input({ restDates: new Set(["2026-06-09", "2026-06-10"]) })
    );
    expect(r.current).toBe(0);
    expect(r.longest).toBe(0);
    expect(r.todayCovered).toBe(false);
  });

  it("old history with an idle gap -> current 0 but longest preserved", () => {
    const r = computeStreak(
      input({ workoutDates: new Set(["2026-06-01", "2026-06-02", "2026-06-03"]) })
    );
    expect(r.current).toBe(0);
    expect(r.longest).toBe(3);
    expect(r.longestStart).toBe("2026-06-01");
    expect(r.longestEnd).toBe("2026-06-03");
  });

  it("future-dated entries (after today) are ignored", () => {
    const r = computeStreak(
      input({
        workoutDates: new Set(["2026-06-09", "2026-06-10", "2026-06-11"]),
      })
    );
    // 2026-06-11 is after today (06-10) and is clamped out.
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
    expect(r.longestEnd).toBe("2026-06-10");
  });
});

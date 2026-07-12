import { describe, it, expect } from "vitest";
import {
  bestMatchingExternal,
  bestMatchingLog,
  overlapScoreMs,
  MIN_OVERLAP_FRACTION,
  OVERLAP_TOLERANCE_MS,
} from "@/convex/workoutOverlap";

// Issue #117: a workout logged in Fitbull while an Apple Watch records the
// same session must dedupe by time overlap. These tests pin the matching
// rule (>= 50% of the shorter window, tolerance-credited) that both server
// linking directions (convex/healthData.ts upsertExternalWorkouts and
// convex/workoutLogs.ts create/bulkUpsert) rely on.

const T0 = Date.parse("2026-07-10T10:00:00.000Z");
const MIN = 60 * 1000;

/** External (HealthKit) window: ms epoch offsets from T0, in minutes. */
function ext(startMin: number, endMin: number) {
  return { startedAt: T0 + startMin * MIN, endedAt: T0 + endMin * MIN };
}

/** Native log window: ISO strings, offsets from T0 in minutes. */
function log(startMin: number, endMin: number, clientId = "log-1") {
  return {
    clientId,
    startedAt: new Date(T0 + startMin * MIN).toISOString(),
    completedAt: new Date(T0 + endMin * MIN).toISOString(),
  };
}

describe("overlapScoreMs", () => {
  it("matches an identical window", () => {
    expect(overlapScoreMs(ext(0, 60), log(0, 60))).toBe(
      60 * MIN + OVERLAP_TOLERANCE_MS
    );
  });

  it("matches a watch recording nested inside a longer Fitbull log", () => {
    // Watch 10:03-10:58 inside Fitbull 10:00-11:00 — the canonical bug case.
    expect(overlapScoreMs(ext(3, 58), log(0, 60))).not.toBeNull();
  });

  it("matches when overlap is exactly 50% of the shorter window", () => {
    // Shorter window 30min, raw overlap 12min + 3min tolerance = 15min = 50%.
    expect(overlapScoreMs(ext(0, 30), log(18, 80))).not.toBeNull();
  });

  it("rejects overlap just under 50% of the shorter window", () => {
    // Shorter 30min, raw 11min + 3min tolerance = 14min < 15min.
    expect(overlapScoreMs(ext(0, 30), log(19, 80))).toBeNull();
  });

  it("bridges a small gap within the tolerance for short workouts", () => {
    // 10min watch workout ending 2min before a 10min log starts:
    // raw -2min + 3min = 1min, but 50% of 10min = 5min -> no match...
    expect(overlapScoreMs(ext(0, 10), log(12, 22))).toBeNull();
    // ...while a 4min-overlap pair of 10min windows does match
    // (4min + 3min tolerance >= 5min).
    expect(overlapScoreMs(ext(0, 10), log(6, 16))).not.toBeNull();
  });

  it("rejects back-to-back sessions (gym class then a lift)", () => {
    // Watch class 9:00-10:00, Fitbull lift 10:00-11:00: raw 0 + tolerance
    // is far below 50% of 60min.
    expect(overlapScoreMs(ext(-60, 0), log(0, 60))).toBeNull();
  });

  it("rejects disjoint short workouts a few minutes apart", () => {
    // Two 5-min sessions 3 min apart: raw -3min + 3min = 0 < 2.5min.
    expect(overlapScoreMs(ext(0, 5), log(8, 13))).toBeNull();
  });

  it("clamps the denominator so seconds-long windows cannot free-ride on tolerance", () => {
    // 10s watch blip an hour into a log, no real overlap: raw <= 0.
    const blip = {
      startedAt: T0 + 120 * MIN,
      endedAt: T0 + 120 * MIN + 10_000,
    };
    expect(overlapScoreMs(blip, log(0, 60))).toBeNull();
  });

  it("returns null for unparsable or inverted windows", () => {
    expect(
      overlapScoreMs(ext(0, 60), {
        startedAt: "not-a-date",
        completedAt: "also-not",
      })
    ).toBeNull();
    // Inverted native window
    expect(overlapScoreMs(ext(0, 60), log(60, 0))).toBeNull();
    // Zero-length external window
    expect(overlapScoreMs(ext(30, 30), log(0, 60))).toBeNull();
  });
});

describe("bestMatchingLog", () => {
  it("returns null when no candidate qualifies", () => {
    expect(bestMatchingLog(ext(0, 30), [log(120, 180)])).toBeNull();
    expect(bestMatchingLog(ext(0, 30), [])).toBeNull();
  });

  it("picks the max-overlap candidate among several qualifying logs", () => {
    const partial = log(20, 45, "partial"); // 25min overlap with ext(0,45)
    const full = log(0, 45, "full"); // 45min overlap
    expect(bestMatchingLog(ext(0, 45), [partial, full])?.clientId).toBe(
      "full"
    );
    // Order-independent
    expect(bestMatchingLog(ext(0, 45), [full, partial])?.clientId).toBe(
      "full"
    );
  });

  it("breaks score ties by closest start time", () => {
    // Both fully contain the external window (same raw overlap = ext length).
    const early = log(-30, 60, "early");
    const aligned = log(0, 60, "aligned");
    expect(
      bestMatchingLog(ext(0, 40), [early, aligned])?.clientId
    ).toBe("aligned");
  });
});

describe("bestMatchingExternal", () => {
  it("mirrors the matching rule in the reverse (log-arrives-later) direction", () => {
    const watch = { ...ext(3, 58), healthKitUuid: "hk-1" };
    const yesterday = { ...ext(-24 * 60, -23 * 60), healthKitUuid: "hk-0" };
    expect(
      bestMatchingExternal(log(0, 60), [yesterday, watch])?.healthKitUuid
    ).toBe("hk-1");
    expect(bestMatchingExternal(log(0, 60), [yesterday])).toBeNull();
  });

  it("picks the max-overlap external when the watch split the session", () => {
    const first = { ...ext(0, 20), healthKitUuid: "hk-a" };
    const second = { ...ext(25, 60), healthKitUuid: "hk-b" };
    expect(
      bestMatchingExternal(log(0, 60), [first, second])?.healthKitUuid
    ).toBe("hk-b");
  });
});

describe("constants", () => {
  it("keeps the documented rule parameters", () => {
    expect(MIN_OVERLAP_FRACTION).toBe(0.5);
    expect(OVERLAP_TOLERANCE_MS).toBe(3 * 60 * 1000);
  });
});

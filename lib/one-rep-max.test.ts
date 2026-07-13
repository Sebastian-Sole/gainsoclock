import { describe, it, expect } from "vitest";
import {
  DEFAULT_ONE_RM_FORMULA,
  calculate1RM,
  computeOneRmSeries,
  estimateOneRm,
  sessionBestOneRm,
} from "@/lib/one-rep-max";
import type { WorkoutLog, WorkoutSet } from "@/lib/types";

// calculate1RM characterization: these values are what the 1RM calculator
// screen (app/calculator/one-rm.tsx) has always shown — the extraction to
// lib/one-rep-max.ts must not change them.
describe("calculate1RM (calculator parity)", () => {
  it("100 kg × 5 → Epley 117, Brzycki 113, Lombardi 117", () => {
    expect(calculate1RM(100, 5)).toEqual({ epley: 117, brzycki: 113, lombardi: 117 });
  });

  it("reps === 1 returns the weight itself, unrounded, for all formulas", () => {
    expect(calculate1RM(102.5, 1)).toEqual({ epley: 102.5, brzycki: 102.5, lombardi: 102.5 });
  });

  it("non-positive input returns zeros", () => {
    expect(calculate1RM(0, 5)).toEqual({ epley: 0, brzycki: 0, lombardi: 0 });
    expect(calculate1RM(100, 0)).toEqual({ epley: 0, brzycki: 0, lombardi: 0 });
    expect(calculate1RM(-1, 5)).toEqual({ epley: 0, brzycki: 0, lombardi: 0 });
  });

  it("Brzycki collapses to 0 at reps >= 37; the others keep computing", () => {
    const r = calculate1RM(100, 37);
    expect(r.brzycki).toBe(0);
    expect(r.epley).toBe(223); // 100 * (1 + 37/30)
  });
});

describe("estimateOneRm", () => {
  it("defaults to Epley and returns unrounded values", () => {
    expect(DEFAULT_ONE_RM_FORMULA).toBe("epley");
    expect(estimateOneRm(80, 10)).toBeCloseTo(80 * (1 + 10 / 30), 10);
  });

  it("computes each named formula", () => {
    expect(estimateOneRm(100, 5, "epley")).toBeCloseTo(116.6667, 3);
    expect(estimateOneRm(100, 5, "brzycki")).toBeCloseTo(112.5, 10);
    expect(estimateOneRm(100, 5, "lombardi")).toBeCloseTo(100 * Math.pow(5, 0.1), 10);
  });
});

const set = (over: Partial<WorkoutSet> & { id: string }): WorkoutSet => ({
  type: "metrics",
  completed: true,
  ...over,
});

describe("sessionBestOneRm", () => {
  it("picks the set with the best e1RM, not the heaviest set", () => {
    // 100×1 → e1RM 100; 90×10 → 90 * (1 + 10/30) = 120
    const best = sessionBestOneRm([
      set({ id: "a", weight: 100, reps: 1 }),
      set({ id: "b", weight: 90, reps: 10 }),
    ]);
    expect(best).toBeCloseTo(120, 10);
  });

  it("ignores incomplete sets and sets missing weight or reps", () => {
    const best = sessionBestOneRm([
      set({ id: "a", weight: 200, reps: 5, completed: false }),
      set({ id: "b", weight: 100 }), // no reps
      set({ id: "c", reps: 12 }), // no weight
      set({ id: "d", weight: 60, reps: 5 }),
    ]);
    expect(best).toBeCloseTo(70, 10); // 60 * (1 + 5/30)
  });

  it("returns undefined when no set qualifies", () => {
    expect(sessionBestOneRm([])).toBeUndefined();
    expect(sessionBestOneRm([set({ id: "a", time: 600 })])).toBeUndefined();
    expect(sessionBestOneRm([set({ id: "a", weight: 0, reps: 5 })])).toBeUndefined();
  });

  // Load-mode effective-load math (issue #132): e1RM is computed on the
  // effective TOTAL load so per-hand exercises aren't undercounted.
  it("doubles the weight for per_hand exercises (2 × 10 kg dumbbells → 20)", () => {
    const sets = [set({ id: "a", weight: 10, reps: 10 })];
    const perHand = sessionBestOneRm(sets, "epley", "per_hand");
    expect(perHand).toBeCloseTo(20 * (1 + 10 / 30), 10);
  });

  it("per_side and total match the legacy (loadMode-less) math", () => {
    const sets = [set({ id: "a", weight: 24, reps: 8 })];
    const legacy = sessionBestOneRm(sets);
    expect(sessionBestOneRm(sets, "epley", "per_side")).toBe(legacy);
    expect(sessionBestOneRm(sets, "epley", "total")).toBe(legacy);
  });
});

describe("computeOneRmSeries", () => {
  const benchLog = (id: string, startedAt: string, sets: WorkoutSet[]): WorkoutLog => ({
    id,
    templateName: "Push",
    startedAt,
    completedAt: startedAt,
    durationSeconds: 3600,
    exercises: [
      {
        id: `wle-${id}`,
        exerciseId: "bench",
        name: "Bench Press",
        type: "metrics",
        metrics: ["weight", "reps"],
        order: 0,
        restTimeSeconds: 120,
        sets,
      },
    ],
  });

  it("emits one point per session from the session's best set, chronologically", () => {
    const points = computeOneRmSeries(
      [
        // unsorted on purpose
        benchLog("b2", "2026-06-08T08:00:00Z", [set({ id: "x", weight: 90, reps: 6 })]),
        benchLog("b1", "2026-06-01T08:00:00Z", [
          set({ id: "y", weight: 85, reps: 8 }),
          set({ id: "z", weight: 100, reps: 1 }),
        ]),
      ],
      "bench"
    );
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe("2026-06-01T08:00:00Z");
    expect(points[0].value).toBeCloseTo(85 * (1 + 8 / 30), 10); // ≈ 107.7 beats the 100 single
    expect(points[1].date).toBe("2026-06-08T08:00:00Z");
    expect(points[1].value).toBeCloseTo(90 * (1 + 6 / 30), 10);
  });

  it("skips sessions without a qualifying weight+reps set", () => {
    const points = computeOneRmSeries(
      [
        benchLog("b1", "2026-06-01T08:00:00Z", [set({ id: "y", time: 600 })]),
        benchLog("b2", "2026-06-08T08:00:00Z", [set({ id: "x", weight: 90, reps: 6 })]),
      ],
      "bench"
    );
    expect(points).toHaveLength(1);
    expect(points[0].date).toBe("2026-06-08T08:00:00Z");
  });

  it("returns an empty series for an unknown exercise", () => {
    expect(computeOneRmSeries([], "bench")).toEqual([]);
  });

  // Load-mode series behavior (issue #132): each log row's OWN loadMode
  // applies, so legacy sessions (flag absent = total) chart unchanged while
  // per-hand sessions use the doubled effective load.
  it("applies each log exercise's loadMode; legacy rows stay multiplier-1", () => {
    const legacy = benchLog("b1", "2026-06-01T08:00:00Z", [
      set({ id: "y", weight: 20, reps: 10 }),
    ]);
    const perHand = benchLog("b2", "2026-06-08T08:00:00Z", [
      set({ id: "x", weight: 20, reps: 10 }),
    ]);
    perHand.exercises[0].loadMode = "per_hand";

    const points = computeOneRmSeries([legacy, perHand], "bench");
    expect(points).toHaveLength(2);
    expect(points[0].value).toBeCloseTo(20 * (1 + 10 / 30), 10);
    expect(points[1].value).toBeCloseTo(40 * (1 + 10 / 30), 10);
  });
});

import { describe, it, expect } from "vitest";
import { createIntervalSet, normalizeIntervalSets } from "@/lib/defaults";
import type { WorkoutSet } from "@/lib/types";

// A legacy interval set (the old two-row shape) carrying an explicit variant.
function legacy(
  variant: "work" | "rest",
  order: number,
  extra: Partial<WorkoutSet> = {},
): WorkoutSet {
  return {
    id: `s${order}`,
    completed: false,
    type: "intervals",
    variant,
    metric: "distance",
    distanceUnit: "km",
    time: variant === "work" ? 60 : 30,
    ...extra,
  };
}

describe("createIntervalSet", () => {
  it("is a single set with work + rest, no variant", () => {
    const s = createIntervalSet("km");
    expect(s.type).toBe("intervals");
    expect(s.variant).toBeUndefined();
    expect(s.time).toBeGreaterThan(0); // work
    expect(s.restTime).toBeGreaterThan(0); // rest
  });
});

describe("normalizeIntervalSets", () => {
  it("merges a work/rest pair into one set with restTime", () => {
    const out = normalizeIntervalSets([
      legacy("work", 0, { distance: 400 }),
      legacy("rest", 1, { time: 45 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].variant).toBeUndefined();
    expect(out[0].time).toBe(60); // work duration preserved
    expect(out[0].restTime).toBe(45); // rest duration folded in
    expect(out[0].distance).toBe(400);
  });

  it("merges multiple consecutive pairs", () => {
    const out = normalizeIntervalSets([
      legacy("work", 0),
      legacy("rest", 1),
      legacy("work", 2),
      legacy("rest", 3),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.variant === undefined && s.restTime === 30)).toBe(true);
  });

  it("keeps a lone work set (restTime 0) when no rest follows", () => {
    const out = normalizeIntervalSets([legacy("work", 0)]);
    expect(out).toHaveLength(1);
    expect(out[0].restTime).toBe(0);
    expect(out[0].variant).toBeUndefined();
  });

  it("drops an orphan rest set with no preceding work", () => {
    const out = normalizeIntervalSets([legacy("rest", 0)]);
    expect(out).toHaveLength(0);
  });

  it("is a no-op for already-single sets (idempotent)", () => {
    const single = [createIntervalSet("km")];
    expect(normalizeIntervalSets(single)).toBe(single); // same ref, untouched
    expect(normalizeIntervalSets(normalizeIntervalSets([legacy("work", 0), legacy("rest", 1)]))).toHaveLength(1);
  });

  it("leaves non-interval sets alone", () => {
    const strength: WorkoutSet = { id: "a", completed: true, type: "reps_weight", weight: 100, reps: 5 };
    const out = normalizeIntervalSets([strength]);
    expect(out).toEqual([strength]);
  });
});

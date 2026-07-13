import { describe, it, expect } from "vitest";
import {
  METRICS,
  metricsForLegacyType,
  resolveExerciseMetrics,
  resolveExerciseMetricsLoose,
  coerceMetricIds,
  metricUpdate,
  isExerciseType,
  solveCardioTriple,
  editedCardioField,
  EXERCISE_PRESETS,
} from "@/lib/metrics";
import type { MetricId } from "@/lib/types";

describe("metricsForLegacyType", () => {
  it("maps each legacy type to its metric bundle", () => {
    expect(metricsForLegacyType("reps_weight")).toEqual(["weight", "reps"]);
    expect(metricsForLegacyType("reps_time")).toEqual(["duration", "reps"]);
    expect(metricsForLegacyType("time_only")).toEqual(["duration"]);
    expect(metricsForLegacyType("time_distance")).toEqual(["duration", "distance"]);
    expect(metricsForLegacyType("reps_only")).toEqual(["reps"]);
  });

  it("returns [] for intervals and metrics (no flat bundle)", () => {
    expect(metricsForLegacyType("intervals")).toEqual([]);
    expect(metricsForLegacyType("metrics")).toEqual([]);
  });
});

describe("resolveExerciseMetrics", () => {
  it("prefers a non-empty explicit list", () => {
    expect(resolveExerciseMetrics("metrics", ["power_avg", "distance"])).toEqual([
      "power_avg",
      "distance",
    ]);
  });

  it("falls back to the legacy mapping when the list is empty/undefined", () => {
    expect(resolveExerciseMetrics("reps_weight", [])).toEqual(["weight", "reps"]);
    expect(resolveExerciseMetrics("reps_weight", undefined)).toEqual(["weight", "reps"]);
  });
});

describe("coerceMetricIds", () => {
  it("keeps only recognized metric ids", () => {
    expect(coerceMetricIds(["weight", "banana", "power_avg"])).toEqual([
      "weight",
      "power_avg",
    ]);
    expect(coerceMetricIds(undefined)).toEqual([]);
  });
});

describe("resolveExerciseMetricsLoose", () => {
  it("filters invalid strings, then falls back to legacy type", () => {
    expect(resolveExerciseMetricsLoose("metrics", ["distance", "nope"])).toEqual([
      "distance",
    ]);
    expect(resolveExerciseMetricsLoose("time_distance", [])).toEqual([
      "duration",
      "distance",
    ]);
    expect(resolveExerciseMetricsLoose("time_distance", undefined)).toEqual([
      "duration",
      "distance",
    ]);
  });

  it("returns [] for an unknown type with no valid metrics", () => {
    expect(resolveExerciseMetricsLoose("garbage", ["nope"])).toEqual([]);
  });
});

describe("isExerciseType", () => {
  it("recognizes valid types and rejects others", () => {
    expect(isExerciseType("metrics")).toBe(true);
    expect(isExerciseType("intervals")).toBe(true);
    expect(isExerciseType("reps_weight")).toBe(true);
    expect(isExerciseType("cardio")).toBe(false);
    expect(isExerciseType("")).toBe(false);
  });
});

describe("metricUpdate", () => {
  it("writes each metric's value to its flat set field", () => {
    expect(metricUpdate("powerAvg", 220)).toEqual({ powerAvg: 220 });
    expect(metricUpdate("time", 600)).toEqual({ time: 600 });
    expect(metricUpdate("paceSeconds", 330)).toEqual({ paceSeconds: 330 });
    expect(metricUpdate("heartRateAvg", 150)).toEqual({ heartRateAvg: 150 });
    expect(metricUpdate("incline", 1.5)).toEqual({ incline: 1.5 });
  });
});

describe("solveCardioTriple", () => {
  const ALL: MetricId[] = ["duration", "distance", "pace"];

  it("derives pace from duration and distance", () => {
    // 30 min over 6 km = 300 s/km = 5:00/km
    expect(solveCardioTriple(ALL, { time: 1800, distance: 6 }, "time")).toEqual({
      paceSeconds: 300,
    });
    // rounds to whole seconds
    expect(solveCardioTriple(ALL, { time: 1000, distance: 3 }, "distance")).toEqual({
      paceSeconds: 333,
    });
  });

  it("derives duration when pace is edited with distance set", () => {
    // 5:00/km over 6 km = 30 min
    expect(solveCardioTriple(ALL, { distance: 6, paceSeconds: 300 }, "paceSeconds")).toEqual({
      time: 1800,
    });
  });

  it("derives distance when it is the only blank field", () => {
    // 30 min at 5:00/km = 6 km
    expect(solveCardioTriple(ALL, { time: 1800, paceSeconds: 300 }, "time")).toEqual({
      distance: 6,
    });
    expect(solveCardioTriple(ALL, { time: 1000, paceSeconds: 333 }, "paceSeconds")).toEqual({
      distance: 3, // rounded to 2 decimals
    });
  });

  it("keeps the triple consistent when all three are set: time/distance edits recompute pace, pace edits recompute time", () => {
    const full = { time: 1800, distance: 6, paceSeconds: 999 };
    expect(solveCardioTriple(ALL, full, "time")).toEqual({ paceSeconds: 300 });
    expect(solveCardioTriple(ALL, full, "distance")).toEqual({ paceSeconds: 300 });
    expect(solveCardioTriple(ALL, { time: 999, distance: 6, paceSeconds: 300 }, "paceSeconds")).toEqual({
      time: 1800,
    });
  });

  it("solves nothing unless the exercise tracks all three metrics", () => {
    expect(solveCardioTriple(["duration", "distance"], { time: 1800, distance: 6 }, "time")).toEqual({});
    expect(solveCardioTriple(["duration", "pace"], { time: 1800, paceSeconds: 300 }, "time")).toEqual({});
  });

  it("solves nothing when the edited value or both partners are missing or zero", () => {
    expect(solveCardioTriple(ALL, { time: 0, distance: 6 }, "time")).toEqual({});
    expect(solveCardioTriple(ALL, { time: undefined, distance: 6 }, "time")).toEqual({});
    expect(solveCardioTriple(ALL, { time: 1800 }, "time")).toEqual({});
    expect(solveCardioTriple(ALL, { paceSeconds: 300 }, "paceSeconds")).toEqual({});
  });
});

describe("editedCardioField", () => {
  it("returns the triple field an update touches, even when set to undefined (a clear)", () => {
    expect(editedCardioField({ time: 600 })).toBe("time");
    expect(editedCardioField({ distance: undefined })).toBe("distance");
    expect(editedCardioField({ paceSeconds: 300 })).toBe("paceSeconds");
    expect(editedCardioField({ reps: 10 })).toBeUndefined();
  });
});

describe("registry integrity", () => {
  const ids = Object.keys(METRICS) as MetricId[];

  it("every metric's field matches metricUpdate output", () => {
    for (const id of ids) {
      const spec = METRICS[id];
      expect(metricUpdate(spec.field, 7)).toEqual({ [spec.field]: 7 });
    }
  });

  it("pace is lower-is-better; power/distance are higher; heart rate is not a PR", () => {
    expect(METRICS.pace.prDirection).toBe("lower");
    expect(METRICS.power_avg.prDirection).toBe("higher");
    expect(METRICS.distance.prDirection).toBe("higher");
    expect(METRICS.heart_rate_avg.prDirection).toBe("none");
  });

  it("presets reference only real metrics; Watts Bike tracks power + HR", () => {
    for (const preset of EXERCISE_PRESETS) {
      for (const id of preset.metrics) {
        expect(METRICS[id]).toBeDefined();
      }
    }
    const watts = EXERCISE_PRESETS.find((p) => p.id === "watts_bike")!;
    expect(watts.metrics).toContain("power_avg");
    expect(watts.metrics).toContain("heart_rate_avg");
  });
});

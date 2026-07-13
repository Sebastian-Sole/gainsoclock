import { describe, it, expect } from "vitest";
import {
  normalizeExerciseMetrics,
  MAX_METRICS,
  type MetricId,
} from "@/convex/metricsMap";

// Issue #102 §4: AI-created plans persist each exercise through
// normalizeExerciseMetrics (convex/aiTools.ts executeApproval). These tests
// pin the persistence behavior for a mixed strength + cardio plan so a
// running exercise can't silently degrade to a strength (weight/reps) row.
// The empty-metrics AI path is additionally rejected upstream by
// validateExercise in convex/aiTools.ts; the strength fallback below only
// remains reachable for non-AI/legacy inputs.

describe("normalizeExerciseMetrics (AI plan persistence)", () => {
  it("persists strength metrics as provided", () => {
    expect(normalizeExerciseMetrics("metrics", ["weight", "reps"])).toEqual({
      type: "metrics",
      metrics: ["weight", "reps"],
    });
  });

  it("persists running metrics as provided (no strength fallback)", () => {
    const running: MetricId[] = [
      "duration",
      "distance",
      "pace",
      "heart_rate_avg",
    ];
    expect(normalizeExerciseMetrics("metrics", running)).toEqual({
      type: "metrics",
      metrics: running,
    });
  });

  it("persists cycling metrics as provided, preserving order", () => {
    const cycling: MetricId[] = [
      "duration",
      "distance",
      "speed",
      "heart_rate_avg",
    ];
    expect(normalizeExerciseMetrics(undefined, cycling)).toEqual({
      type: "metrics",
      metrics: cycling,
    });
  });

  it("keeps intervals as intervals with no flat metric list", () => {
    expect(normalizeExerciseMetrics("intervals", [])).toEqual({
      type: "intervals",
      metrics: undefined,
    });
    expect(normalizeExerciseMetrics("intervals", ["duration"])).toEqual({
      type: "intervals",
      metrics: undefined,
    });
  });

  it("derives metrics from a legacy type when none are provided", () => {
    expect(normalizeExerciseMetrics("time_distance", undefined)).toEqual({
      type: "metrics",
      metrics: ["duration", "distance"],
    });
  });

  it("caps the persisted list at MAX_METRICS", () => {
    const tooMany: MetricId[] = [
      "duration",
      "distance",
      "pace",
      "heart_rate_avg",
      "cadence",
      "calories",
    ];
    const result = normalizeExerciseMetrics("metrics", tooMany);
    expect(result.metrics).toHaveLength(MAX_METRICS);
    expect(result.metrics).toEqual(tooMany.slice(0, MAX_METRICS));
  });

  it("documents the remaining strength fallback for empty non-AI input", () => {
    // AI payloads can no longer reach this (validateExercise rejects them);
    // legacy/unknown inputs still get the historical default.
    expect(normalizeExerciseMetrics(undefined, [])).toEqual({
      type: "metrics",
      metrics: ["weight", "reps"],
    });
  });
});

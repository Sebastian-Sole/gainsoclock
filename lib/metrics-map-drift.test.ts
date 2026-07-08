import { describe, it, expect } from "vitest";
import {
  METRICS,
  MAX_METRICS_PER_EXERCISE,
  metricsForLegacyType,
  coerceMetricIds as libCoerceMetricIds,
} from "@/lib/metrics";
import type { ExerciseType } from "@/lib/types";
import {
  METRIC_IDS,
  MAX_METRICS,
  legacyTypeToMetrics,
  coerceMetricIds as convexCoerceMetricIds,
} from "@/convex/metricsMap";

// Runtime drift tripwire between lib/metrics.ts and its hand-synced Convex
// mirror convex/metricsMap.ts. The type-level unions are already guarded by
// lib/types-drift.test-types.ts; this covers the *behavior* the types can't:
// mapping bodies, MAX constants, and coercion semantics. metricsMap.ts is
// plain TS (its only imports are convex/values validators), so Vitest can
// import it directly.

const EXERCISE_TYPES: ExerciseType[] = [
  "reps_weight",
  "reps_time",
  "time_only",
  "time_distance",
  "reps_only",
  "intervals",
  "metrics",
];

describe("convex/metricsMap.ts mirrors lib/metrics.ts", () => {
  it("legacyTypeToMetrics matches metricsForLegacyType for every exercise type", () => {
    for (const type of EXERCISE_TYPES) {
      expect(legacyTypeToMetrics(type), `type: ${type}`).toEqual(
        metricsForLegacyType(type)
      );
    }
  });

  it("METRIC_IDS matches the METRICS registry keys", () => {
    expect([...METRIC_IDS].sort()).toEqual(Object.keys(METRICS).sort());
  });

  it("MAX_METRICS constants agree", () => {
    expect(MAX_METRICS).toBe(MAX_METRICS_PER_EXERCISE);
  });

  it("coerceMetricIds implementations agree (unknown ids dropped, de-duped, order kept)", () => {
    const fixtures: string[][] = [
      [],
      ["weight", "reps"],
      ["weight", "banana", "weight", "power_avg", "reps", "power_avg"],
      ["banana"],
      ["distance", "pace", "distance"],
    ];
    for (const input of fixtures) {
      expect(convexCoerceMetricIds(input), input.join(",")).toEqual(
        libCoerceMetricIds(input)
      );
    }
  });
});

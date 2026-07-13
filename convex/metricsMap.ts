import type { Infer } from "convex/values";
import { metricIdValidator, exerciseTypeValidator } from "./validators";

// Convex-side mirror of the metric palette. The app's source of truth is
// lib/metrics.ts; convex must not import app code, so this is hand-synced (the
// metric-id union itself is guarded by lib/types-drift.test-types.ts).

export type MetricId = Infer<typeof metricIdValidator>;
export type ExerciseType = Infer<typeof exerciseTypeValidator>;

/**
 * All metric ids, in palette display order. Kept in lockstep with
 * metricIdValidator and lib/metrics.ts `METRIC_LIST`. Order is significant: this
 * array becomes the JSON-schema `enum` the AI model composes `metrics` from, so
 * it must mirror the client palette (weight before reps) to keep AI-created
 * exercises ordered the same as manually-created ones.
 */
export const METRIC_IDS: MetricId[] = [
  "weight",
  "reps",
  "duration",
  "distance",
  "pace",
  "speed",
  "incline",
  "power_avg",
  "heart_rate_avg",
  "cadence",
  "calories",
];

/** Keep the set row readable on a phone. Mirrors MAX_METRICS_PER_EXERCISE. */
export const MAX_METRICS = 5;

/**
 * Legacy exercise `type` → composed metric list. Mirrors lib/metrics.ts
 * `metricsForLegacyType`. 'intervals'/'metrics' have no flat metric list.
 */
export function legacyTypeToMetrics(type: string): MetricId[] {
  switch (type) {
    case "reps_weight":
      return ["weight", "reps"];
    case "reps_time":
      return ["duration", "reps"];
    case "time_only":
      return ["duration"];
    case "time_distance":
      return ["duration", "distance"];
    case "reps_only":
      return ["reps"];
    default:
      return [];
  }
}

/** Keep only recognized metric ids (de-duped, order preserved). */
export function coerceMetricIds(input: unknown): MetricId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: MetricId[] = [];
  for (const m of input) {
    if (
      typeof m === "string" &&
      (METRIC_IDS as string[]).includes(m) &&
      !seen.has(m)
    ) {
      seen.add(m);
      out.push(m as MetricId);
    }
  }
  return out;
}

/**
 * Normalize an AI-supplied (type, metrics) into what we persist so rows are
 * self-describing:
 * - 'intervals' stays 'intervals' (work/rest structure, no flat metric list).
 * - everything else becomes `type: 'metrics'` + a resolved metric list.
 *   Provided metrics win; otherwise derive from the legacy `type`; otherwise
 *   fall back to a strength default.
 */
export function normalizeExerciseMetrics(
  type: string | undefined,
  metrics: unknown
): { type: ExerciseType; metrics: MetricId[] | undefined } {
  if (type === "intervals") {
    return { type: "intervals", metrics: undefined };
  }
  let resolved = coerceMetricIds(metrics);
  if (resolved.length === 0 && type) resolved = legacyTypeToMetrics(type);
  if (resolved.length === 0) resolved = ["weight", "reps"];
  return { type: "metrics", metrics: resolved.slice(0, MAX_METRICS) };
}

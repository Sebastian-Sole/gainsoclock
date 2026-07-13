import type { Infer } from "convex/values";
import {
  metricIdValidator,
  exerciseTypeValidator,
  loadModeValidator,
} from "./validators";

// Convex-side mirror of the metric palette. The app's source of truth is
// lib/metrics.ts; convex must not import app code, so this is hand-synced (the
// metric-id union itself is guarded by lib/types-drift.test-types.ts).

export type MetricId = Infer<typeof metricIdValidator>;
export type ExerciseType = Infer<typeof exerciseTypeValidator>;
export type LoadMode = Infer<typeof loadModeValidator>;

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
 * Convex-side mirror of lib/load-mode.ts (convex must not import app code).
 * The stored weight is what the user physically picks up; `loadMode` says how
 * it relates to the total load. Absent = "total" (legacy default), so
 * pre-flag rows keep their interpretation. Only "per_hand" scales (×2 — two
 * implements moved at once); "per_side" is a labeling/analytics flag, not a
 * multiplier.
 */
export const LOAD_MODES: LoadMode[] = ["total", "per_hand", "per_side"];

/** Keep a recognized load mode, drop anything else (undefined = "total"). */
export function coerceLoadMode(input: unknown): LoadMode | undefined {
  return typeof input === "string" && (LOAD_MODES as string[]).includes(input)
    ? (input as LoadMode)
    : undefined;
}

/** Entered-weight → effective-total multiplier. Mirrors lib/load-mode.ts. */
export function loadMultiplier(loadMode: LoadMode | undefined): number {
  return loadMode === "per_hand" ? 2 : 1;
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

# Decision: composable metric palette for exercises

**Date**: 2026-07-04
**Status**: Adopted (composable curated metrics; intervals kept as a special case)

---

## Context

Exercises today carry a single closed `type` (`reps_weight`, `reps_time`,
`time_only`, `time_distance`, `reps_only`, `intervals`). That one field drives
the `workoutSets` columns, the client `WorkoutSet` discriminated union
(`lib/types.ts`), the Convex validators (`workoutSetValidator` +
`flatSetValidator`), input rendering (`components/workout/set-row.tsx`), the
column headers (duplicated in `app/workout/active.tsx` and `app/workout/[id].tsx`),
the default-set factory (`lib/defaults.ts`), and the stats/PR math
(`lib/stats.ts`, `lib/achievements.ts`). A compile-time tripwire
(`lib/types-drift.test-types.ts`) binds the client union to the server validator.

There is no way to log cardio machines (Watts Bike, rowing ergo) that track
average power (watts), average heart rate, distance, cadence, or calories. The
6 types are a fixed, non-composable taxonomy; adding a metric means editing every
layer above.

A user asked to log a Watts Bike / rowing machine tracking **average watts,
distance, and average heart rate**, and suggested fully user-defined variables.

## Decision

Move the source of truth from a single `type` to a **composable, ordered list of
curated metric primitives**: `exercise.metrics: MetricId[]`.

- A **metric primitive** is a typed measurement declared once in a registry
  (`lib/metrics.ts`): label, short label, the flat set field it writes, input
  kind, unit source, stats aggregation (`sum`/`max`/`avg`/…), and PR direction
  (`higher`/`lower`/`none`).
- The initial palette is **curated, not user-nameable**: `reps`, `weight`,
  `duration`, `distance`, `power_avg`, `heart_rate_avg`, `pace`, `speed`,
  `cadence`, `calories`. (Product decision: no free-text custom fields — keeps
  data quality high and lets stats stay fully general. Revisit only if demand
  appears; a single bounded "custom number" primitive is the escape hatch we'd
  add first.)
- The 6 legacy types become **presets** (metric bundles) for back-compat and are
  mapped at migration time. New presets ship on the same plumbing: Watts Bike,
  Rowing, Running, Cycling.
- **`intervals` is left unchanged** as a standalone special case (work/rest pair
  structure + per-set metric selector don't flatten into a simple metric list).

### Storage shape: bounded named columns, NOT a key/value bag

Because the palette is curated (finite, known), the set stays a **flat row with
bounded optional columns**. `workoutSets` keeps `reps/weight/time/distance/
paceSeconds/speed/rpe` and gains `powerAvg/heartRateAvg/cadence/calories`. A
generic `Record<metricId, value>` map was rejected: with a finite palette it buys
nothing and costs type safety, indexability, and the drift-tripwire discipline.

Metric → field mapping: `reps→reps`, `weight→weight`, `duration→time`,
`distance→distance`, `power_avg→powerAvg`, `heart_rate_avg→heartRateAvg`,
`pace→paceSeconds`, `speed→speed`, `cadence→cadence`, `calories→calories`.

## Consequences

- **Tradeoff (accepted)**: the `WorkoutSet` discriminated union flattens to one
  interface with optional fields. We lose the compile-time guarantee that
  "`reps_weight` always has reps+weight"; that invariant moves to runtime (the
  registry + default-set construction + the exercise's `metrics` list). This is
  inherent to arbitrary composition — you cannot have both composable metrics and
  a fixed per-type shape. The drift tripwire stays, now binding the flat client
  `WorkoutSet` ↔ flat `workoutSetValidator`.
- **Migration**: additive schema (new optional columns; existing rows untouched).
  A Convex migration backfills `metrics[]` from `type` on `exercises`,
  `templateExercises`, `workoutLogExercises`. `type` is retained one release as a
  deprecated column, then dropped.
- **Stats generalize**: `lib/stats.ts` / `lib/achievements.ts` iterate
  `exercise.metrics` and use each metric's `aggregation`/`prDirection` from the
  registry instead of per-type branches. Guarded by characterization tests
  pinning current behavior for the 6 legacy types before the refactor.
- **UX guardrails**: preset-first picker (progressive disclosure); a
  "Customize metrics" chip step capped at ~5 metrics so the set row stays
  readable; no free-text units.
- **Upside**: aligns manual logging with HealthKit-imported metrics (avg HR,
  distance, energy) — opens a later path to pre-fill avg HR from a linked Apple
  Watch workout. Lets the AI coach prescribe/read power & HR properly instead of
  the `time_distance` + free-text-notes workaround in `convex/chatActions.ts`.

## Maintenance notes

- Adding a metric = one registry entry + (if it needs a new column) one optional
  `workoutSets` column + validator field + a drift-tripwire check. No per-type
  branching.
- If `lib/types-drift.test-types.ts` fails after a set-shape change, reconcile
  `lib/types.ts` `WorkoutSet` with `convex/validators.ts` `workoutSetValidator`.

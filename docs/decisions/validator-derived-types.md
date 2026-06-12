# Decision: validator-derived types for WorkoutSet and ExerciseType

**Date**: 2026-06-13
**Status**: Adopted (Option A — tripwire only, no refactor)
**Plan ref**: plans/023-validator-derived-types.md (planned at `4500535`)

---

## Context

`lib/types.ts` hand-mirrors `convex/validators.ts` in three lockstep sites:

1. `ExerciseType` (6-literal union) in both `lib/types.ts:2-8` and `convex/validators.ts:3-10`
2. `WorkoutSet` (6-arm discriminated union) in `lib/types.ts:14-66` and `convex/validators.ts:20-77`
3. The serializer/accumulator branches in plans 004 and 011 that reconstruct sets from flat DB rows must agree with both sides

The root `tsconfig.json` excludes `convex/` from the TypeScript program, so a field-name mismatch between the two files would **not** be caught by `tsc`. It would surface as a runtime `ArgumentValidationError` when the offline sync queue flushes — i.e., as user data loss.

The question this investigation answers: can app code import from `convex/validators.ts` (not a generated file) to derive types via `Infer<>`, and does a compile-time tripwire work?

---

## Finding (Step 1 result)

`npx tsc --noEmit` exits 0 with the tripwire file `lib/types-drift.test-types.ts` in place.

**Feasibility: CONFIRMED.** The file imports `{ workoutSetValidator, exerciseTypeValidator }` from `@/convex/validators` and `type { Infer }` from `convex/values`. The `exclude: ["convex"]` in tsconfig only filters the *initial file set*; a file explicitly imported from an included file is still type-checked. Because the tripwire file is never imported by any bundle entry-point, no validator code reaches a Metro bundle.

**Self-test performed**: added `bogusField: string` to `RepsWeightSet` in `lib/types.ts`, ran `tsc --noEmit`, confirmed error at `lib/types-drift.test-types.ts:25` (`_setFromServer` direction) plus downstream errors in `lib/defaults.ts` and `lib/import/fitnotes.ts`. Reverted with `git checkout -- lib/types.ts`; tsc clean.

**No transitive server-only imports** were pulled in — no errors about `convex/server` or generated files. The STOP condition did not trigger.

**Current types are in sync** — no drift found between the two sides.

---

## Options

### Option A — Keep hand-written types + this tripwire (adopted)

The tripwire file `lib/types-drift.test-types.ts` is the only crosser of the
`convex/validators.ts` import boundary, and it is a type-position-only import.
No app bundle code changes. `lib/types.ts` keeps its doc comments.

**Pros**: zero blast radius; preserves existing 8-importer call sites unchanged; keeps `lib/types.ts` doc comments and custom inline commentary; safe to review and revert.

**Cons**: drift is caught at PR time, not prevented; the lockstep obligation still exists.

### Option B — Replace lib/types.ts unions with `Infer<>` aliases

```ts
export type WorkoutSet = Infer<typeof workoutSetValidator>;
export type ExerciseType = Infer<typeof exerciseTypeValidator>;
```

**Pros**: single source of truth; drift is structurally impossible.

**Cons**: crosses the documented `_generated`-only boundary for 8 importers (`stores/workout-store.ts`, `stores/history-store.ts`, `stores/edit-log-store.ts`, `app/workout/active.tsx`, `app/workout/[id].tsx`, `components/workout/set-row.tsx`, `lib/defaults.ts`, `lib/import/fitnotes.ts`); loses `BaseSet` interface, per-arm interfaces, and field-level comments used as documentation; any future change to `convex/validators.ts` immediately affects all 8 importers.

### Option C — Codegen step

A build script outputs `lib/types-generated.ts` from validators. Complex to maintain; no precedent in this repo.

---

## Decision

**Option A** — tripwire file only, no refactor.

Rationale: the tripwire converts a silent runtime risk into a blocked CI job at zero blast radius. Option B's benefits (single source of truth) are real but the cost (8-importer boundary crossing, lost doc comments) is disproportionate while the codebase is stable. If drift recurs twice despite the tripwire, escalate to Option B with the blast-radius list above.

---

## Boundary rule (for adoption in CLAUDE.md / coding-conventions.md)

The operator should decide whether to add the following sentence to
`.claude/rules/coding-conventions.md` under the **Convex** section:

> `convex/validators.ts` may be imported by app code in type positions only,
> and solely inside `*.test-types.ts` tripwire files. No other app-side file
> may import directly from `convex/validators.ts`.

This file documents the intent; editing `CLAUDE.md` or `coding-conventions.md`
is the operator's call.

---

## Maintenance notes

- If Option A stands: any future set/exercise shape change now fails `tsc` when
  one side is forgotten — plan 001's CI makes that a blocked PR.
- If drift recurs twice despite the tripwire, escalate to Option B with the
  8-importer blast-radius list above.
- The tripwire does not cover validators beyond `workoutSetValidator` and
  `exerciseTypeValidator`. If new lockstep types are added (e.g. `PlanDay`
  shape), add corresponding assignments to `lib/types-drift.test-types.ts`.

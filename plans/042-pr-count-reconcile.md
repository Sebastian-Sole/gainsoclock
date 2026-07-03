# Plan 042: Make the client/server PR-count relationship honest, and test countWeightPrs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- lib/achievements.ts lib/achievements.test.ts convex/weeklyReview.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs + tests; no algorithm change)
- **Depends on**: none (sequencing note: plan 038 also edits `lib/achievements.ts` — do not run the two concurrently in one worktree)
- **Category**: tech-debt + tests
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

`lib/achievements.ts`'s `countWeightPrs` (drives the "Record Breaker"
achievement and the monthly recap PR stat) documents itself as "mirroring
the server-side semantics in `convex/weeklyReview.ts`" — but the two have
structurally diverged: the client scans the user's **entire loaded history**
with an all-time running best, while the server compares a week's bests only
against the **last 60 workouts** (`MAX_PRIOR_LOGS`). Both are reasonable for
their jobs (all-time achievement vs. "PR vs the recent past" in a weekly
digest), but the "mirrors" claim is false and invites a future editor to
"fix" one side against the other. The function is also completely untested
despite being pure and driving a user-visible unlock. This plan replaces the
false claim with a documented, deliberate divergence and pins the client
semantics with characterization tests. **It does not change either
algorithm.**

## Current state

- `lib/achievements.ts:458-469` — the doc comment making the false claim
  (excerpt):

  ```ts
  /**
   * Counts weight PRs across workout logs, mirroring the server-side semantics
   * in `convex/weeklyReview.ts`: a PR is a session whose best completed
   * `reps_weight` set for an exercise strictly exceeds that exercise's best
   * across all PRIOR sessions. The first session for an exercise establishes
   * the baseline and is not a PR.
   ...
  ```

- `lib/achievements.ts:469-502` — the implementation: sorts logs by
  `startedAt` ascending, per session computes best completed `reps_weight`
  weight per `exercise.exerciseId`, first sighting is baseline (not a PR),
  strict `>` beats the all-time running best → `prCount++` and best updates.
- `convex/weeklyReview.ts:71` — `const MAX_PRIOR_LOGS = 60;` and lines
  172-180: prior history is explicitly bounded ("the last MAX_PRIOR_LOGS
  workouts before the week define the comparison window (a 'PR' vs the
  recent past)"). A third, separate PR notion exists in
  `convex/workoutFeedback.ts` (~line 111) — leave it alone.
- Callers of `countWeightPrs` (do not change them):
  `hooks/use-achievements.ts:155` (`totalPrCount`),
  `components/achievements/monthly-recap-card.tsx:~88-90` (month delta:
  `countWeightPrs(logsThroughMonth) - countWeightPrs(logsBeforeMonth)`).
- `lib/achievements.test.ts` — existing suite (migration, groups, signals,
  meal-day signals). No test references `countWeightPrs`
  (`grep -c countWeightPrs lib/achievements.test.ts` → 0). Use this file's
  existing fixture style for the new cases; tests use explicit Vitest
  imports, node env.
- `WorkoutLog` shape for fixtures: see `lib/types.ts` (`exercises[]` each
  with `exerciseId`, `sets[]`; a `reps_weight` set has
  `{ id, completed, type: 'reps_weight', reps, weight }`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test -- lib/achievements.test.ts` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/achievements.ts` — the `countWeightPrs` doc comment ONLY (no code).
- `lib/achievements.test.ts` — new test cases.
- `convex/weeklyReview.ts` — one comment line (Step 3).

**Out of scope** (do NOT touch, even though they look related):
- The `countWeightPrs` implementation and both callers.
- The server PR algorithm in `convex/weeklyReview.ts` (comment only).
- `convex/workoutFeedback.ts`'s PR notion.
- Extracting a shared client/server PR function — considered and rejected:
  the two windows are *different features* (all-time vs recent-past), and
  convex→lib imports would cross an undecided boundary.

## Git workflow

- Branch: `advisor/042-pr-count-honesty`
- Commit style: `test(achievements): pin countWeightPrs; document deliberate client/server divergence`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite the client doc comment

Replace the "mirroring the server-side semantics" sentence in
`lib/achievements.ts` with an explicit divergence note. Target content
(adapt wording, keep the existing content about units that follows):

```ts
/**
 * Counts weight PRs across ALL provided workout logs: a PR is a session
 * whose best completed `reps_weight` set for an exercise strictly exceeds
 * that exercise's best across all PRIOR sessions (all-time running best).
 * The first session for an exercise establishes the baseline and is not a PR.
 *
 * DELIBERATELY DIFFERENT from the server: `convex/weeklyReview.ts` counts a
 * week's PRs against only the last MAX_PRIOR_LOGS(=60) workouts ("PR vs the
 * recent past" for the digest), so the two counts can legitimately disagree.
 * Do not "reconcile" one to the other without a product decision.
  ...
```

**Verify**: `grep -c "mirroring the server-side" lib/achievements.ts` → 0;
`grep -c "DELIBERATELY DIFFERENT" lib/achievements.ts` → 1.

### Step 2: Characterization tests for countWeightPrs

Add a `describe("countWeightPrs", ...)` block to `lib/achievements.test.ts`
with a small `log()` fixture builder. Cases (pin CURRENT behavior):

1. empty logs → 0.
2. single session, one exercise → 0 (baseline, not a PR).
3. second session heavier → 1; third session equal weight → still 1
   (strict `>`).
4. within-session: multiple sets, only the session best counts (two
   improving sets in one session ≠ two PRs).
5. uncompleted sets and non-`reps_weight` sets are ignored.
6. two exercises progress independently (one PR each → 2).
7. logs supplied out of order are sorted by `startedAt` (build them
   shuffled; expect chronological semantics).
8. regression sessions (lighter than best) don't decrement or reset the
   baseline.

**Verify**: `pnpm test -- lib/achievements.test.ts` → all pass, ≥8 new tests.

### Step 3: Cross-reference on the server side

In `convex/weeklyReview.ts`, extend the existing bounded-window comment
(lines 172-174 area) with one line:

```ts
// NOTE: the client's all-time count lives in lib/achievements.ts
// countWeightPrs — different window BY DESIGN; see its doc comment.
```

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

## Test plan

Step 2 is the test plan (≥8 cases, model after the existing
`lib/achievements.test.ts` structure). Full-suite check: `pnpm test` →
exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "countWeightPrs" lib/achievements.test.ts` → ≥8
- [ ] `grep -c "mirroring the server-side" lib/achievements.ts` → 0
- [ ] `grep -c "BY DESIGN" convex/weeklyReview.ts` → 1
- [ ] `pnpm test`, `npx tsc --noEmit`, `npx tsc --noEmit -p convex`, `pnpm lint` all exit 0
- [ ] `git status` shows only the three in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Writing the tests reveals `countWeightPrs` behavior that contradicts its
  own doc comment (e.g. non-strict comparison, per-set instead of per-session
  counting) — that's a bug finding, not a characterization; report before
  pinning it.
- Plan 038 is mid-flight in the same worktree (both edit
  `lib/achievements.ts`) — coordinate ordering rather than merging blind.

## Maintenance notes

- If the operator ever wants the counts unified, the decision is a product
  one (which window is "a PR"?) — the two doc comments now point at each
  other so whoever makes it sees both sides.
- Reviewer: check the tests assert on *counts*, not on internal maps, and
  that no test fixture depends on `Date.now()`.

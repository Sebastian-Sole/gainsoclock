# Plan 043: Stop computing legacy streaks that every caller discards

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- lib/stats.ts lib/stats.test.ts hooks/use-stats.ts components/achievements/monthly-recap-card.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (do BEFORE plan 038, which builds on the stats path)
- **Category**: perf
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

`computeAllStats` always runs `computeStreaks` — a full unique-dates +
two-pass scan over every log — but both of its callers throw that result
away: `hooks/use-stats.ts` spreads the stats and overwrites `streaks`
entirely with the richer rest-day-aware computation from `lib/streaks.ts`,
and `components/achievements/monthly-recap-card.tsx` computes its own
`computeStreak` and never reads `stats.streaks`. That's a wasted full pass
over all logs on the hot stats path — a path `useAchievements` currently
runs app-wide (see plan 038). Removing it is pure dead-work elimination.

## Current state

- `lib/stats.ts:534-546` — the entry point:

  ```ts
  export function computeAllStats(logs: WorkoutLog[], now: Date): AllStats {
    const totals = computeTotals(logs);
    return {
      exerciseStats: computeExerciseStats(logs),
      streaks: computeStreaks(logs, now),
      ...
  ```

- `lib/stats.ts:251-255` — the function's own comment says it's legacy:

  ```ts
  // Legacy logs-only streaks. `hooks/use-stats.ts` overrides this with the
  // rest-day-aware + external-workout-aware computation in `lib/streaks.ts`;
  // this remains as the fallback baked into `computeAllStats` for callers
  // that only have workout logs.
  function computeStreaks(logs: WorkoutLog[], now: Date): StreakStats {
  ```

  (The "callers that only have workout logs" justification is now false —
  the only other caller, monthly-recap-card, also uses `lib/streaks.ts`.)
- `lib/stats.ts:67` — `export interface StreakStats { ... }`; line 132 —
  `streaks: StreakStats;` inside `AllStats`.
- `hooks/use-stats.ts:39` — `const stats = computeAllStats(filtered, now);`
  then lines 75-87 return `{ ...stats, streaks: { ...from computeStreak... } }`.
- `components/achievements/monthly-recap-card.tsx:63` —
  `const stats = computeAllStats(monthLogs, now);` — reads
  `stats.exerciseStats`, totals-ish fields; computes its own `computeStreak`
  at lines ~80-85; never touches `stats.streaks`.
- Only other `.streaks` consumers read the **useStats result** (already the
  override): `components/stats/overview-tab.tsx:28`,
  `hooks/use-achievements.ts:156-157`. Verified — no caller reads the legacy
  values.
- `lib/stats.test.ts` — characterization suite pinning `computeAllStats`,
  including the legacy streaks (lines 96-97: `all.streaks.currentStreak`,
  `all.streaks.longestStreak` on empty input). These pins must move, not
  silently vanish.
- `lib/stats.ts:76` — a doc comment mentioning "streaks come from the legacy
  `computeStreaks` path" — update alongside.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/stats.ts`
- `lib/stats.test.ts`
- `hooks/use-stats.ts`
- `components/achievements/monthly-recap-card.tsx` (only if its typing
  breaks — expected: no change needed)

**Out of scope** (do NOT touch, even though they look related):
- `lib/streaks.ts` — the real streak engine; untouched.
- `components/stats/overview-tab.tsx`, `hooks/use-achievements.ts` — they
  consume the hook's result whose shape does not change.
- `StreakStats` interface — still exported (the hook's override uses it).

## Git workflow

- Branch: `advisor/043-stats-dead-streak-pass`
- Commit style: `perf(stats): drop the legacy streak pass every caller discards`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the return type and drop the pass

In `lib/stats.ts`:

- Change `computeAllStats` to return `Omit<AllStats, 'streaks'>` and delete
  the `streaks: computeStreaks(logs, now),` line.
- Delete the now-unused `computeStreaks` function (lines ~251-311). Before
  deleting, check its helpers: `grep -n "getUniqueDates" lib/stats.ts` — if
  `getUniqueDates` (or anything else it uses) has no other caller, delete it
  too; if it has other callers, keep it.
- Keep `AllStats` (with `streaks`) and `StreakStats` exported — `useStats`
  still returns the full `AllStats`.
- Update the two stale comments (lines ~76 and the legacy block comment) to
  say streaks are computed exclusively in `hooks/use-stats.ts` via
  `lib/streaks.ts`.

**Verify**: `npx tsc --noEmit` → the ONLY errors (if any) are in
`lib/stats.test.ts` (fixed next) — `hooks/use-stats.ts` already constructs
`streaks` explicitly so it satisfies `AllStats`; monthly-recap-card never
reads `.streaks` so `Omit` suffices.

### Step 2: Move the test pins

In `lib/stats.test.ts`, remove/adjust assertions on `all.streaks.*`
(lines 96-97 and any others `grep -n "streaks" lib/stats.test.ts` finds).
Do NOT lose streak coverage overall — it lives in `lib/streaks.test.ts`
(the real engine's suite). If a stats test was the only pin for some
legacy-streak edge (check what the removed assertions covered), note that
in the commit message; the legacy behavior is intentionally deleted, not
migrated.

**Verify**: `pnpm test` → exit 0.

### Step 3: Full gate

**Verify**: `npx tsc --noEmit` → 0; `pnpm lint` → 0; `pnpm test` → 0;
`grep -c "computeStreaks" lib/stats.ts` → 0.

## Test plan

No new tests — this removes dead work. The existing suites are the net:
`lib/streaks.test.ts` (real streak engine, untouched) and the updated
`lib/stats.test.ts` (all remaining fields still pinned).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "computeStreaks" lib/stats.ts` → 0
- [ ] `grep -rn "\.streaks" components/achievements/monthly-recap-card.tsx` → 0 matches (unchanged fact, re-assert)
- [ ] `pnpm test`, `npx tsc --noEmit`, `pnpm lint` all exit 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `grep -rn "computeAllStats" app components hooks lib` shows a caller other
  than `hooks/use-stats.ts` and `components/achievements/monthly-recap-card.tsx`
  (a new consumer appeared since `08f585b` — re-check whether it reads
  `.streaks` before proceeding).
- Removing `computeStreaks` breaks a non-test import (someone imports it
  directly).

## Maintenance notes

- Plan 038's engine computes stats through this same path — landing 043
  first means the engine never pays the dead pass.
- Reviewer: confirm `AllStats` is still the hook's return type and the
  override object is field-complete for `StreakStats` (it already carries
  extra fields like `todayCovered`; TS checks this).

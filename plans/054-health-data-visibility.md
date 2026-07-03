# Plan 054: Surface the health data users already share — trends spike + body-weight card

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- convex/healthData.ts convex/schema.ts components/stats app/\(tabs\)/stats.tsx lib/stats.ts lib/healthkit.ts`
> On any mismatch with the "Current state" excerpts, STOP.

## Status

- **Priority**: P3
- **Effort**: S build + S spike (the full trends surface is M–L and is
  deliberately NOT built here — the spike scopes it)
- **Risk**: LOW — read-only display of already-stored data + one memo
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

The app ingests rich per-day health data — sleep, resting heart rate, HRV,
steps, body mass, active energy (`healthDailyMetrics`,
`convex/schema.ts:376`) — and captures per-set RPE and interval pace. The
user never sees any of it as a trend: the only consumers are the AI prompt,
the weekly review's two averages, and one achievement flag. The Stats tab
charts workout totals only. Body-weight-over-time is a baseline expectation
for a fitness+nutrition app, and the data already flows in. This plan ships
the single highest-value piece (a body-weight trend in Stats) and produces
a design memo that scopes the rest (sleep/HRV/RHR trends, RPE/intensity
charts, interval pace records, and dietary write-back to Apple Health) so
each can become its own right-sized plan.

## Current state

- `convex/schema.ts:376` — `healthDailyMetrics` stores per day (all
  optional): `asleepSeconds`, `restingHeartRateBpm`, `hrvMs`, `steps`,
  `bodyMassKg`, `activeEnergyKcal`. Indexed `by_user_date` (usage exemplar:
  `convex/weeklyReview.ts:320-325` queries
  `withIndex("by_user_date", q => q.eq("userId", ...).gte("date", ...).lt("date", ...))`).
- `convex/healthData.ts` — existing surface: `upsertDailyMetrics` (:79),
  `listExternalWorkouts` (:137), `getHealthSummary` (:206),
  `hasHealthPersonalizationConsent` helper (:221 — read its comment: it
  gates AI use of health data; in-app display to the data's owner has a
  different consent posture; confirm before gating the new query).
- Stats tab — `app/(tabs)/stats.tsx` renders four inner tabs: History,
  Overview, Exercises, Records (imports at lines 13–16). Sections are
  plain components in `components/stats/` (`overview-tab.tsx` composes
  `WeeklyReviewEntryCard`, `StreaksSection`, totals/averages sections;
  `stat-card.tsx` is the small numeric card primitive). There is **no
  charting library** — `yearly-overview-section.tsx` and friends build
  bars/grids from Views. Whatever the trend card renders must follow that
  approach (no new chart dependency without an operator decision — record
  in the memo instead).
- RPE capture (memo subject): `convex/schema.ts:109` (`workoutSets.rpe`),
  gated by `rpeEnabled` setting (`schema.ts:253`), input UI
  `components/workout/rpe-input.tsx`; interval fields
  (`variant`/`metric`/`paceSeconds`/`speed`) at `schema.ts:110-117`.
  Zero references in `components/stats/` or `lib/stats.ts` (grep-verified).
- HealthKit write scopes (memo subject): `lib/healthkit.ts:60-63` —

  ```ts
  export const HEALTHKIT_WRITE_SCOPES = [
    'HKQuantityTypeIdentifierActiveEnergyBurned',
    'HKWorkoutTypeIdentifier',
  ] as const;
  ```

  Workouts are written out (`saveWorkoutToHealthKit`, :212); logged
  nutrition never is. The file's header (lines 1–10) locks scope changes to
  a documented review process — quote it in the memo.
- Conventions: server queries must be index-backed and auth-checked
  (`getAuthUserId` + bail); keep list payloads bounded; theme tokens; the
  `stat-card.tsx` look for numeric cards.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**:
- `convex/healthData.ts` (one new query: `listDailyMetrics`)
- `components/stats/body-weight-section.tsx` (create)
- `components/stats/overview-tab.tsx` (mount the section)
- `docs/design/health-trends.md` (create — the memo)

**Out of scope** (do NOT touch):
- `lib/healthkit.ts` — NO scope changes; dietary write-back is memo-only
  (it needs a permission re-prompt + privacy-copy/legal review).
- `lib/stats.ts`, RPE/interval charting — memo-only.
- Adding a charting dependency — memo-only decision.
- The Health/Body data *ingestion* path (`upsertDailyMetrics` etc.).

## Git workflow

- Branch: `advisor/054-health-data-visibility`
- Commits: (1) query + section, (2) memo.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `listDailyMetrics` range query

In `convex/healthData.ts`, add a public query `listDailyMetrics` with args
`{ from: v.string(), to: v.string() }` ("YYYY-MM-DD", half-open) that
auth-checks via `getAuthUserId` (bail to `[]` when null), queries
`healthDailyMetrics` `by_user_date` with the range bounds (copy the
`weeklyReview.ts:320-325` pattern), and returns only the fields the client
needs: `{ date, bodyMassKg }` plus the other metric fields — but **cap the
range server-side at 400 days** (clamp `from`) so the payload stays
bounded. Decide the consent question by reading
`hasHealthPersonalizationConsent`'s comment (:221): if it documents that
in-app display is not gated by that consent, don't gate; otherwise gate and
note it.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 2: Body-weight trend section

Create `components/stats/body-weight-section.tsx`: section header "Body
Weight" matching `streaks-section.tsx`'s header style; fetch the last 90
days via `useQuery(api.healthData.listDailyMetrics, ...)`; render:

- Latest weight + delta vs 30 days ago as `stat-card.tsx`-style numbers,
  converted to the user's `weightUnit` from the settings store (kg is the
  stored unit — see `bodyMassKg`).
- A simple View-based sparkline/bar trend of non-null `bodyMassKg` points
  (follow the hand-rolled approach used by the existing stats sections —
  no new dependency).
- Render nothing (return null) when there are zero non-null points — most
  users without HealthKit will have none, and an empty section is noise.

Mount it in `components/stats/overview-tab.tsx` after the existing
sections. Dynamic type + a11y: the trend is decorative
(`accessibilityElementsHidden` on the sparkline) with the numbers carrying
the information.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors.

### Step 3: The scoping memo

Write `docs/design/health-trends.md` covering, each with evidence you
verify yourself and a coarse size:

1. **Recovery trends** (sleep, RHR, HRV, steps): candidate placement (a
   fifth Stats tab vs Overview sections), the 400-day payload bound, gaps
   handling (HealthKit users only — expected sparse data).
2. **RPE / intensity charts**: what `lib/stats.ts` computes today, what an
   RPE extension needs (avg session RPE, per-exercise trend), the
   `rpeEnabled` gating requirement (hide when off).
3. **Interval pace records**: `paceSeconds`/`speed`/`distanceUnit` fields
   vs the Records tab's weight-centric shape.
4. **Dietary write-back to Apple Health**: required new write scopes
   (DietaryEnergyConsumed, DietaryProtein, DietaryCarbohydrates,
   DietaryFatTotal), the scope-lock process from `lib/healthkit.ts:1-10`
   (quote it), permission re-prompt implications, `NSHealthUpdateUsageDescription`
   copy, dedupe via the external-UUID stamping pattern
   (`saveWorkoutToHealthKit` + `deleteAuthoredSamples` :608 show the
   authored-sample lifecycle), and the meal-log chokepoint where the write
   would hook (`stores/meal-log-store.ts:78` region). End with
   "OPERATOR DECISION REQUIRED" — write-back must not be built without the
   privacy-copy review.
5. **Charting approach**: keep hand-rolled Views vs adopt a library —
   recommend one path with reasoning (bundle cost precedent:
   `docs/perf/baseline.md` rejected lucide dead-weight claims by measuring;
   any dependency proposal must include a measurement plan).

**Verify**: file exists;
`grep -c "OPERATOR DECISION" docs/design/health-trends.md` → ≥1.

## Test plan

- Convex query: type-checked; not covered by vitest (scope is `lib/**`).
- If you extract the delta/series-preparation logic to
  `lib/body-weight-trend.ts` (recommended — keep the component thin), add
  `lib/body-weight-trend.test.ts`: empty input → null-state, sparse dates →
  correct latest/delta, unit conversion applied. Model on existing
  `lib/*.test.ts` table style.

## Done criteria

- [ ] `npx tsc --noEmit` and `npx tsc --noEmit -p convex` exit 0; lint 0; tests pass
- [ ] `listDailyMetrics` is index-backed (`by_user_date`), auth-checked, range-capped
- [ ] Body-weight section renders in Overview and returns null with no data
- [ ] Weight displayed in the user's `weightUnit`
- [ ] `docs/design/health-trends.md` covers all five memo topics
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated; report states "needs Convex deploy"

## STOP conditions

Stop and report back (do not improvise) if:

- `healthDailyMetrics` or its `by_user_date` index doesn't match the
  excerpt (schema drift).
- `hasHealthPersonalizationConsent`'s documentation is ambiguous about
  in-app display — gating is a privacy call; report, don't guess.
- Rendering a usable trend genuinely requires a charting library (i.e. the
  hand-rolled approach fails accessibility or layout) — that's the memo's
  Step 3.5 decision, not yours.

## Maintenance notes

- The 90-day client fetch + 400-day server clamp are v1 bounds; if a future
  plan adds range pickers (like the History tab's), reuse its
  `date-range-picker.tsx`.
- Body weight also arrives via onboarding/profile (`userProfile`), not only
  HealthKit — the memo should note whether to merge those sources later;
  v1 charts `healthDailyMetrics` only.
- Follow-ups this memo feeds: recovery-trends plan, RPE-charts plan,
  dietary write-back plan (privacy-gated). None should start before the
  operator reads the memo.
- Reviewer scrutiny: payload bounds on the new query, null-state behavior,
  no HealthKit module import outside `lib/healthkit.ts`.

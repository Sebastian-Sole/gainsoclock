# Plan 056: Ship data export Phase 1 — FitNotes-compatible workout CSV

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- convex/exportActions.ts app/settings/index.tsx lib/import/fitnotes.ts docs/design/data-export.md lib/analytics.ts`
> On any mismatch with the "Current state" excerpts, STOP.
> (`convex/exportActions.ts` should not exist yet — if it does, someone
> started this; STOP and report.)

## Status

- **Priority**: P2
- **Effort**: S (2–3 days per the design doc's own estimate)
- **Risk**: LOW — additive read-only action + one settings row. The size
  guard is the one correctness-critical piece.
- **Depends on**: 049 (soft — adds an event to the same analytics union).
  **Convex deploy required after merge.**
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

Users can import their training history (FitNotes) but can never take
their data out — a trust gap, a GDPR Art. 20 expectation for an
EU-targeted app, and table stakes vs Strong/Hevy which both export CSV.
The full design was completed in `docs/design/data-export.md` (advisor plan
028): scope matrix over all 23 tables, formats, assembly strategy,
transport options, privacy notes. Its §9 "Phase 1" is deliberately tiny —
a FitNotes-compatible workouts CSV via the OS share sheet, **zero new
dependencies** — and merges cleanly into the later full-JSON phase. This
plan executes exactly that Phase 1.

**Transport decision (resolves the design doc's §8 Q1 for Phase 1)**: use
Option B — `Share.share({ message })` with a strict size guard — as the
doc itself scopes for Phase 1 (`docs/design/data-export.md:342-357`). The
full-JSON phase (M) with `expo-file-system` remains a separate follow-up
plan and still needs the operator's Q1 answer.

## Current state

- `docs/design/data-export.md` — READ IT FULLY FIRST. Key anchors:
  - §3b (lines 113–128): CSV columns must match the importer's
    `FitNotesRow` for a free round-trip acceptance test.
  - §5 Option B (lines 213–223): message-share transport, "hard limit
    ~1–2 MB in practice", viable only "with explicit size check".
  - §9 Phase 1 (lines 342–357): file list — `convex/exportActions.ts`
    (new), `app/settings/index.tsx` (one row) — and the size guard: count
    rows first, error above ~800 KB estimated.
- `lib/import/fitnotes.ts:11-28` — the column contract (excerpt):

  ```ts
  export interface FitNotesRow {
    Name: string; StartTime: string; EndTime: string; BodyWeight: string;
    Exercise: string; Equipment: string; Reps: string; Weight: string;
    Time: string; Distance: string; Status: string; IsWarmup: string;
    RPE: string; RIR: string; Categories: string; Note: string;
  }
  ```

  Per the design doc: `BodyWeight`, `Equipment`, `IsWarmup`, `RIR`,
  `Categories` have no Fitbull schema equivalent → emit empty strings;
  `Status` → `"Done"` for `completed: true` sets (the importer checks
  exactly that, `lib/import/fitnotes.ts:168` per the doc).
- `app/settings/index.tsx` — the DATA section is at ~line 704: "Import
  Data" row (:713) then "Reset Data" row (:727). The export row goes
  between them (the doc's §6 placement). Row structure: copy the Import
  Data `Pressable` (icon + title + subtitle + chevron, a11y props,
  `testID`).
- Convex action exemplars: `convex/weeklyReview.ts:667` (`generateReview`)
  shows the auth-checked public action + `ctx.runQuery(internal...)`
  composition; data reads for workouts use the
  `by_user_completedAt` / `by_workout` / `by_workout_exercise` indexes
  (see `convex/weeklyReview.ts:115-149` for the log → logExercises → sets
  join pattern, keyed by `clientId`).
- Analytics: the design doc's §7 specifies a PostHog event on export —
  `export_initiated` with `{ format, scopes }`, no payload data. The
  event union lives in `lib/analytics.ts:19-102` (plan 049 extends it;
  rebase on 049 and add this event in its style).
- Weights unit note: `workoutSets.weight` is stored in the user's preferred
  unit (see `convex/weeklyReview.ts:107-111` reading `userSettings.weightUnit`
  to normalize). FitNotes CSV has a bare `Weight` column — export the
  stored value as-is and note the unit in your report; do NOT convert
  (round-trip fidelity with our own importer matters more than
  cross-app unit semantics in Phase 1).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass (incl. round-trip test) |

## Scope

**In scope**:
- `convex/exportActions.ts` (create — `exportWorkoutsCSV` action; CSV
  assembly as a pure, separately exported helper if you keep it in
  `convex/`, or better: pure CSV row-building in `lib/export/fitnotes-csv.ts`
  so it's vitest-testable, with the Convex action feeding it data — choose
  the `lib/` split, it matches the repo's lib-pure-module testing decision)
- `lib/export/fitnotes-csv.ts` + `lib/export/fitnotes-csv.test.ts` (create)
- `app/settings/index.tsx` (one row + handler)
- `lib/analytics.ts` (one event, post-049 style)

**Out of scope** (do NOT touch):
- `expo-file-system`, any new dependency — Phase 2 territory.
- JSON export, chat/profile/health scopes, the scope-picker screen — all
  Phase 2 (`docs/design/data-export.md:359-374`).
- Rate limiting (§8 Q3) — the doc leaves it open; Phase 1 ships without;
  note it in your report.
- `lib/import/fitnotes.ts` — read-only contract; do not "fix" the importer.

## Git workflow

- Branch: `advisor/056-data-export-phase1`
- Commits: (1) lib CSV builder + tests, (2) Convex action, (3) settings row.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure CSV builder in `lib/export/fitnotes-csv.ts`

Input: arrays of workout logs, log-exercises, sets, exercises (client-shape
types from `lib/types.ts` — same shapes the importer's `buildWorkoutLogs`
produces). Output: a CSV string with the exact `FitNotesRow` header order
(`Name,StartTime,EndTime,BodyWeight,Exercise,Equipment,Reps,Weight,Time,Distance,Status,IsWarmup,RPE,RIR,Categories,Note`).
Empty strings for the five no-equivalent columns; `Status: "Done"` iff the
set is completed; CSV-escape fields containing commas/quotes/newlines
(quote-wrap + double inner quotes — or use Papa.unparse, `papaparse` is
already a dependency of the importer).

**Verify**: `pnpm test -- fitnotes-csv` → new tests pass (see Test plan).

### Step 2: The Convex action

Create `convex/exportActions.ts` with `exportWorkoutsCSV` (public action):
`getAuthUserId` bail; count `workoutSets` rows first (bounded index scan)
and if `rowCount * 200 bytes > 800_000` return
`{ ok: false as const, reason: "too_large" as const }` — do NOT assemble;
otherwise read logs → logExercises → sets → exercises via the indexed join
pattern (`convex/weeklyReview.ts:115-149` shape, but `.collect()` over the
user's full history), assemble rows server-side into the same column
contract (duplicate the tiny row-shaping there or return raw rows for the
client's lib builder — prefer returning structured rows and letting the
client's `lib/export/fitnotes-csv.ts` build the string, so the tested code
path is the one that runs), and return `{ ok: true as const, rows }`.
Mind the Convex action return-size note in the design doc §4: the 800 KB
guard is what keeps a single return legal — state the guard's math in a
comment.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 3: Settings row + share

In `app/settings/index.tsx`, add an "Export My Data" row between Import
Data (:713) and Reset Data (:727), cloning the Import row's structure
(icon: `Download` is already imported per the design doc §6 — verify, else
use `Share2`). Handler: call the action; on `too_large`, Alert explaining
the full export is coming in a later version (doc's §9 toast guidance); on
success, build the CSV via the lib builder and
`Share.share({ message: csv, title: "fitbull-workouts.csv" })`; fire
`capture({ name: "export_initiated", props: { format: "csv", scopes: ["workouts"] } })`
before sharing. Show a loading state on the row while running (match how
`handleRestore`'s `isRestoring` disable works in the same file).

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors.

## Test plan

`lib/export/fitnotes-csv.test.ts`, modeled on the existing importer tests
(check `ls lib/import/*.test.ts` — plan 025 added characterization tests;
mirror their fixture style):

1. Header row matches the 16-column contract exactly.
2. A completed weighted set round-trips: build CSV → `parseFitNotesCSV` →
   `buildWorkoutLogs` → same exercise/reps/weight/completion (the design
   doc calls this "a free acceptance test", §3b).
3. Empty-string columns for the five no-equivalent fields.
4. Field escaping: exercise name containing a comma and a quote.
5. Interval/duration sets: `Time` populated, `Reps`/`Weight` empty.
6. Incomplete sets export with `Status` ≠ "Done" and do not resurrect as
   completed on re-import.

**Verification**: `pnpm test` → all pass including the 6 new cases.

## Done criteria

- [ ] `npx tsc --noEmit`, `npx tsc --noEmit -p convex` exit 0; lint 0
- [ ] `pnpm test` passes; round-trip test (case 2) exists and passes
- [ ] Size guard returns `too_large` without assembling the payload
- [ ] Settings row present between Import and Reset, with a11y + loading state
- [ ] `export_initiated` fires with `{format, scopes}` and no payload data
- [ ] No new dependencies in `package.json` (`git diff package.json` → empty)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated; report states "needs Convex deploy"

## STOP conditions

Stop and report back (do not improvise) if:

- `docs/design/data-export.md` has changed since `4c29928` (a later
  decision may supersede this plan's transport choice).
- The importer's column handling contradicts the doc (e.g. `Status` check
  isn't `"Done"` at the cited line) — the round-trip contract is the spec;
  report the discrepancy.
- The action return-size limit bites below the 800 KB guard in practice
  (Convex errors on return) — halve the guard and report; do not paginate
  (that's Phase 2's cursor design).
- Anything requires a new dependency.

## Maintenance notes

- Phase 2 (full JSON export, scope picker, `expo-file-system` transport) is
  specced in the same design doc §9 and still needs the operator's §8 Q1
  answer; this plan's `exportActions.ts` is its intended home — extend,
  don't rewrite.
- The §8 open questions Q2–Q6 (chat opt-in default, rate limit, privacy
  label, CSV column gaps, Art. 9 scope) were deliberately NOT resolved
  here; only Q1 is resolved, and only for Phase 1's CSV.
- Reviewer scrutiny: the size guard ordering (count before assemble), CSV
  escaping, and that the export contains only the authed user's rows
  (index scans keyed by `userId` — same discipline as every query in
  `convex/`).

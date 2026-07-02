# Plan 046: Characterize lib/plan-dates.ts (week-start and DST-sensitive date math)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- lib/plan-dates.ts`
> If the file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (tests only — no source change)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

`lib/plan-dates.ts` maps a plan's `(week, dayOfWeek)` grid onto calendar
dates using local-midnight parsing, `setDate` arithmetic, and a
monday/sunday week-start offset. Its output drives which template shows on
"today", plan-day notifications timing, and — via
`collectPlanRestDates` in `lib/streaks.ts:194-207` — whether rest days
bridge a user's streak. A regression (week-start swap, off-by-one in the
offset wrap, DST drift) silently shifts every plan day for every user.
The module is 67 lines of pure functions with zero tests, in a repo whose
test stack (Vitest over `lib/**`) exists precisely for this shape of risk.
This plan pins current behavior. **No source changes** — if testing exposes
a bug, it gets pinned with a commented characterization and reported, per
the repo's characterization convention.

## Current state

- `lib/plan-dates.ts` (whole file, 67 lines):
  - `getPlanDayDate(startDate, week, dayOfWeek, weekStartDay): Date`
    (lines 10-27):

    ```ts
    const start = new Date(startDate + 'T00:00:00');   // local midnight
    const weekStartDow = weekStartDay === 'monday' ? 1 : 0;
    let dayOffset = dayOfWeek - weekStartDow;
    if (dayOffset < 0) dayOffset += 7;
    const totalDays = (week - 1) * 7 + dayOffset;
    const date = new Date(start);
    date.setDate(date.getDate() + totalDays);
    ```

    `dayOfWeek` is JS convention 0=Sun..6=Sat; `startDate` "should be a
    Monday for monday-start users" (doc comment).
  - `isToday(date)` / `isTomorrow(date)` / `isPast(date)` (lines 30-55) —
    local-time comparisons built on `new Date()`.
  - `formatPlanDate(date)` (lines 63-66) — "Mon, Feb 24" style.
- Consumers (context only, unchanged): `app/plan/[id].tsx:17`,
  `lib/streaks.ts:194-207` (`collectPlanRestDates`), notification
  scheduling paths.
- Test conventions: `lib/<name>.test.ts`, explicit Vitest imports
  (`import { describe, it, expect, vi } from "vitest"`), node environment,
  model after `lib/streaks.test.ts` (characterization comments; helper
  builders; day strings treated as opaque labels).
- Vitest fake-timer API available: `vi.useFakeTimers()` /
  `vi.setSystemTime(new Date(...))` / `vi.useRealTimers()` — needed for the
  `isToday`/`isTomorrow`/`isPast` family since they call `new Date()`
  internally.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| This file's tests | `pnpm test -- lib/plan-dates.test.ts` | exit 0 |
| Full suite | `pnpm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `lib/plan-dates.test.ts` (create — the only file this plan touches)

**Out of scope** (do NOT touch):
- `lib/plan-dates.ts` — even if a test exposes an oddity; pin + comment +
  report instead.
- `lib/streaks.ts`, notification code, plan screens.

## Git workflow

- Branch: `advisor/046-plan-dates-tests`
- Commit style: `test(plan-dates): characterize week-start + DST date math`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `getPlanDayDate` characterization

Create `lib/plan-dates.test.ts`. Assert on local Y/M/D of the returned Date
(`d.getFullYear()/getMonth()/getDate()`), never on ISO strings (they'd be
timezone-dependent). Cases:

1. Monday start, monday-start user: `("2026-06-01" /* a Monday */, week 1, dayOfWeek 1)` → Jun 1; `dayOfWeek 0` (Sunday) → Jun 7 (wraps to END of the week — the `dayOffset += 7` branch).
2. Same but sunday-start user with a Sunday `startDate` ("2026-06-07"): `dayOfWeek 0` → Jun 7 (offset 0); `dayOfWeek 6` → Jun 13.
3. Week arithmetic: week 3, monday-start, `dayOfWeek 3` → start + 14 + 2 days.
4. **DST spring-forward**: a `startDate` before a DST jump with a target day
   after it (pick dates around the late-March European transition, e.g.
   start "2026-03-23", week 2 — 2026-03-29 is the EU spring-forward). Assert
   the local calendar date is still the expected one (`setDate` is
   DST-safe; this test pins that).
5. **DST fall-back**: same shape around late October 2026.
6. Mismatched-start oddity (characterization): a monday-start user whose
   `startDate` is NOT a Monday (e.g. a Wednesday) — pin whatever comes out,
   with a comment that this documents current behavior for malformed input,
   not an endorsement.

### Step 2: `isToday` / `isTomorrow` / `isPast` under fake timers

Wrap in `beforeEach`/`afterEach` with `vi.useFakeTimers()` +
`vi.setSystemTime(...)` / `vi.useRealTimers()`. Cases:

7. System time 2026-06-10T15:00 local: same-day date → `isToday` true,
   `isTomorrow` false, `isPast` false.
8. 2026-06-11 → `isTomorrow` true. 2026-06-09 → `isPast` true.
9. Month boundary: system time Jun 30 → Jul 1 `isTomorrow` true.
10. `isPast` same-day-earlier-hour → false (comparison is date-level:
    `date < today-at-midnight`); pin it.
11. Year boundary: Dec 31 → Jan 1 `isTomorrow` true.

### Step 3: `formatPlanDate`

12. A known date → exact string (e.g. `new Date(2026, 1, 24)` →
    `"Tue, Feb 24"` — compute the real weekday, don't guess).

**Verify (all steps)**: `pnpm test -- lib/plan-dates.test.ts` → ≥12 pass;
`pnpm test` → full suite green; `npx tsc --noEmit` → 0; `pnpm lint` → 0.

## Test plan

This plan IS the test plan (≥12 cases above). Structural model:
`lib/streaks.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `lib/plan-dates.test.ts` exists with ≥12 tests; `pnpm test` exits 0
- [ ] `git diff --stat -- lib/plan-dates.ts` → empty (source untouched)
- [ ] `npx tsc --noEmit`, `pnpm lint` exit 0
- [ ] `git status` shows only the new test file
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A DST case fails in a way that reveals `getPlanDayDate` returns the WRONG
  calendar day (not just a different hour) — that's a real bug; pin the
  current output with a `// BUG(characterized):` comment AND report it
  prominently rather than fixing.
- Tests behave differently on your machine's timezone vs CI (pure local-time
  code should not, but if a case is TZ-dependent, set `TZ` explicitly via
  the test file's comment and report the dependence).

## Maintenance notes

- Anyone changing week-start behavior or plan-day scheduling now breaks a
  named test instead of shifting users' plans silently.
- If case 6 (malformed start date) pins something ugly, that's the intended
  signal for a future validation fix — the test comment marks it.
- Reviewer: check assertions use local getters (not `toISOString`) so CI
  (UTC) and laptops (any TZ) agree.

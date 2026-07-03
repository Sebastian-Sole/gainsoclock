# Plan 048: Extract and test the notification scheduling decisions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- lib/notifications.ts`
> If the file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MED (pure extraction; behavior must be bit-identical)
- **Depends on**: none
- **Category**: tests + tech-debt
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

`lib/notifications.ts` mixes pure scheduling *decisions* (should the daily
reminder fire today or tomorrow? should the protein nudge be skipped? what's
the seconds-until-target?) with impure `expo-notifications` calls. The
decisions encode date-boundary logic that fails silently when wrong (a
reminder double-fires, a nudge lands after the user already hit their
protein target, a weekday clamp shifts) and none of it is testable today
because it's welded to the native module. The repo's test stack (Vitest
over pure `lib/**`) exists for exactly this; the fix is the established
extract-to-lib pattern: pull the decision functions into a pure module,
have `lib/notifications.ts` call them, and pin them with tests.

## Current state

- `lib/notifications.ts` — read the whole file before starting. The three
  decision knots this plan extracts:

  1. **Daily reminder today-vs-tomorrow** (lines ~185-221): if the user
     already logged a workout today AND the reminder time hasn't passed yet,
     schedule a one-shot for tomorrow at (hour, minute) via TIME_INTERVAL
     seconds; otherwise schedule a repeating DAILY trigger:

     ```ts
     const todayStr = format(now, "yyyy-MM-dd");
     const reminderToday = new Date(now);
     reminderToday.setHours(hour, minute, 0, 0);
     if (lastWorkoutLoggedDate === todayStr && now < reminderToday) {
       const tomorrow = new Date(now);
       tomorrow.setDate(tomorrow.getDate() + 1);
       tomorrow.setHours(hour, minute, 0, 0);
       // ... TIME_INTERVAL trigger with
       // seconds: Math.max(1, Math.floor((tomorrow.getTime() - now.getTime()) / 1000))
       return;
     }
     // ... DAILY trigger { hour, minute }
     ```

  2. **Protein nudge skip decision** (lines ~389-411):

     ```ts
     const remaining = Math.round(proteinGoal - proteinConsumedToday);
     const shouldSkip =
       !notificationsProteinNudgeEnabled ||
       !Number.isFinite(hour) || !Number.isFinite(minute) ||
       proteinGoal <= 0 || remaining <= 0 ||
       target.getTime() <= now.getTime();
     // cancel-first semantics, then skip / ensureGranted / schedule with
     // secondsUntil = Math.max(1, Math.floor((target - now) / 1000))
     ```

  3. **Weekday clamp** (~line 328): a weekly-review-related weekday
     computation — read it in place and extract whatever pure decision it
     contains (the audit flagged it; characterize what's actually there).

- The store reads (`useSettingsStore.getState()` etc.) happen in the impure
  wrappers — they stay there; extracted functions take plain arguments.
- Conventions: pure modules in `lib/<topic>.ts`, one topic per file;
  explicit-import Vitest tests in `lib/<topic>.test.ts`; exemplar structure
  `lib/streaks.test.ts`; fake timers NOT needed if the pure functions take
  `now: Date` as a parameter (prefer that over `vi.setSystemTime` — it also
  makes the wrappers honest about their single impure input).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test -- lib/notification-rules.test.ts` | exit 0 |
| Full suite | `pnpm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `lib/notification-rules.ts` (create — pure decisions only, zero imports
  from expo modules or stores)
- `lib/notification-rules.test.ts` (create)
- `lib/notifications.ts` (rewire the three sites to call the pure functions
  — no behavior change)

**Out of scope** (do NOT touch):
- Notification content/copy, identifiers, permission handling
  (`ensureGranted`), the cancel-first semantics (they stay in the wrapper,
  ordered exactly as today).
- `expo-notifications` usage patterns, `app.json` notification config.
- Any consumer of `lib/notifications.ts`.

## Git workflow

- Branch: `advisor/048-notification-rules`
- Commits: `refactor(notifications): extract pure scheduling decisions`,
  `test(notifications): characterize reminder + nudge decisions`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract

Create `lib/notification-rules.ts` with (signatures indicative — mirror the
data actually used):

```ts
export type DailyReminderPlan =
  | { kind: 'one-shot-tomorrow'; seconds: number }
  | { kind: 'repeating-daily' };
export function planDailyReminder(args: {
  now: Date; hour: number; minute: number;
  lastWorkoutLoggedDate: string | null | undefined;
}): DailyReminderPlan

export type ProteinNudgeDecision =
  | { kind: 'skip' }
  | { kind: 'schedule'; secondsUntil: number };
export function decideProteinNudge(args: {
  now: Date; target: Date; enabled: boolean;
  hour: number; minute: number;
  proteinGoal: number; proteinConsumedToday: number;
}): ProteinNudgeDecision
```

…plus whatever pure function the weekday clamp at ~line 328 yields. Bodies
are the excerpts above, verbatim logic (same `Math.round`, same `<=`
comparisons, same `Math.max(1, ...)` floors). Then rewire
`lib/notifications.ts`: compute `now`/`target` where it does today, call
the pure function, branch on the result. Cancel-first ordering and
`ensureGranted` placement must not move.

**Verify**: `npx tsc --noEmit` → 0; `pnpm lint` → 0; a manual diff read
confirms the wrapper's observable sequence (cancel → skip-check → permission
→ schedule) is unchanged.

### Step 2: Characterize

`lib/notification-rules.test.ts`, ≥12 cases:

- `planDailyReminder`: logged today + before reminder time → one-shot with
  correct seconds (assert exact integer for a fixed `now`); logged today +
  after reminder time → repeating; not logged today → repeating; logged
  YESTERDAY (string mismatch) → repeating; midnight edge — `now` at 23:59
  logged-today with reminder 23:58 → repeating (time passed); seconds floor
  ≥1.
- `decideProteinNudge`: disabled → skip; goal 0 / negative → skip;
  remaining 0 (goal exactly met) → skip; remaining rounds to 0 (e.g. goal
  100, consumed 99.6 → `Math.round(0.4)=0`) → skip — pin the rounding
  boundary; target in the past → skip; happy path → schedule with exact
  `secondsUntil`; NaN hour → skip.
- Weekday-clamp function: whatever it is, ≥2 cases pinning its boundaries.

**Verify**: `pnpm test -- lib/notification-rules.test.ts` → all pass;
`pnpm test` → 0.

## Test plan

Step 2 is the test plan. Pattern exemplar: `lib/streaks.test.ts`. All
functions take `now`/`target` as parameters — no fake timers needed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `lib/notification-rules.ts` exists and imports NOTHING from `expo-*` or `stores/` — check the import lines: `grep -n "^import" lib/notification-rules.ts` shows no expo/stores specifiers. *(Amended 2026-07-02: the original substring grep matched the word `export` and was unsatisfiable — executor caught it.)*
- [ ] `lib/notifications.ts` calls `planDailyReminder` and `decideProteinNudge` (`grep -c` → ≥1 each)
- [ ] ≥12 tests in `lib/notification-rules.test.ts`; `pnpm test` exits 0
- [ ] `npx tsc --noEmit`, `pnpm lint` exit 0
- [ ] `git status` shows only the three in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Rewiring forces changing WHEN the wrapper reads store state or calls
  `cancel*` (ordering is behavior; the extraction must not move it).
- The weekday clamp at ~line 328 turns out to be entangled with async state
  in a way that can't be pulled pure without behavior risk — extract the
  other two, skip it, and report.
- Characterization exposes a decision that contradicts the function's
  intent (e.g. nudge scheduled after target time) — pin with a
  `// BUG(characterized):` comment and report; do not fix in this plan.

## Maintenance notes

- Future notification features should put their decision logic in
  `lib/notification-rules.ts` from the start — the wrapper stays a thin
  impure shell.
- Reviewer: the extraction diff should show *moved* expressions, not
  rewritten ones — any "improvement" in the move is a red flag.
- Deferred: same treatment for the weekly-review notification copy timing
  if DIR-03 (proactive weekly review) is built later.

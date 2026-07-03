# Plan 051: Put the streak to work — streak-risk notification + landing-screen status strip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- lib/notifications.ts lib/notification-rules.ts hooks/use-notification-setup.ts app/\(tabs\)/index.tsx components/home stores/settings-store.ts app/settings/notifications.tsx hooks/use-stats.ts hooks/use-achievements.ts`
> **Known planned drift**: PR #91 (plan 048) creates `lib/notification-rules.ts`
> (pure scheduling decisions) and rewires `lib/notifications.ts` to call it;
> PR #86 (plan 038) rewires achievement internals but keeps the
> `useAchievements()` hook API byte-identical. Steps below account for both.
> Any other mismatch with "Current state" is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED — new notification type (opt-out risk if noisy) + a new
  card on the most-visited screen (density risk). No data-model changes.
- **Depends on**: 049 (soft — if you add analytics events, rebase on it).
  Merge AFTER PRs #86 and #91 land to avoid conflicts in
  `lib/notifications.ts` and achievement internals.
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

The streak is the app's strongest daily-return lever, but it does no work:
the "train today to keep your N-day streak" warning exists only as small
text inside the Stats tab (`components/stats/streaks-section.tsx:40-44`),
which a user must already have opened the app to see. The notification
catalog (`lib/notifications.ts:9-16`) has six task-oriented types — none
fire for a streak about to break. And the landing tab (`app/(tabs)/index.tsx`,
the Workouts screen) renders templates and plan cards but has zero streak,
achievement, or weekly-review presence (grep-verified). This plan adds
(1) a local streak-risk notification that fires in the evening only when an
active streak would break, and (2) a compact status strip on the landing
screen composing values that are already computed.

## Current state

- **Notification identifiers** (`lib/notifications.ts:9-16`):

  ```ts
  export const IDENTIFIERS = {
    REST_TIMER: "rest-timer",
    POST_WORKOUT: "post-workout",
    DAILY_REMINDER: "daily-reminder",
    MORNING_PLAN: "morning-plan",
    WEEKLY_REVIEW: "weekly-review",
    PROTEIN_NUDGE: "protein-nudge",
  } as const;
  ```

- **Scheduling pattern to copy** — `scheduleDailyWorkoutReminder`
  (`lib/notifications.ts:170-222`): reads its enable flag from
  `useSettingsStore.getState()`, early-returns if disabled, awaits
  `ensureGranted()`, cancels its own identifier first, then
  `Notifications.scheduleNotificationAsync({ identifier, content, trigger })`.
  One-shot triggers use `SchedulableTriggerInputTypes.TIME_INTERVAL` with
  computed seconds (see lines 194–206); the weekly-review scheduler
  (lines 316–352) shows the cancel-before-early-return refinement and the
  `data: { url: "/review" }` deep-link payload, routed by the response
  listener in `hooks/use-notification-setup.ts:100-107`.
- **Workout-completed chokepoint**: `app/workout/active.tsx:282` calls
  `rescheduleReminderAfterWorkout();` — the same place must cancel a pending
  streak-risk notification.
- **Streak values** — `hooks/use-stats.ts:75-82` returns
  `streaks: { currentStreak, longestStreak, ..., todayCovered }` computed by
  `lib/streaks.ts` (`computeStreak`; planned-rest days are neutral, any
  other missed day resets — see `lib/streaks.ts:178`). `todayCovered ===
  false` with `currentStreak > 0` is exactly the at-risk condition, and is
  the same condition Stats renders the warning on
  (`components/stats/streaks-section.tsx:40`).
- **Settings toggles pattern** — per-type booleans + times live in
  `stores/settings-store.ts` (e.g. `notificationsReminderEnabled`,
  `notificationsReminderTime`) and are edited in
  `app/settings/notifications.tsx`. NOTE (`stores/settings-store.ts:220-235`):
  weekly-review and protein-nudge setters deliberately do NOT call
  `syncSettings` because `api.settings.upsert` doesn't accept those fields;
  sending unknown args breaks ALL settings sync. **Follow that local-only
  pattern for the new toggle** (plan 052 does the validator extension).
- **Landing screen** — `app/(tabs)/index.tsx` (WorkoutsScreen). Already
  composes cards above the template list: `MissedDayBanner`,
  `HealthKitReaskCard` (`components/home/healthkit-reask-card.tsx`),
  `TrialConfirmationBanner` (`components/home/trial-confirmation-banner.tsx`)
  — new home cards belong in `components/home/`. It already computes
  `todayPlanDay` from the plan store (lines ~44–54).
- **Achievements** — `hooks/use-achievements.ts` returns
  `{ groups, unlocked, newlyUnlocked }` (line 261). `groups` carries
  progress data the achievements screen renders as progress bars; the
  consumer exemplar is `components/stats/records-section.tsx:59` (routes to
  `/achievements`). PR #86 keeps this hook's API identical.
- **Weekly review presence** — `components/review/weekly-review-entry-card.tsx`
  already exists (used in Stats' overview tab) and reads
  `api.weeklyReview.getReview` — reuse it or its query pattern for the
  "review ready" chip.
- Conventions: theme tokens + `cn()`; `accessibilityLabel` +
  `accessibilityRole` on every Pressable; haptics via `lib/haptics.ts`;
  44pt touch targets.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass (incl. new rules tests) |

## Scope

**In scope**:
- `lib/notifications.ts` (new `STREAK_RISK` identifier + schedule/cancel fns)
- `lib/notification-rules.ts` + `lib/notification-rules.test.ts` (pure
  decision fn — if PR #91 landed; otherwise create the decision as a pure
  exported helper in `lib/notifications.ts` and note it)
- `stores/settings-store.ts` (new `notificationsStreakRiskEnabled` +
  `notificationsStreakRiskTime`, local-only setters)
- `app/settings/notifications.tsx` (toggle row, following an existing row)
- `hooks/use-notification-setup.ts` (subscribe pattern, like lines 44–95)
- `app/workout/active.tsx` (cancel call next to line 282 — one line)
- `app/(tabs)/index.tsx` (mount the strip)
- `components/home/status-strip.tsx` (create)

**Out of scope** (do NOT touch):
- `lib/streaks.ts` — no change to streak semantics. A streak-freeze /
  recovery mechanic was considered and deliberately left as an open design
  question (see Maintenance notes).
- Server push infrastructure, `convex/` — this is a LOCAL notification.
- The Stats tab and `components/stats/*` — the strip supplements, not moves,
  the existing sections.
- An achievement-unlock notification — rejected for now: local-only
  notifications can only fire while scheduling code runs (app open), where
  the existing unlock toast already covers the moment.

## Git workflow

- Branch: `advisor/051-daily-retention-loop`
- Commits: one per step-cluster (notification, settings/UI, strip).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure decision function

If `lib/notification-rules.ts` exists (post-PR #91), add:

```ts
export type StreakRiskDecision =
  | { schedule: false }
  | { schedule: true; secondsFromNow: number; streakLength: number };

export function decideStreakRisk(args: {
  enabled: boolean;
  currentStreak: number;
  todayCovered: boolean;
  now: Date;            // local time
  fireHour: number;     // from settings, default 18
  fireMinute: number;
}): StreakRiskDecision
```

Rules: no schedule when disabled, streak 0, today already covered, or the
fire time has already passed today (never fire after midnight — the streak
is already broken). Zero imports from expo modules or stores (that's the
048 contract). If the file doesn't exist, export the same pure function
from `lib/notifications.ts` and say so in your report.

**Verify**: `pnpm test -- notification-rules` → new tests pass (write them
in the same step — see Test plan).

### Step 2: Scheduler + cancel in `lib/notifications.ts`

Add `STREAK_RISK: "streak-risk"` to `IDENTIFIERS`. Add
`recomputeStreakRiskNotification(streaks: { currentStreak: number; todayCovered: boolean })`
following the `scheduleWeeklyReviewNotification` structure exactly
(cancel own identifier first → read enable flag + time from
`useSettingsStore.getState()` → call `decideStreakRisk` → `ensureGranted()`
→ schedule a TIME_INTERVAL one-shot). Content:
title `"Your streak is on the line 🔥"`, body
`` `Train today to keep your ${streakLength}-day streak alive.` ``,
`data: { url: "/(tabs)" }`. Add `cancelStreakRiskNotification()` mirroring
the other cancel fns.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Settings state + UI

- `stores/settings-store.ts`: add `notificationsStreakRiskEnabled`
  (default `false` — opt-in for existing users; flipping the default is an
  operator call) and `notificationsStreakRiskTime` (default `"18:00"`),
  with local-only setters placed next to the weekly-review block
  (lines 220–235) and the same "not synced yet" comment.
- `app/settings/notifications.tsx`: add a "Streak reminder" row with toggle
  + time picker, cloning the daily-reminder row's structure and a11y props.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors.

### Step 4: Arm and disarm

- `hooks/use-notification-setup.ts`: add a settings-subscription effect
  cloned from the weekly-review one (lines 68–95) that recomputes the
  streak-risk notification when its settings change. Recomputing also needs
  current streak values: read them the same way the app does today —
  compute on app foreground in the hook that owns this (if `use-stats` is
  render-scoped, compute via its underlying `lib/streaks.ts` inputs from
  the history store; keep it cheap and outside render).
- `app/workout/active.tsx`: next to `rescheduleReminderAfterWorkout()`
  (line 282), call `cancelStreakRiskNotification()` — logging a workout
  defuses the warning; the next foreground/arm pass reschedules if needed.

**Verify**: `npx tsc --noEmit` → exit 0;
`grep -n "cancelStreakRiskNotification" app/workout/active.tsx` → 1 match.

### Step 5: Status strip on the landing screen

Create `components/home/status-strip.tsx`: a single compact card (follow
`components/home/trial-confirmation-banner.tsx` for structure/styling) with
three horizontally arranged elements:

1. **Streak**: flame icon + `currentStreak` days; when
   `todayCovered === false && currentStreak > 0`, highlight with the same
   "train today to keep it" urgency copy as Stats (source of truth:
   `components/stats/streaks-section.tsx:40-44`). Tapping routes to the
   Stats tab.
2. **Next achievement**: the locked achievement with the highest progress
   from `useAchievements().groups`; render name + progress; tap →
   `/achievements` (route exemplar `components/stats/records-section.tsx:59`).
3. **Review chip**: only when `api.weeklyReview.getReview` for the current
   week returns a row (reuse the query usage in
   `components/review/weekly-review-entry-card.tsx`); tap → `/review`.

Render it in `app/(tabs)/index.tsx` directly above the templates list,
below the existing banners. Hide the strip entirely for a brand-new account
(no workouts logged, no unlocks, no review) — an empty strip is noise.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors;
`grep -n "StatusStrip" "app/(tabs)/index.tsx"` → 1 match.

## Test plan

- `lib/notification-rules.test.ts` (or the equivalent if 048 hasn't
  landed): table-driven tests for `decideStreakRisk` — disabled, zero
  streak, covered day, fire-time already passed, normal evening case
  (assert computed `secondsFromNow` within tolerance), and midnight
  boundary (23:59 vs 00:01). Model on the existing tests in `lib/*.test.ts`
  (plan 048's file if present, else `lib/plan-dates.test.ts` for the
  table-driven style).
- No component tests (settled decision, `docs/decisions/test-runner.md`).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0; `pnpm lint` 0 errors
- [ ] `pnpm test` exits 0 with ≥5 new `decideStreakRisk` cases
- [ ] `IDENTIFIERS.STREAK_RISK` exists; schedule + cancel functions exported
- [ ] Settings row present; store fields are local-only (no `syncSettings` call — grep the new setters)
- [ ] Workout completion cancels the pending streak-risk notification
- [ ] `components/home/status-strip.tsx` rendered from the landing tab; hidden for empty accounts
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `useAchievements()` no longer returns `groups` with per-achievement
  progress (post-#86 drift beyond its stated API stability).
- Computing streak values outside render requires more than the history
  store + `lib/streaks.ts` (e.g. it would need new Convex queries).
- The settings-sync situation changed (the store comment at
  `stores/settings-store.ts:220-235` is gone) — coordinate with plan 052
  instead of picking a sync behavior yourself.
- Adding the strip to `app/(tabs)/index.tsx` requires restructuring its
  FlatList/header composition beyond inserting one component.

## Maintenance notes

- **Streak freeze** (open design question, deliberately not built): one
  missed day still wipes any streak (`lib/streaks.ts:178`), and the
  Streaker achievement family climbs to 100 days — an unrecoverable reset
  at high investment is a churn moment. If the operator wants a
  freeze/repair mechanic later, it belongs in `computeStreak`'s rest-day
  neutrality path, and it must NOT silently inflate Streaker unlocks.
- Plan 052 extends `api.settings.upsert` — when it lands, the new
  streak-risk settings fields should be added to the synced set alongside
  weekly-review/protein-nudge.
- If analytics events are wanted for the strip taps and the notification
  (recommended once 049 lands): `notification_opened` already covers the
  tap via the identifier; strip taps can use `activation_gate_${string}`.
- Reviewer scrutiny: no ref mutation during render (React Compiler), the
  strip's empty-state hiding, and that the one-shot never fires after
  midnight.

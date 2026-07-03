# Plan 049: Instrument the core retention loop in PostHog

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- lib/analytics.ts app/workout/active.tsx stores/meal-log-store.ts hooks/use-notification-setup.ts app/review/index.tsx hooks/use-achievements.ts lib/achievement-engine.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. **Known planned drift**: PR #86
> (plan 038) moves achievement unlock detection from
> `hooks/use-achievements.ts` into a new `lib/achievement-engine.ts`. Step 5
> has instructions for both states.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but see conflict notes — 050/051/056 add events to the
  same union; merge this first)
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

The analytics event union (`lib/analytics.ts`) ends at the paywall: intake,
HealthKit consent, paywall, trial, `paid_converted`. There is not a single
event for the core loop — no `workout_logged`, `meal_logged`,
`achievement_unlocked`, `notification_opened`, or `review_opened`. The
operator cannot answer "does the streak drive return visits?", "do
notification taps convert to workouts?", or "which features correlate with
retention?" — and every retention/conversion feature planned in this cycle
(plans 050–056) would ship blind. This plan adds ~6 events at existing
chokepoints. It is measurement only: no UI change, no behavior change.

## Current state

- `lib/analytics.ts` — the PostHog wrapper. All components call `capture()`
  from here; `posthog-react-native` is imported nowhere else. It enforces a
  consent gate, a pre-consent buffer, and a **HealthKit firewall**: the
  `ForbiddenKeys` type + `FORBIDDEN_KEY_SET` runtime scan (lines 111–140)
  reject props named `weightKg`, `caloriesBurned`, `workoutDurationSec`,
  `restingHeartRate`, etc. New events must not use forbidden key names.
- The event union (lines 19–102) is a discriminated union ending with:

  ```ts
  // lib/analytics.ts:102
  | { name: `activation_gate_${string}`; props: Record<string, never> };
  ```

  Every event is `{ name: "..."; props: {...} }`. Match this shape exactly.
- Capture call-site exemplar (`app/onboarding/paywall.tsx:119-122`):

  ```ts
  capture({
    name: 'paywall_presented',
    props: { placementId: 'onboarding_default' },
  });
  ```

- Chokepoints where the new events go:
  - **Workout completed**: `app/workout/active.tsx:282` calls
    `rescheduleReminderAfterWorkout();` inside the finish handler. This is
    the single place a workout log is finalized.
  - **Meal logged**: `stores/meal-log-store.ts:78` —
    `syncToConvex(api.mealLogs.logMeal, {...})` inside the store's add
    action (`recomputeProteinNudgeFromStore()` is called at lines 89/99/146
    in the same actions). Stores are plain TS modules — `capture` imports
    fine outside React.
  - **Achievement unlocked**: at commit `4c29928`,
    `hooks/use-achievements.ts:241-250` computes `newly` (newly unlocked
    achievements) and appends to `newlyUnlocked`. After PR #86 merges, the
    equivalent site is the unlock-detection step in
    `lib/achievement-engine.ts`. Instrument whichever exists.
  - **Notification tapped**: `hooks/use-notification-setup.ts:100-107` —
    `handleResponse` reads `response.notification.request.content.data?.url`
    and routes. The notification identifier is available at
    `response.notification.request.identifier`.
  - **Review opened**: `app/review/index.tsx` — the screen that calls
    `api.weeklyReview.getReview` (line 43) and `generateReview` (line 46).
- Consent behavior to preserve: `capture()` silently drops events until the
  user grants analytics consent unless the event name is in
  `PRE_CONSENT_BUFFERABLE` (lines 159–182). **Do NOT add the new events to
  the bufferable set** — core-loop events from a non-consented user must be
  dropped, not buffered.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope** (the only files you should modify):
- `lib/analytics.ts` (extend the event union only)
- `app/workout/active.tsx` (one `capture` call)
- `stores/meal-log-store.ts` (one `capture` call per add path)
- `hooks/use-notification-setup.ts` (one `capture` call)
- `app/review/index.tsx` (one `capture` call)
- `hooks/use-achievements.ts` **or** `lib/achievement-engine.ts` (one
  `capture` call — whichever holds unlock detection; see drift note)

**Out of scope** (do NOT touch, even though they look related):
- `FORBIDDEN_KEY_SET` / `ForbiddenKeys` / `PRE_CONSENT_BUFFERABLE` in
  `lib/analytics.ts` — the firewall and buffer policy are settled.
- `convex/posthogServer.ts` and any server-side event — client loop only.
- Session-replay allowlist (`REPLAY_ALLOWLIST`) — no route changes here.
- Any UI component.

## Git workflow

- Branch: `advisor/049-core-loop-analytics`
- Commit style: imperative, ≤72-char subject (e.g.
  `feat(analytics): instrument core retention loop events`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend the event union

In `lib/analytics.ts`, add to the `AnalyticsEvent` union (before the
`activation_gate_${string}` line, matching the existing style):

```ts
| { name: "workout_logged"; props: { exerciseCount: number; setCount: number; fromTemplate: boolean } }
| { name: "meal_logged"; props: { method: "manual" | "ai_chat" | "photo" | "barcode" | "recipe" } }
| { name: "achievement_unlocked"; props: { achievementId: string } }
| { name: "notification_opened"; props: { identifier: string } }
| { name: "review_opened"; props: { hadExistingReview: boolean } }
```

If a prop listed here is not cheaply available at the call site, drop the
prop (use `Record<string, never>`) rather than plumbing new state — the
event itself is the payload that matters. Never add a prop whose key is in
`FORBIDDEN_KEY_SET` (no durations, calories, weights, heart rates).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Workout completed

In `app/workout/active.tsx`, at the finish handler where
`rescheduleReminderAfterWorkout();` is called (line 282 at plan time), add a
`capture({ name: "workout_logged", ... })` call with counts taken from the
workout being finalized (the active workout object in scope there). Import
`capture` from `@/lib/analytics`.

**Verify**: `npx tsc --noEmit` → exit 0; `grep -n "workout_logged" app/workout/active.tsx` → 1 match.

### Step 3: Meal logged

In `stores/meal-log-store.ts`, in each store action that performs
`syncToConvex(api.mealLogs.logMeal, ...)` (line 78 region at plan time),
add `capture({ name: "meal_logged", props: { method: ... } })`. Determine
`method` from what the action knows; if the store cannot distinguish the
entry method, use a single `"manual"` literal and record that limitation in
your report rather than threading a new parameter through callers.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Notification tapped + review opened

- `hooks/use-notification-setup.ts` — inside `handleResponse` (line 100),
  before routing:
  `capture({ name: "notification_opened", props: { identifier: response.notification.request.identifier } })`.
- `app/review/index.tsx` — in a mount effect (or alongside the existing
  first-load logic near line 43), fire `review_opened` once per mount with
  `hadExistingReview: <getReview result != null>`. Guard with a `useRef` so
  re-renders don't re-fire.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors.

### Step 5: Achievement unlocked

Check which file holds unlock detection:
`grep -l "newlyUnlocked" hooks/use-achievements.ts lib/achievement-engine.ts 2>/dev/null`.
In the file that computes the *newly unlocked* list (at `4c29928`:
`hooks/use-achievements.ts:241-250`), fire one
`capture({ name: "achievement_unlocked", props: { achievementId } })` per
newly unlocked achievement, at the point the unlock is first detected (not
where the toast renders).

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm test` → all pass.

## Test plan

`lib/analytics.ts` already has type-level and unit coverage patterns from
plan 025 (look for `lib/analytics.test.ts` or similar via
`ls lib/*.test.ts`). Add one unit test there asserting the new event names
pass the runtime forbidden-key scan (call `capture` with a stubbed client
via `setPostHogClient` and `setAnalyticsConsent(true)`, assert the stub
received the event). If no analytics test file exists, add
`lib/analytics.core-loop.test.ts` modeled on any existing `lib/*.test.ts`.
Component-level tests are out of scope per `docs/decisions/test-runner.md`.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0, including ≥1 new analytics test
- [ ] `grep -rn "workout_logged\|meal_logged\|achievement_unlocked\|notification_opened\|review_opened" app stores hooks lib --include="*.ts*" | grep -v test | grep capture` shows ≥5 call sites
- [ ] New events are NOT in `PRE_CONSENT_BUFFERABLE`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `lib/analytics.ts` no longer has the `AnalyticsEvent` union shape shown
  above (drift).
- Neither `hooks/use-achievements.ts` nor `lib/achievement-engine.ts`
  contains a newly-unlocked computation (post-038 architecture differs from
  what plan 038 specified).
- Adding a capture site would require passing new props through more than
  one component/store layer — report the site instead of refactoring.

## Maintenance notes

- Plans 050 (`paywall` events), 051 (streak notification), and 056
  (`export_initiated`) each add further events to this union — they should
  rebase on this change; merge 049 first.
- Reviewer should check: no forbidden-key props, no additions to the
  pre-consent buffer, `useRef` guard on the review-opened effect (React
  Compiler is on — no ref mutation during render).
- Follow-up explicitly deferred: `app_open` / session events (PostHog
  lifecycle capture is deliberately off — see `captureAppLifecycleEvents:
  false` in `initPostHog`) and any funnel dashboards in PostHog itself.

# Plan 052: Make the weekly review proactive — settings sync + Sunday pre-generation cron

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- convex/settings.ts convex/crons.ts convex/weeklyReview.ts stores/settings-store.ts convex/schema.ts`
> On any mismatch with the "Current state" excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: MED — extending `api.settings.upsert` wrongly can break ALL
  settings sync (see the store comment quoted below); the cron adds
  recurring OpenAI spend for Pro users. Both are mitigated in the steps.
- **Depends on**: none. **Convex deploy required after merge** (new
  validator fields + cron). Sequence merges with PRs #82/#87 (also Convex).
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

The weekly training review is fully built — stats computation, LLM
narrative for Pro users, a rule-based recommendation fallback for free
users, a review screen, an entry card, and even a weekly local notification
that deep-links to `/review`. But it is entirely *pull*: the review is
generated only when the user opens the screen (`app/review/index.tsx:67`
calls `generateReview` on demand), and the notification's copy is
necessarily generic ("Your weekly training review is ready 📊") because
nothing has been generated when it fires. Two gaps keep it reactive:
(1) the user's weekly-review day/time/opt-in never reach the server — the
settings-store setters deliberately skip sync because the Convex validator
doesn't accept the fields; (2) no cron pre-generates reviews. This plan
closes both: sync the preferences, then pre-generate each user's review on
their chosen schedule so the tap-through is instant and future surfaces
(email digest, home-screen chip in plan 051) have content to show.

## Current state

- `convex/weeklyReview.ts` — complete backend. `generateReview` action
  (line 667): 24h idempotency window (`REGENERATE_AFTER_MS`), computes
  stats via `buildWeekStats`, Pro check via
  `internal.subscriptions.checkSubscription` (line 687), OpenAI narrative
  for Pro / `ruleBasedRecommendation` for free (line 734), upserts via
  `internal.weeklyReview.upsertReview`. **Note**: `generateReview` reads
  `getAuthUserId(ctx)` — a cron cannot call it directly; the internals
  (`getWeekStatsForUser`, `getReviewForUser`, `upsertReview`) are already
  userId-parameterized internal functions.
- `convex/crons.ts` — four crons today (trial-reminder-48h, dcsa-6-monthly,
  rc-temp-demote, sweep-orphan-meal-photos). None touch weeklyReview.
- `convex/settings.ts` `upsert` (lines 18–37) — validator accepts unit,
  haptics, rest-timer, reminder, morning-plan, and `rpeEnabled` fields.
  It does NOT accept weekly-review or protein-nudge fields.
- `stores/settings-store.ts:220-235` — the deliberate sync gap:

  ```ts
  // Weekly review settings are persisted locally only for now —
  // api.settings.upsert does not accept these fields yet, and sending
  // unknown args would fail Convex validation and break all settings
  // sync. Add them to syncSettings + hydrateFromServer once the backend
  // validator includes them (Phase 2 integration).
  setNotificationsWeeklyReviewEnabled: (enabled) => {
    set({ notificationsWeeklyReviewEnabled: enabled });
  },
  ```

  The same comment-and-gap applies to protein-nudge setters
  (lines ~242–250). Find `syncSettings` and `hydrateFromServer` in the same
  file to see the exact field mapping to extend.
- `convex/schema.ts` `userSettings` table — fields mirror the validator;
  weekly-review/protein-nudge fields are absent there too (verify with
  `grep -n "userSettings" -A 30 convex/schema.ts`).
- Local notification (already shipped, do not break):
  `lib/notifications.ts:316-352` schedules a WEEKLY trigger from local
  settings; `hooks/use-notification-setup.ts:68-95` re-arms it on settings
  change; taps deep-link to `/review`.
- Cron scan exemplar — `convex/subscriptionCrons.ts:21-60`
  (`sendTrialReminders`): internalMutation, index scan, per-row guards,
  `ctx.scheduler.runAfter(0, internal.email.sendTrialReminder48h, {...})`
  fan-out. Copy this shape (scan → guard → schedule per-user work).
- Week-start convention: `weeklyReview.getReview` keys on a `weekStart`
  "YYYY-MM-DD" string; the review prompt says "Monday to Sunday"
  (`convex/weeklyReview.ts:563`). `components/review/review-dates.ts`
  holds the client's week-start computation — the cron must produce
  identical `weekStart` strings or the client query will miss the row.

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
- `convex/schema.ts` (userSettings: add optional weekly-review +
  protein-nudge + streak-risk notification fields)
- `convex/settings.ts` (extend `upsert` args with the same optional fields)
- `stores/settings-store.ts` (setters call `syncSettings`; extend
  `syncSettings` + `hydrateFromServer` mappings; delete the stale comments)
- `convex/weeklyReview.ts` (add `generateReviewForUserInternal` internal
  action + a scan entry point)
- `convex/crons.ts` (one new cron)

**Out of scope** (do NOT touch):
- Push-notification infrastructure (Expo push tokens, server-initiated
  push). Decision recorded here: NOT building push now — the local weekly
  notification already delivers the tap moment; pre-generation makes it
  land on real content. Revisit push only with operator sign-off.
- `app/review/index.tsx` and the review UI — the on-demand path keeps
  working unchanged (pre-generation just makes `getReview` hit).
- `lib/notifications.ts` — the local scheduler is fine as-is (and plan 051
  edits it; avoid the conflict).
- Email digest of the review — future option, not this plan.

## Git workflow

- Branch: `advisor/052-weekly-review-proactive`
- Commits: (1) schema+validator+store sync, (2) cron + internal action.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extend schema + validator (backward-compatibly)

Add to `userSettings` in `convex/schema.ts` and to `upsert` args in
`convex/settings.ts`, ALL `v.optional(...)`:

- `notificationsWeeklyReviewEnabled: v.optional(v.boolean())`
- `notificationsWeeklyReviewDay: v.optional(v.number())` (0–6, 0=Sunday —
  match the store's convention, see `lib/notifications.ts:310`)
- `notificationsWeeklyReviewTime: v.optional(v.string())` ("HH:mm")
- `notificationsProteinNudgeEnabled: v.optional(v.boolean())`
- `notificationsProteinNudgeTime: v.optional(v.string())`
- `notificationsStreakRiskEnabled: v.optional(v.boolean())` (for plan 051)
- `notificationsStreakRiskTime: v.optional(v.string())`

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 2: Round-trip the fields in the store

In `stores/settings-store.ts`: make the weekly-review and protein-nudge
setters call `syncSettings(get())` like every other setter; add the fields
to the `syncSettings` payload and to `hydrateFromServer`'s mapping; remove
the two now-false "persisted locally only" comments. Keep defaults
identical to today's local defaults so existing users see no change.
(If plan 051 already added streak-risk fields locally, wire them too;
otherwise skip them client-side — the validator accepting them early is
harmless.)

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm test` → pass;
`grep -n "persisted locally only" stores/settings-store.ts` → 0 matches.

### Step 3: Cron-callable generation

In `convex/weeklyReview.ts`, add `generateReviewForUser` as an
`internalAction` with args `{ userId: v.id("users"), weekStart: v.string() }`
that reproduces `generateReview`'s handler body but takes `userId` from
args instead of `getAuthUserId` (extract the shared body into a helper
called by both — keep the 24h idempotency check so cron + on-demand never
double-generate). Preserve the Pro/free branch exactly: free users get the
rule-based recommendation (no OpenAI call, no new spend).

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 4: The scan + cron

Add an `internalMutation` `enqueueWeeklyReviews` (in `convex/weeklyReview.ts`
or a small `convex/weeklyReviewCrons.ts` — match the `subscriptionCrons.ts`
naming if you split) that:

1. Scans `userSettings` for rows with `notificationsWeeklyReviewEnabled === true`.
   Full-table scan of `userSettings` is acceptable at current scale IF no
   index exists; note row count in your report. If you add an index instead,
   declare it in `schema.ts` (repo rule: no unindexed query patterns at scale).
2. For each, computes the user's most recent completed week's `weekStart`
   (Monday "YYYY-MM-DD" — mirror `components/review/review-dates.ts` logic
   server-side; cite it in a comment).
3. Skips users with zero `workoutLogs` in that week (use the
   `by_user_completedAt` index — same bounds pattern as
   `buildWeekStats`, `convex/weeklyReview.ts:115-123`) — no content, no review.
4. `ctx.scheduler.runAfter(0, internal.weeklyReview.generateReviewForUser, ...)`
   per user (the runAfter fan-out pattern from `subscriptionCrons.ts:56-60`).

Register in `convex/crons.ts`: run **hourly** (`crons.interval` — the
per-user chosen day/time is honored by generating for users whose
configured fire hour matches the current UTC hour ± their day; if timezone
data is unavailable on the server, simplify: generate once weekly for
everyone early Monday 03:00 UTC, BEFORE any reasonable local notification
time, and record the simplification in your report). Prefer the simple
Monday-03:00-UTC weekly cron unless the settings rows carry timezone info —
check `userSettings` schema; at plan time it does not.

**Verify**: `npx tsc --noEmit -p convex` → exit 0; `pnpm lint` → 0 errors.

## Test plan

- Extend `lib` tests only if you added client-side date logic; server-side
  weekStart computation should be a pure exported helper in `convex/` —
  Convex code is not covered by `pnpm test` (vitest scope is `lib/**`), so
  keep the helper trivially mirrorable and assert the CLIENT twin in
  `lib/*.test.ts` if one exists for `review-dates` (check
  `ls components/review/ lib/*.test.ts`). If no twin exists, state so in
  the report; do not add a new test runner for convex/.
- Manual verification (operator, post-deploy): Convex dashboard → run
  `enqueueWeeklyReviews` once manually → confirm `weeklyReviews` rows appear
  for active users and `getReview` returns instantly in the app.

## Done criteria

- [ ] `npx tsc --noEmit` and `npx tsc --noEmit -p convex` exit 0
- [ ] `pnpm lint` 0 errors; `pnpm test` passes
- [ ] Weekly-review + protein-nudge settings round-trip (setter → syncSettings → upsert → hydrateFromServer)
- [ ] "persisted locally only" comments removed (grep = 0)
- [ ] A cron exists in `convex/crons.ts` that fans out `generateReviewForUser`; free users take the rule-based path (no OpenAI call — verify by reading the branch)
- [ ] 24h idempotency preserved (cron + on-demand can't double-generate)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated; report states "needs Convex deploy"

## STOP conditions

Stop and report back (do not improvise) if:

- `syncSettings` in the store does anything other than call
  `api.settings.upsert` with a flat field object (unknown drift in the sync
  chokepoint — breaking it breaks every setting).
- `generateReview`'s handler has changed such that extracting a
  userId-parameterized body isn't mechanical.
- You find an existing server-side week-start helper that disagrees with
  `components/review/review-dates.ts` — reconcile-by-picking is a product
  decision; report the discrepancy.
- The `userSettings` scan would exceed Convex read limits (very large row
  count) — report, don't invent pagination semantics.

## Maintenance notes

- This unblocks: content-rich review surfaces (plan 051's home chip shows
  instantly), a future email digest, and future server-driven notifications.
- OpenAI spend: the cron adds ≤1 LLM call per Pro user per week (idempotency
  caps regeneration). If Pro count grows large, batch or stagger the fan-out.
- When real push notifications are ever built, the notification content
  ("You set 2 PRs this week") should come from the pre-generated row this
  plan creates — that was the point.
- Reviewer scrutiny: every new validator field optional; the free-user
  branch provably skips OpenAI; cron fan-out uses `runAfter` (never inline
  OpenAI calls in a mutation — repo rule: third-party work in actions).

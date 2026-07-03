# Plan 055: Stop the silent churn — grace/lapsed lifecycle emails + AI-metering memo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- convex/subscriptionCrons.ts convex/email.ts convex/crons.ts convex/schema.ts convex/subscriptions.ts`
> **Known planned drift**: PR #87 (plan 039) rescopes these crons onto a new
> `by_status_source` index. Read the merged state before copying the scan
> pattern. Any other mismatch with "Current state" is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (S–M build + S memo)
- **Risk**: LOW-MED — outbound email to real users; frequency caps and
  opt-out handling are the risk surface. No client changes.
- **Depends on**: none (rebase on PR #87 if merged). **Convex deploy
  required after merge.**
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

The subscription state machine models `free | trial | pro | grace | paused
| lapsed` (`convex/validators.ts:218-225`), but nothing acts on the churn
states: the only lifecycle communication is a trial 48-hour reminder and a
Nordic-compliance 6-month notice. A card that fails into `grace` gets no
"update your payment method" nudge (involuntary churn — the most
recoverable kind), and a `lapsed` subscriber gets no win-back. The working
infrastructure — status-indexed cron scans, Resend templates, HMAC
unsubscribe links, `emailOptOut` handling, sent-markers — already exists
for the trial reminder; this plan clones it for the two churn states.
Second deliverable: a short design memo for per-user AI usage metering
(today Pro is one boolean; free users get zero AI taste and Pro spend is
uncapped and unmonitored per account), so the operator can decide on a free
quota with real options in front of them.

## Current state

- `convex/crons.ts` (whole file, 31 lines) — four crons: trial-reminder-48h
  (daily 08:00 UTC), dcsa-6-monthly (daily 09:00), rc-temp-demote (hourly),
  sweep-orphan-meal-photos (daily 04:00).
- Scan pattern to clone — `convex/subscriptionCrons.ts:21-60`
  (`sendTrialReminders`, internalMutation):

  ```ts
  const trials = await ctx.db
    .query("userSubscriptions")
    .withIndex("by_status", (q) => q.eq("status", "trial"))
    .collect();
  for (const row of trials) {
    if (row.reminder48hSentAt) continue;          // sent-marker guard
    ...
    const user = await ctx.db.get(row.userId);
    const email = (user as { email?: string } | null)?.email;
    if (!email) { /* mark sent, skip */ }
    if (row.emailOptOut) { /* mark sent, skip */ }
    await ctx.scheduler.runAfter(0, internal.email.sendTrialReminder48h, {...});
  }
  ```

  (PR #87 may have changed `by_status` to `by_status_source` — use the
  merged code's index.)
- Email template pattern — `convex/email.ts:116-146`
  (`sendTrialReminder48h`, internalAction): builds text+html via a template
  function, requires `unsubscribeTokenNode(userId)` (skips send if the
  secret env var is unset), sends via `sendViaResend({ from: FROM_ADDRESS,
  to, reply_to: REPLY_TO, subject, html, text })`. Every email embeds
  `unsubscribeUrl(userId, token)`. The only exports today:
  `sendTrialReminder48h` (:116), `sendDcsa6Month` (:148), `sendUnsubscribe`
  (:175).
- `convex/schema.ts:123+` — `userSubscriptions`: `status` (optional,
  `subscriptionStatusValidator`), `expiresAt` (optional ISO string),
  `updatedAt` (ISO string), plus the sent-marker/opt-out fields the trial
  cron reads (`reminder48hSentAt`, `emailOptOut` — confirm exact names in
  the merged schema).
- Metering memo inputs (verify each yourself before writing the memo):
  `internal.subscriptions.checkSubscription` returns a single boolean
  (usage exemplar: `convex/weeklyReview.ts:687-690`); the AI-gated actions
  are found via `grep -rn "checkSubscription" convex/` (chat, vision,
  weekly review, workout feedback); `convex/schema.ts` has no
  usage/quota/counter table (grep `usage|quota` → nothing); the only cost
  signal is the `ai_context_size` PostHog event in `convex/chatActions.ts`.
- Repo rules that apply: third-party work (Resend) stays in actions; DB
  scans stay in mutations/queries with indexes; every new queried field
  combination needs an index declared in `schema.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 (should be untouched) |
| Lint | `pnpm lint` | 0 errors |

## Scope

**In scope**:
- `convex/schema.ts` (two optional sent-marker fields on `userSubscriptions`)
- `convex/subscriptionCrons.ts` (two scan mutations)
- `convex/email.ts` (two templates + internalActions)
- `convex/crons.ts` (one daily cron registration)
- `docs/design/ai-usage-metering.md` (create — memo)

**Out of scope** (do NOT touch):
- Any AI gating change — the metering memo is a MEMO. Do not add counters,
  quota checks, or schema tables for usage.
- The RevenueCat webhook handling and status transitions themselves
  (`convex/subscriptions.ts`) — this plan only *reads* status.
- Client code entirely.
- In-app win-back UI (banners/offers) — email first; UI is a follow-up.

## Git workflow

- Branch: `advisor/055-subscription-lifecycle`
- Commits: (1) emails + crons, (2) memo.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Sent-markers in the schema

Add to `userSubscriptions` in `convex/schema.ts`:
`graceEmailSentAt: v.optional(v.string())` and
`winbackEmailSentAt: v.optional(v.string())` (ISO strings, matching
`reminder48hSentAt`'s type).

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 2: Templates + send actions

In `convex/email.ts`, clone the `sendTrialReminder48h` structure twice:

- `sendGracePaymentNudge` — subject "Action needed: your Fitbull Pro
  payment didn't go through". Body: payment failed, access continues
  briefly, fix it in App Store subscription settings (mirror the DCSA
  email's "Settings → Subscription, or via your App Store account"
  phrasing); unsubscribe link mandatory.
- `sendWinback` — subject "Your training history is still here". Body:
  subscription ended, data intact, one-tap resubscribe in the app; friendly,
  no discount promises (offers are an operator/RC-dashboard matter);
  unsubscribe link mandatory.

Both: same `unsubscribeTokenNode` guard, same `sendViaResend` call shape,
plain tone matching the existing templates (read them fully first).

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 3: Scan mutations

In `convex/subscriptionCrons.ts`, clone `sendTrialReminders` twice:

- `sendGraceNudges`: scan `status === "grace"`; guard on
  `graceEmailSentAt`, missing email, `emailOptOut` (mark-sent-and-skip
  exactly like the trial cron so rows don't re-enqueue); require the row to
  have been in grace ≥24h before sending (use `updatedAt` — one quiet day
  avoids racing RC's own retry) — then schedule `sendGracePaymentNudge`.
- `sendWinbacks`: scan `status === "lapsed"`; guard on `winbackEmailSentAt`
  + the same email/opt-out guards; send only when the lapse is 3–30 days
  old (before 3 days feels like surveillance, after 30 it's spam — compute
  from `expiresAt` when present, else `updatedAt`); one email ever per
  lapse (the sent-marker is not reset by this plan — note in the memo that
  re-lapse handling would need marker resets on status transitions).

**Important**: a user who resubscribes and lapses again keeps the old
marker — acceptable v1; record it in your report.

**Verify**: `npx tsc --noEmit -p convex` → exit 0; `pnpm lint` → 0 errors.

### Step 4: Cron registration

In `convex/crons.ts`, register one daily cron
(`"lifecycle-emails"`, 10:00 UTC — after the existing 08:00/09:00 sends)
that runs a small internalMutation calling both scans, or register two
crons following the file's existing one-cron-per-job style — match the
file's style, don't invent a dispatcher if two entries are cleaner.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 5: AI-usage metering memo

Write `docs/design/ai-usage-metering.md` (~1–2 pages), grounded in your own
reads:

1. **Today**: one boolean (`checkSubscription`), the enumerated AI-gated
   actions (list them from your grep with file:line), no per-user usage
   record anywhere, aggregate-only `ai_context_size` telemetry.
2. **What metering enables**: (a) a free-taste quota (N chat messages +
   M photo scans / month) as a conversion lever — free users currently hit
   a hard paywall without ever using the product's headline feature;
   (b) per-account cost observability for Pro (spend today scales unbounded
   per heavy account with no way to notice an outlier).
3. **Sketch**: a `userAiUsage` table (userId, monthKey, chatCount,
   visionCount) with an increment inside the existing gated actions and a
   quota check for free users; **fail-open requirement** (a metering bug
   must never block a paying user — spell out how).
4. **Open product decisions**: quota sizes, which features get a free
   taste, whether Pro sees usage at all. End with "OPERATOR DECISION
   REQUIRED".

**Verify**: `grep -c "OPERATOR DECISION" docs/design/ai-usage-metering.md` → ≥1.

## Test plan

- Convex code is outside the vitest scope; correctness rests on cloning the
  proven trial-cron guards. In your report, include a manual test recipe
  for the operator: Convex dashboard → set a test row's `status` to
  `grace`/`lapsed` with suitable timestamps → run the scan mutation → check
  Resend logs + sent-marker patch.
- Confirm both new emails contain the unsubscribe URL (grep template
  bodies).

## Done criteria

- [ ] `npx tsc --noEmit -p convex` exits 0; `pnpm lint` 0 errors
- [ ] Two scan mutations exist with sent-marker + email + opt-out guards, cloned from `sendTrialReminders`
- [ ] Grace nudge waits ≥24h in-state; win-back only 3–30 days post-lapse
- [ ] Both templates embed the HMAC unsubscribe URL
- [ ] Cron(s) registered; no OpenAI/Resend call inside a mutation (Resend stays in the internalActions)
- [ ] `docs/design/ai-usage-metering.md` exists; no metering code was written
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated; report states "needs Convex deploy"

## STOP conditions

Stop and report back (do not improvise) if:

- The merged `subscriptionCrons.ts` scan shape differs materially from the
  excerpt (post-#87 drift) — re-read and adapt only if the change is just
  the index name; otherwise report.
- `status` transitions turn out not to populate `grace`/`lapsed` in
  practice (check `convex/subscriptions.ts` for what writes those statuses;
  if nothing does, the whole build is moot — report immediately).
- The sent-marker fields conflict with fields PR #87 added.
- You are tempted to implement metering — memo only.

## Maintenance notes

- Re-lapse handling (marker resets on status transitions) is deliberately
  deferred; if lapse-recovery emails prove valuable, do it in the status
  transition writer, not the cron.
- If the operator later wants an in-app win-back banner, the same
  status+timestamps drive it; keep the email thresholds and any banner
  thresholds in one place then.
- Reviewer scrutiny: opt-out and no-email rows are marked sent (not
  re-enqueued forever), the 24h/3–30d windows, and that no secrets or
  tokens appear in templates beyond the existing unsubscribe pattern.

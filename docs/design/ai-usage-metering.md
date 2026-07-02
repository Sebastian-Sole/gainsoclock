# Design memo: per-user AI usage metering

**Status**: memo only — no code written. OPERATOR DECISION REQUIRED before
any implementation.
**Planned at**: plan `055-subscription-lifecycle`, commit `4c29928`,
2026-07-02
**Author**: advisor/055 agent

---

## 1. Today: a single boolean gate, no usage record

Every AI-gated action calls one internal query,
`internal.subscriptions.checkSubscription`
(`convex/subscriptions.ts:460-485`), which:

- checks a dev-only bypass env var (inert outside its own deployment),
- otherwise reads the user's most-recently-updated `userSubscriptions` row
  and returns `isProForRead(status)` — a plain `boolean`.

There is no notion of *how much* AI a user has consumed, this month or
ever. The gate is binary: Pro → unlimited access to every AI feature;
free → a hard `"pro_required"` / thrown-error wall.

**The five call sites** (all follow the same `if (!isPro) { deny }`
shape):

| # | File:line (gate check) | Action | What it costs |
|---|---|---|---|
| 1 | `convex/chatActions.ts:667-668` | `sendMessage` (`convex/chatActions.ts:657`) | One OpenAI chat completion per user message, full conversation context window |
| 2 | `convex/weeklyReview.ts:687-688` | `generateReview` (`convex/weeklyReview.ts:667`) | One OpenAI call per week, per user (rate-limited by the weekly cadence itself) |
| 3 | `convex/workoutFeedback.ts:277-278` | `generateFeedback` (`convex/workoutFeedback.ts:268`) | One short OpenAI completion per logged workout |
| 4 | `convex/nutritionVision.ts:287-289` | `generateRecipeMacros` (`convex/nutritionVision.ts:275`) | One OpenAI text call per recipe macro estimate |
| 5 | `convex/nutritionVision.ts:347-349` | `analyzeMealPhoto` (`convex/nutritionVision.ts:341`) | One OpenAI **vision** call per meal photo (most expensive of the five) |

Confirmed via `grep -rn "checkSubscription" convex/` — exactly these five
call sites plus the query definition itself; no others exist.

`convex/schema.ts` has no usage/quota/counter table — confirmed via
`grep -in "usage\|quota" convex/schema.ts` (no hits). Nothing in the
schema tracks a count, a monthly bucket, or a cost estimate per user.

The only cost-adjacent telemetry today is the `ai_context_size` PostHog
event (`convex/chatActions.ts:717-729`, fired from `sendMessage`): it
records prompt/history character and message counts per chat turn, but
it's an **aggregate analytics event**, not a per-user running total, and
it only instruments chat — not weekly review, workout feedback, recipe
macros, or photo vision, and it captures counts, never dollars.

**Net effect**: free users get zero taste of the AI features before
hitting a paywall, and Pro spend is uncapped and unmonitored per account —
a single heavy user (e.g. someone photographing every meal, every day)
costs the same infrastructure attention as a light user, with no signal
to notice the difference until an OpenAI invoice anomaly.

## 2. What metering would enable

**(a) A free-taste quota as a conversion lever.** Today a free user who
opens the chat tab or tries to scan a meal photo hits an immediate wall —
they've never experienced the product's headline AI features before being
asked to pay. A small monthly allowance (e.g. N chat messages + M photo
scans) lets a free user *feel* the value once or twice before the
upsell, which is a materially different conversion funnel than "pay first,
try later."

**(b) Per-account cost observability for Pro.** Right now there's no way
to answer "which accounts are driving OpenAI spend" without grepping raw
OpenAI dashboard usage by API key (undifferentiated by user) or manually
correlating PostHog events. A lightweight per-user counter turns "spend
scales unbounded per heavy account" into "we can see the top 1% of
accounts and decide whether that's fine, worth a soft cap, or worth
pricing differently."

## 3. Sketch: `userAiUsage` table + fail-open increments

A minimal shape, not a commitment:

```ts
userAiUsage: defineTable({
  userId: v.id("users"),
  monthKey: v.string(),       // "2026-07", UTC-anchored
  chatCount: v.number(),
  visionCount: v.number(),    // recipe macros + meal photo, combined or split
  feedbackCount: v.number(),  // workout feedback + weekly review, if metered
  updatedAt: v.string(),
})
  .index("by_user_month", ["userId", "monthKey"])
```

Each gated action would, after the existing `checkSubscription` call,
increment the relevant counter for its `monthKey` (upsert-by-index), and
free-tier callers would additionally check the counter against a quota
constant before proceeding.

**Fail-open requirement.** A metering bug must never be the reason a
*paying* user is denied AI access — that's a worse failure than under-
counting. Concretely, any implementation must:

- Only apply the quota **gate** to `free`-tier callers; Pro users are
  never blocked by usage, only (optionally) shown their own count.
- Wrap the increment write in a try/catch (or fire-and-forget via
  `ctx.scheduler.runAfter`) so a transient DB error on the *write* side
  never throws out of the gated action itself — the AI call should still
  proceed if the counter update fails.
- Treat a missing/corrupt counter row as "0 used this month," never as
  "deny" — the safe default on read failure is to let the request through
  (consistent with the existing `checkSubscription` dev-bypass pattern:
  fail toward availability, not toward denial, for anything that isn't the
  core paywall check itself).

This sketch is illustrative only — **no `userAiUsage` table, counter
increment, or quota check exists in this repo as a result of this memo.**
Building it is a separate, explicitly-scoped plan.

## 4. Open product decisions

These need an operator call before any build plan is written:

- **Quota sizes.** How many free chat messages / photo scans per month
  makes a compelling "taste" without cannibalizing the Pro upgrade
  motivation? No usage-distribution data exists yet to model this from —
  the first version would be a guess, tuned later from the new counters.
- **Which features get a free taste at all.** All five gated actions, or
  just chat + one vision feature (the two most demo-able)? Weekly review
  and workout feedback are lower-visibility; metering them mainly serves
  cost observability, not conversion.
- **Whether Pro sees their own usage.** A "you've sent 340 messages this
  month" surface could be a trust/transparency feature or could invite
  "why does this app care how much I use it" pushback on an unlimited
  plan — worth deciding deliberately, not defaulting to "yes, show
  everything."
- **Soft cap vs. hard cap vs. no cap for Pro.** Even with observability,
  does an outlier account ever get throttled, or does metering stay
  purely informational for paying users?

**OPERATOR DECISION REQUIRED** on the above before scoping a follow-up
implementation plan.

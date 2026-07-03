# The aha-workout pipeline: revive or retire?

**Status:** decision memo, not an implementation. Written as Part 2 of plan
050 alongside wiring the paywall interstitial (Part 1). Grounded by reading
`convex/onboardingActions.ts`, `convex/onboarding.ts`, `convex/schema.ts`,
`hooks/use-consent.ts`, and the design docs at
`docs/prism/onboarding-flow/plan/master-plan.md` and
`docs/prism/onboarding-flow/synthesis.md`.

## 1. What exists

Fitbull has a fully-built, server-side AI workout-preview generator that no
client code calls. It was the centerpiece of the master onboarding plan and
is now orphaned after a documented pivot to canned demo screens.

**The pipeline** (`convex/onboardingActions.ts`):

- `generateAhaWorkout` (line 271) — a public `action`. Takes `{ generationId }`,
  resolves the caller via `getAuthUserId`, and forwards to the internal
  action. No client caller exists.
- `runAhaGeneration` (line 285) — an `internalAction` run by the scheduler or
  the public wrapper. It builds a short, single-session workout preview via
  OpenAI and writes it to the `onboardingAha` table as it streams.
- Safety gates, all present and none bypassable without touching this file:
  - **Consent gate** — refuses unless `ai_coach_inference` consent is granted
    (`getAiConsentForUser`); marks the row `failed` with reason
    `ai_coach_inference_consent_missing` otherwise.
  - **Sanity bounds + age gate** — `assertSanityBounds(profile)` and
    `assertAgeGate(profile)` (lines 85, 122) reject profiles with
    implausible or under-16 inputs before any OpenAI call is made.
  - **Profile-completeness gate** — bails with `profile_incomplete` if any of
    `goals` / `primaryGoal` / `experience` / `trainingDaysOfWeek` is missing.
    This is itself a scar from the demo-onboarding pivot: `userProfile` rows
    can now exist without the legacy intake fields.
  - **Rate limiting** — a lifetime cap (`LIFETIME_CAP = 5`, line 41) and a
    30-second cooldown (`RATE_LIMIT_WINDOW_MS`, line 40) per user; both
    return the last completed generation idempotently rather than erroring.
  - **Idempotency** — keyed by `(userId, generationId)`; a `"streaming"` row
    updated within the last 60s is left alone rather than re-fired
    (`STALENESS_WINDOW_MS`); a `"complete"` row short-circuits.
  - **Output validation** — `assertPostParse` (around line 240) rejects any
    generated workout whose duration, exercise IDs (must be in an
    experience-tier allow-list from `filterAllowedByTier`), or set×rep
    volume fall outside sanity bounds. There's also a dedicated
    `RefusalError` path for OpenAI moderation refusals.
- **`onboardingAha` table** (`convex/schema.ts:208`) — dedicated table (not a
  column on `chatConversations`), `status: "streaming" | "complete" |
  "failed"`, `workout: v.any()` (deliberately untyped — the client is meant
  to parse only once `status === "complete"`, per the streaming-render
  strategy in the master plan), plus `intro`, `error`, `profileSnapshot`,
  timestamps. Indexed `by_user` and `by_user_generationId`.
- **`rekickAha`** (`convex/onboarding.ts:458`) — public mutation, doc'd as
  "the client calls this when S7's p99 hard-kill fires or the user taps
  Retry." Re-schedules `runAhaGeneration` idempotently by `generationId`.
- **`getAha`** (`convex/onboarding.ts:441`) — public query for reactive
  streaming reads, `(userId, generationId)` keyed.
- **GDPR/consent integration still live**: withdrawing `ai_coach_inference`
  consent (`convex/onboarding.ts:322-336`, referenced from
  `hooks/use-consent.ts:41`'s comment on `withdrawConsent`) walks every
  `onboardingAha` row for the user and marks non-`failed` rows `failed` with
  reason `consent_revoked`. The full-account erasure cascade
  (`deleteAccountCascade`, `convex/onboarding.ts:564`) also deletes
  `onboardingAha` rows by `by_user` index alongside every other owned table.

**Verified**: grepping `app/`, `components/`, `hooks/`, and `stores/` for
`generateAhaWorkout`, `rekickAha`, and `api.onboarding.getAha` returns zero
matches. Nothing calls any of the three public entry points.

**Design intent** (`docs/prism/onboarding-flow/plan/master-plan.md`,
`synthesis.md`): the master plan's flow was *sign-up → 5 decision screens +
consent → HealthKit primer → narrated analysis → AI-voiced aha plan card
(S8, `app/onboarding/aha.tsx`) → soft paywall interstitial → StoreKit
trial → post-paywall checklist*. The synthesis's headline finding (line 11)
was that **aha-before-paywall** was the one shape that survived every
hostile review rotation — Cal AI / Simple / MacroFactor-style personalized
preview, argued to lift trial opt-in from an ~2% generic-carousel baseline
toward Health & Fitness top-decile (~68% trial-to-paid, synthesis line 149).
The plan deliberately made the *content* deterministic (archetype-picked
from a bundled library) and only the *voice* (a 1–3 sentence intro) AI
generated, specifically to sidestep the streaming-latency and
hallucination failure modes the Pre-mortem diagnosed (p95 16.4s blank
screen on real networks, synthesis line 21/199).

**What shipped instead**: `app/onboarding/` has no `aha.tsx`. In its place
are canned, non-personalized demo screens — `demo-chat.tsx`,
`demo-meals.tsx`, `demo-workouts.tsx`, `founder-note.tsx` — ahead of
`paywall.tsx`. This is the "demo-onboarding pivot" referenced in code
comments (e.g. `runAhaGeneration`'s profile-completeness gate exists
*because of* this pivot). The pipeline was left running server-side,
fully wired to consent/erasure, but with its only client entry points
never built.

## 2. Option A — revive

**What's missing to make this live:**

1. **A client call after intake.** Something needs to call
   `api.onboarding.generateAhaWorkout({ generationId })` once the profile is
   complete (goals/primaryGoal/experience/trainingDaysOfWeek all set) and
   `ai_coach_inference` consent is granted — presumably from a
   `ctx.scheduler.runAfter` side-effect at the end of whichever screen
   finalizes intake today (there is no such screen currently; the demo
   screens don't collect real intake).
2. **An aha card UI before the paywall** — a new `app/onboarding/aha.tsx`
   (the master plan's S8), subscribing to `api.onboarding.getAha` for
   reactive streaming reads, rendering a skeleton while `status ===
   "streaming"` and the parsed card only at `"complete"` (per the
   streaming-render strategy — no partial-JSON parsing), with an explicit
   error/refusal state and a retry action.
3. **Retry wiring via `rekickAha`** for the documented p99 hard-kill and
   manual retry cases — currently unreachable since nothing calls
   `generateAhaWorkout` in the first place, so there's nothing to retry.
4. **Real intake screens** to actually populate `goals` / `primaryGoal` /
   `experience` / `trainingDaysOfWeek` — the demo-onboarding pivot means
   these are largely uncollected today. This is likely the single largest
   piece of missing work, and it's out of this pipeline's own scope: it's
   the master plan's S2–S6, not part of `onboardingActions.ts` at all.
5. **Sequencing with Part 1's interstitial**: the master plan's own order is
   *aha card → soft paywall interstitial → StoreKit sheet*. If revived, the
   aha card belongs **before** the `PaywallInterstitial` wired in Part 1 of
   this plan, not after or instead of it — the interstitial's trial
   disclosure and founder letter are a monetization step, the aha card is
   an activation/value-demonstration step upstream of it.

**Rough size: L.** The generation/safety/consent backend is done and
tested-by-design (idempotency, rate limits, sanity bounds all already
exist), but reviving this credibly requires the intake screens it was
designed to sit downstream of — without real `goals`/`experience`/etc.
data, `runAhaGeneration` immediately bails with `profile_incomplete` for
every current user. That intake-screen work is a prerequisite, not a
nice-to-have, and is comparable in size to the pipeline itself.

## 3. Option B — retire

**Exact deletion list:**

- `convex/onboardingActions.ts`: `generateAhaWorkout` (line 271),
  `runAhaGeneration` (line 285), and their private helpers
  (`assertSanityBounds`, `assertAgeGate`, `assertPostParse`,
  `RefusalError`, the rate-limit/idempotency constants) if nothing else in
  the file uses them.
- `convex/onboarding.ts`: `getAha` (line 441), `rekickAha` (line 458).
- `convex/schema.ts`: the `onboardingAha` table definition (line 208) — a
  real schema migration, not just a code deletion. Needs a data-retention
  decision (drop immediately vs. leave the table defined-but-unused for one
  release so any straggling rows can be read once more by an ops script,
  then drop) since Convex doesn't have a "soft-deprecate a table" primitive.
- `convex/onboarding.ts` consent cascade: the `if (purpose ===
  "ai_coach_inference")` branch (lines 322-336) that walks `onboardingAha`
  rows on consent withdrawal.
- `convex/onboarding.ts` `deleteAccountCascade`: remove `"onboardingAha"`
  from the `byUserTables` array (line 564).
- `hooks/use-consent.ts`: update the doc comment on line 41 referencing
  "aha kill" as one of the withdrawConsent cascades.
- Design-doc housekeeping: mark the `docs/prism/onboarding-flow/` S8 sections
  and `plan-07-ai-aha-moment.md` sub-plan as superseded/abandoned rather than
  leaving them as live-looking spec for a screen that will never exist.

**Rough size: S.** All deletions are mechanical; the only judgment call is
the `onboardingAha` table's retention window before dropping it from the
schema.

**What is lost:** the consent-plumbing and safety-gate investment (rate
limiting, sanity bounds, exercise allow-listing, idempotent streaming
writes) becomes unrecoverable without rebuilding it — none of that is
reusable in a generic sense; it's shaped specifically around one-shot
onboarding workout generation. More importantly, retiring closes the door
on the master plan's own highest-confidence finding: aha-before-paywall was
the one shape that survived every hostile review rotation, with
Health-and-Fitness top-decile trial-to-paid cited as evidence
(synthesis.md line 149, "Confidence: Medium-High"). If the operator retires
without ever shipping some version of a personalized activation moment, the
strategic bet the original 10-perspective exploration converged on goes
untested in production.

## 4. Recommendation

**Revive, but not as a standalone follow-up plan — bundle it with the
missing intake screens it depends on.** The backend here is unusually
complete for dead code: every safety property (consent, age gate, sanity
bounds, rate limit, idempotency, moderation refusal handling) a reviewer
would ask for already exists and appears to have been built carefully
against the master plan's own pre-mortem findings. Retiring it destroys
work that directly implements the synthesis's highest-confidence,
multi-perspective-converged recommendation (aha-before-paywall) without
that idea ever having been tried. The blocking gap isn't the aha pipeline
itself — it's that the intake screens which were supposed to feed it
(`goals`/`primaryGoal`/`experience`/`trainingDaysOfWeek`) were never built
in the shipped, demo-screen-based onboarding. Reviving the aha card alone,
without those intake screens, still bails at `profile_incomplete` for every
user.

If the operator's near-term roadmap has no room for rebuilding intake
screens, retiring is the more honest choice than leaving this half-wired
indefinitely — an unreachable but consent-integrated and erasure-integrated
pipeline is itself a small, ongoing maintenance and audit cost (every
future consent/erasure change has to remember to keep touching
`onboardingAha` even though nothing writes to it in production).

**OPERATOR DECISION REQUIRED**: choose Option A (revive — schedule as a
follow-up plan that includes the intake screens, sequenced aha-card-then-
interstitial) or Option B (retire — schedule the mechanical deletion pass
above, including the `onboardingAha` schema migration and its retention
window). This memo does not implement either option.

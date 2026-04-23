# Convex Realtime — Review of Master Plan (v2)

**Reviewer lens:** reactive queries, indexes, action/mutation boundary, schema evolution, streaming semantics, read/write limits.
**Plan reviewed:** `docs/prism/onboarding-flow/plan/master-plan.md` (revised 2026-04-21).
**Companion:** `docs/prism/onboarding-flow/plan/changelog.md`.
**Previous verdict:** CHANGES NEEDED — 8 blocking (C1–C6, C8, C10) + 3 recommended (C7, C9, C11).
**Verdict:** **APPROVED.**

All eight blockers are addressed with load-bearing specificity; the three recommended items are resolved in plan body. I verified each against the revised §3.1 / §3.2 / §3.4 / §3.5 / §3.6 / §3.8 and the Phase 10 env table.

---

## Re-verification of v1 concerns

### C1 — Streaming throttle + write shape + consumer query shape (was blocking)
§3.5 "Streaming shape" (lines 626–632) now states it verbatim: **250ms throttle, full-overwrite each tick** via `internal.onboarding.writeAhaDelta({ generationId, workout: <full accumulated JSON object> })`. Payload is bounded to ~500–800 tokens, so the overwrite cost is trivial even at a faster cadence; 250ms is a reasonable conservative pick against the 8s p95. The consumer is explicitly named: `useQuery(api.onboarding.getAha, { generationId })` returning a reactive single row. §3.1 confirms the column is `workout: v.optional(v.any())` on a dedicated table, and §3.5 commits to `status`-gated rendering (skeleton until `"complete"`) — which neatly sidesteps the partial-JSON-parse trap I flagged in C11. **Resolved.**

### C2 — Dedicated `onboardingAha` table vs. tagged `chatConversations` column (was blocking)
§3.1 (lines 290–302) ships the dedicated table with explicit comment `"not a chatConversations column [Convex-Realtime C2]"`. Fields and indexes match what I recommended: `userId`, `generationId`, `status ∈ {streaming, complete, failed}`, `workout`, `error`, `profileSnapshot`, timestamps; indexes `by_user` + `by_user_generationId`. The `chatMessages` subscription-gate leak risk from v1 is eliminated. **Resolved.**

### C3 — Reactive tri-state `useOnboardingStatus()` (was blocking)
§3.6 explicitly specifies `useQuery(api.user.getOnboardingStatus)` with tri-state `"loading" | "pending" | "complete"`, and — importantly — the guard rule that `use-auth-guard.ts` must NOT call `router.replace` during `"loading"` (line 642). Offline-cache fallback gated on network-offline, cache updated on re-confirmation (catches consent-withdrawal flips). The race condition D3 I worried about in v1 is closed. **Resolved.**

### C4 — Idempotency guard for abandon-and-retry (was blocking)
§3.5 "Idempotency guard" (line 526) specifies the exact decision tree I asked for: lookup by `(userId, generationId)`; if `streaming` AND `updatedAt > now - 60s` return existing; if older, mark `failed` and proceed; if `complete`, return existing. `generationId` is a client-sent nanoid. Public `rekickAha(generationId)` mutation exists for foreground recovery (§3.5 line 523). The action-runs-to-completion-server-side semantic is implicit in "no re-fire, no double-spend." Combined with the per-user-per-30s guard and lifetime cap 5 from AI-Safety #8, the double-spend surface is closed. **Resolved.**

### C5 — `userSubscriptions` indexes for cron scans (was blocking)
§3.1 (lines 358–361) adds all three indexes I requested — `by_status`, `by_status_trialExpiresAt`, `by_status_lastVerifiedAt` — plus a fourth `by_status_notificationAnchorAt` to support the RC F7 DCSA anchor pivot. §3.2 cron definitions (lines 385–386) reference the composite indexes by name, so the scan planner can actually use them. **Resolved.**

### C6 — Cron schedule + idempotency columns (was blocking)
§3.2 names schedule strings verbatim: `crons.daily("trial-reminder-48h", { hourUTC: 8, minuteUTC: 0 }, ...)` and a paired `crons.daily("dcsa-6-monthly", ...)`. Idempotency columns `reminder48hSentAt`, `dcsaNotifiedAt`, `notificationAnchorAt` all present in the extended schema (lines 350–352). The DCSA scan predicate is additionally scoped by `dcsaNotifiedAt < notificationAnchorAt + 183d` which correctly re-arms on anchor reset (RC F7). The trial-reminder predicate uses a ±2h window around the target to absorb cron jitter. **Resolved.**

### C7 — `getAuthUserId` discipline (was recommended)
§3.4 (line 514) restates the project rule explicitly for all four new modules (`onboarding`, `onboardingActions`, `analytics`, `home`), forbids `userId` as a public arg, and carves out the internal-mutation/cron exception. Matches Security Obs #1. **Resolved.**

### C8 — `completeOnboardingV2` per-table idempotency + server timestamps (was blocking)
§3.4 "Idempotency semantics" (lines 506–513) spells out the five-step sequence: auth first, `userProfile` upsert with `clientIntakeId` equality short-circuit, `userConsents` append-only with server-authored `grantedAt`, `userOnboarding` patch, all timestamps server-authored. `clientIntakeId: v.string()` is a required arg (line 487). This removes the timestamp-drift dedup hole from v1. The append-only consent log (Security CR4) resolves the audit-trail concern. **Resolved.**

### C9 — Backfill for 2 TestFlight subscription rows (was recommended)
§3.1 (line 364) commits to a one-shot `internalMutation migrateSubscriptionsV2` computing the state-machine fields from `(isActive, expiresAt, productId)`. Phase 1 Deliverables (line 736) carries it, Phase 10 pre-ship checklist includes it. **Resolved.**

### C10 — Env-var enumeration + PostHog client/server split (was blocking)
Phase 10 now contains the full table (lines 824–836). The PostHog split is correct: `POSTHOG_API_KEY` (Convex env, no `EXPO_PUBLIC_` prefix) for the `posthog-node` server client, `EXPO_PUBLIC_POSTHOG_API_KEY` for the Expo client. `ENTITLEMENT_ID = "fitbull_pro"` is explicitly called out as a code constant in `lib/subscription-constants.ts`, not an env var — which aligns with RC F2. Rotation-window and Resend vars are captured too. **Resolved.**

### C11 — Aha render strategy (was recommended)
§3.5 line 190 and §2 S8 commit to option 1: skeleton during `streaming`, render-on-`complete`. No partial-JSON parser. Honest and simple. **Resolved.**

---

## New observations on the revised plan

Nothing blocking, but worth noting:

- **`onboardingAha.workout: v.optional(v.any())`.** `v.any()` is the correct escape hatch for a mid-stream buffer, but the plan should ensure the read-side in `api.onboarding.getAha` does not re-validate the partial shape (it can't — OpenAI guarantees well-formedness only at completion). Since the client skeletons until `status === "complete"` this is moot in practice; flag for implementer sanity.
- **`rateLimits` table (§3.5 line 535).** Plan leaves "new `rateLimits` table OR inline check on `onboardingAha.startedAt`" as the implementer's choice. The inline path is cheaper (no new table, no new index) and sufficient given the 30s window. I'd push for the inline option at implementation time but it's not a planning blocker.
- **`ctx.scheduler.runAfter(0, generateAhaWorkout)` from S6 side-effect (Phase 7 line 787).** Scheduler calls do queue through the Convex transaction, so the action kicks off after `completeOnboardingV2` commits — correct boundary. No concern.

---

## Verdict

**APPROVED.** Every v1 blocker has a concrete, named resolution in the revised plan body with a `[Convex-Realtime Cx]` back-reference tag. The three recommended items are also addressed. Mutation/action boundary discipline, `getAuthUserId` coverage, index planning for cron fan-out, streaming write cadence, and idempotency across client retries are all specified at implementation-grade detail. No further changes required from this lens.

# Review v2 — Offline Sync lens

**Session:** onboarding-flow
**Reviewer persona:** offline-sync
**Plan reviewed:** `/Users/sebastiansole/Documents/gainsoclock/docs/prism/onboarding-flow/plan/master-plan.md` (revised)
**Changelog:** `/Users/sebastiansole/Documents/gainsoclock/docs/prism/onboarding-flow/plan/changelog.md`
**Date:** 2026-04-21

> Re-reading the revised plan with my v1 checklist in hand. The revision treats the offline/sync surface seriously: every "must-fix" item landed in the plan body with a named review tag, and two of my "nice" items went in too. I stress-tested by grep'ing for each concept and reading the surrounding paragraphs rather than trusting the changelog alone.

---

## Verification of v1 findings

| # | v1 concern | Resolved in revised plan | Verdict |
|---|---|---|---|
| 1 | S6 submit bypasses `syncToConvex` fire-and-forget queue | §2 S6 (line 155) and §3.4 explicitly: "S6 uses `useMutation(api.onboarding.completeOnboardingV2)` directly with explicit retry UI. The `syncToConvex` fire-and-forget queue is NOT used by default — it swallows errors and can leave the user stuck." Retry copy sourced from `lib/copy/errors.ts`. | Addressed |
| 2 | Idempotency (`clientIntakeId`, query-then-patch) | §3.1 schema adds `clientIntakeId: v.optional(v.string())` on `userProfile`. §3.4 spells out: `getAuthUserId` → `query.withIndex("by_user").unique()` → patch if `clientIntakeId` matches (no-op on replay) or insert; `userConsents` append-only with server-authored `grantedAt` and new `by_user_purpose_grantedAt` index; `getConsents()` reduces via that index. | Addressed |
| 3 | Intake-draft purge + Art. 9 persistence | §3.8 is the cleanest part of the revision. Four purge rules (onSuccess, sign-out wired into `auth-cache-store.clear()`, user-initiated "Start over", cold-boot partition mismatch). S5a/S5b Art. 9 fields (age, weight, height, body fat, sex) explicitly held **in-memory only** — Zustand slice without `persist`. S2–S4 slice persists with userId partition key. | Addressed |
| 4 | Tri-state `useOnboardingStatus()` | §3.6: reactive `useQuery(api.user.getOnboardingStatus)` returning `{ status: "loading" \| "pending" \| "complete" }`. Loading + offline → fall back to `auth-cache-store`. Online + loading → splash, never default to `"complete"` on uncertainty. Cache written on every true transition AND re-confirmation. `use-auth-guard.ts` must NOT `router.replace` during `"loading"`. | Addressed |
| 5 | RC out-of-order protection | §3.2 step 2 requires `updateFromWebhook` AND `syncFromClient` (step 5) to compare `event_timestamp_ms` / `customerInfo.requestDate` vs stored `lastEventTimestampMs` and ignore stale writes. "Log ignored stale event" called out. Phase 2 exit criteria include replay tests for old-timestamp `INITIAL_PURCHASE` no-op and past-timestamp `SUBSCRIPTION_EXTENDED` still updating `trialExpiresAt`. | Addressed |
| 6 | Background-during-aha state progression + re-kick | §3.1 adds dedicated `onboardingAha` table with `status: "streaming" \| "complete" \| "failed"`. §3.4/§3.5: `rekickAha({ generationId })` public mutation. §3.5 idempotency guard: if `streaming` AND `updatedAt > now - 60s` return unchanged; if older mark `failed` and re-run; if `complete` return existing. Client on foreground reads row, calls `rekickAha` if absent. | Addressed |
| 7 | Server-authoritative trial clock | §3.2 step 4: "Client **never** evaluates `Date.now() > trialExpiresAt` [Offline-Sync #10]: `status` is server truth; `trialExpiresAt` is display-only." Daily cron handles server-side transitions. | Addressed |
| 8 | PostHog offline burst (nice) | §3.3 documents RN SDK disk-persistence + flush on reconnect; canary Maestro uses 24h window. | Addressed |
| 9 | Multi-device conflict (nice) | §3.4 close: "last-write-wins on `userProfile`; `userConsents` additive; device B `useOnboardingStatus()` flip to `completed` mid-intake auto-routes forward; draft purges on server-confirmed completion." | Addressed |
| 10 | S9 offline paywall degrade | §2 S9 (line 217): `getOfferings()` failure or >3s → render with cached storefront-keyed `priceString` or substitute "Pricing will load when you're back online."; disable primary CTA; skip enabled; never call `presentPaywall()` offline. | Addressed |

---

## New observations after re-read (non-blocking)

**O1 — `rekickAha` surface consistency.** §3.5 lists `rekickAha` as a "public mutation" but §3.4 enumerates it in the onboarding module's exports alongside action-style semantics. Since its job is to re-schedule work, it may need to be an action (mutations can't `ctx.scheduler.runAfter` a self-rerun cleanly, but they can trigger via `ctx.scheduler.runAfter(0, internal.onboardingActions.generateAhaWorkout)`). Confirm during Phase 5 that `rekickAha` is actually a mutation that schedules the action, not an action itself — the plan currently uses "mutation" language which is correct for Convex semantics but worth a one-line clarifying note.

**O2 — Offline `getOfferings` cache hydration path.** §S9 references a "last-known cached price (AsyncStorage, keyed by storefront)" but the plan never says where that cache is written. One line in §3.2 step 5 would close this: "on every successful `getOfferings()`, persist `{ storefront, priceString, introPriceString, fetchedAt }` to AsyncStorage under `paywall-price-cache`." Without this write-path, the read-path is vapor.

**O3 — Sign-out purge ordering.** §3.8 wires purge into `auth-cache-store.clear()`. Verify the clear-order during Phase 4: if `auth-cache-store.clear()` runs before the Zustand `persist` rehydrate-watcher notices the user change, there's a narrow window where a subsequent cold boot could still see the prior user's partition. The partition-mismatch cold-boot migration catches this, so this is belt-and-braces — but worth flagging for the implementer.

**O4 — `ahaGenerationCount` race.** §3.5 rate-limit uses `userProfile.ahaGenerationCount <= 5`. Convex mutations are serialisable per-user so this is safe in isolation, but the increment must happen in the same mutation that marks `status: "complete"`, not at action entry, or a failing run consumes a life. Plan does not specify; consider stating explicitly that the counter increments only on transition to `complete`.

None of these block implementation.

---

## Verdict

**APPROVED.**

All seven v1 blocking items and both nice-to-have items are directly addressed in the revised plan with concrete, grep-able specifications. The offline-sync surface is now coherent: S6 is interactive with visible retry; idempotency flows through `clientIntakeId` + query-then-patch; intake drafts have explicit lifecycle and purge rules with Art. 9 data firewalled from AsyncStorage; `useOnboardingStatus()` has honest three-state semantics with cache fallback; subscription state respects wall-clock ordering via `lastEventTimestampMs` compare; aha generation handles background/foreground/re-kick through a dedicated table with a state field; offline paywall degrades gracefully; trial-end is server-authoritative.

The four observations above are polish to tighten during implementation, not blockers. Greenlight for Phase 0 entry.

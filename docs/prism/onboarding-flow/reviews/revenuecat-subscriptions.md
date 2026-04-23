# Review v2 — RevenueCat / Subscriptions domain

**Reviewer persona:** `revenuecat-subscriptions`
**Plan under review:** `docs/prism/onboarding-flow/plan/master-plan.md` (revised)
**Date:** 2026-04-21
**Supporting inputs read:** v1 review (11 findings, 5 blocking), `plan/changelog.md`, revised `master-plan.md` §§3.1/3.2/3.9, §2 S9, Phase 0/2/8/10.

Verdict up front: **APPROVED**, with two small nits below that do not block Phase 2/8 landing. All 5 v1 blockers and all 6 before-ship/minor items are addressed in the revised plan with concrete deliverables, file paths, env vars, and exit criteria. The reviewer's specific checklist items verify as follows.

---

## Verification of v1 findings

### F1 — State-machine event coverage (was: blocking)
Resolved. `§3.2 step 3` (`master-plan.md:372-375`) names every event the v1 review called out: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION` (with `cancel_reason`), `EXPIRATION` (explicitly replacing the fictitious `GRACE_PERIOD_EXPIRED`), `BILLING_ISSUE`, `NON_RENEWING_PURCHASE`, `SUBSCRIPTION_EXTENDED`, `SUBSCRIPTION_PAUSED` → `paused`, `PRODUCT_CHANGE` (with "never reset `trialExpiresAt` on upgrade" invariant), `REFUND` / `REFUND_REVERSED`, `TRANSFER` (two-sided semantics), `TEMPORARY_ENTITLEMENT_GRANT` → `rc_temp` + 24h, `SUBSCRIBER_ALIAS` (idempotent no-op), `UNCANCELLATION`. `status` union adds `"paused"` (`:330`). `source` union adds `"rc_temp"` (`:336`). `cancelReason` column present (`:344`).

### F2 — Entitlement single source of truth (was: blocking)
Resolved. `§3.2 step 1` (`:368`) locates `ENTITLEMENT_ID = "fitbull_pro"` in `lib/subscription-constants.ts`; both Convex and client import from there. Explicit deletion of `REVENUECAT_ENTITLEMENT_ID`, `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, the `?? "Fitbull Pro"` fallbacks, and the "first active entitlement" fallback at `hooks/use-purchases.ts:65-75` in the same PR. Phase 10 env-var table (`:829-838`) confirms it is not an env var. Good.

### F3 — Webhook dual-token rotation (was: blocking)
Resolved. `§3.2 step 3` (`:373`) specifies dual-token (`REVENUECAT_WEBHOOK_AUTH_TOKEN` OR `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS`), 7-day overlap, timing-safe compare, and `docs/revenuecat-webhook-rotation.md` as a new doc referenced from Phase 2 (`:712`) and Phase 10 (`:830`). Complete.

### F4 — `rnpModule.default ?? rnpModule` v9 guard + version pin (was: blocking)
Resolved. §S9 (`:221`) reiterates: *"`Purchases = rnpModule.default ?? rnpModule` preserved; `getOfferings` pulled from the same lazily-loaded object"* with exact-version pin (drop `^`), mirroring the `react-native-nitro-modules@0.32.2` override. Phase 2 deliverable (`:731`) re-states the lazy-require + exact-pin requirement. Complete.

### F5 — `RevenueCatUI` null fallback (was: blocking)
Resolved. §S9 (`:219`) specifies a Fitbull-authored in-component purchase button calling `Purchases.purchasePackage(pkg)` (fed from `getOfferings()`) when `RevenueCatUI` is null, plus a `revenuecat_ui_unavailable` PostHog event. Analytics schema confirms the event literal (`:424`). V1.1 scoping for the full custom paywall is preserved in changelog "declines" block. Complete.

### F6 — `checkTrialOrIntroDiscountEligibility` before paywall (was: before-ship)
Resolved. §S9 (`:208-213`) calls `Purchases.checkTrialOrIntroDiscountEligibility([annualSKU])` before presenting, branches copy between eligible ("7 days free, then {priceString}/{period}…") and ineligible ("{priceString}/{period}, cancel anytime"), and fires `paywall_interstitial_shown { trialEligible: boolean }`. Matches the Apple 3.1.2 bait-and-switch mitigation the v1 review asked for.

### F7 — DCSA 6-monthly email (was: before-ship)
Resolved. `§3.2` cron block (`:386-388`) uses `notificationAnchorAt` as the pivot (set from `INITIAL_PURCHASE` and reset on `RENEWAL`) — **not** `lastVerifiedAt`, which was the v1 correction. Provider named: **Resend** (EU region), `EMAIL_SERVICE_API_KEY` Convex env. `unsubscribeFromLegalReminders` mutation + `expo-notifications` in-app fallback when `emailOptOut: true`. V1 English, V1.1 locale pivot via `storefrontCountry`. Complete.

### F8 — 48h-before-charge email (was: before-ship)
Resolved. `§3.2` cron `trial-reminder-48h` (`:385`) with the 46–50h idempotent window and `reminder48hSentAt` sentinel. Phase 8 exit (`:800`) lists Resend templates + unsubscribe link as hard deliverables; risk table (`:871`) confirms it is promoted from Phase 10 stub to Phase 8 hard requirement.

### F9 — Storefront `priceString` pass-through (was: before-ship)
Resolved. §S9 (`:215`) props are `priceString: string`, `introPriceString`, `subscriptionPeriod.unit`, `numberOfUnits` — all pass-through from `getOfferings()` with explicit "never concatenate manually" instruction. Iceland USD fallback called out for Phase 10 device verification. `§3.9` (`:678`) restates the prop shape on the presentational component. Complete.

### F10 — RC Experiments disabled in V1 (was: minor)
Resolved in a single line (`:390`). "RC Experiments disabled in V1 dashboard. A/B lives in PostHog." That is exactly the 2-sentence addition the v1 review asked for.

### F11 — Source audit trail (was: before-ship)
Resolved. Schema (`:339-343`) adds `sourceHistory: v.array({ source, grantedAt, reason })`. `source: "rc_temp"` added to the union (`:336`). Changelog RC F11 row (`:74`) documents the transition invariants (`rc_intro → rc_paid`; any StoreKit tx overrides `app_local`). The audit-trail column pays off exactly where v1 argued it would: refund-vs-user-cancel telemetry and chargeback disputes.

---

## Residual nits (non-blocking)

### N1. `refunded` in Phase 2 exit criteria is not a `status` value
`master-plan.md:737` reads: *"simulated webhook `curl` flips state cleanly across `free → trial → pro → paused → lapsed → refunded`"* — but the `status` union (`:325-332`) does not contain `"refunded"`. The plan's chosen model is that refunds land as `status: "free"` + `cancelReason: "refunded"` + a `sourceHistory` row (§3.2 step 3 line about `REFUND` — "refunded → free with audit row"). That design is correct; the exit-criteria line is just sloppy shorthand. Suggest rewriting as *"…`pro → paused → lapsed`; refund path verified via `cancelReason = 'refunded'` + `sourceHistory` row + `status = 'free'`; `REFUND_REVERSED` restores `status = 'pro'`."* Pure doc hygiene — no code impact.

### N2. Refund-vs-user-cancel distinction in analytics events
The plan captures `cancelReason` server-side and an audit trail, which is the durable truth. But the funnel events in `§3.3` (`:418-425`) do not segment cancellations by reason. If a PostHog cohort reports "7-day churn", conflating `refunded` with `user_cancel` and `billing_error` is the Black Hat D1 telemetry smear the v1 review flagged. Add a `subscription_ended { reason: "refund"|"user_cancel"|"billing_error"|"developer_initiated"|"subscription_replaced" }` event fired from `updateFromWebhook` on `CANCELLATION`. One line in the AnalyticsEvent union; payload already computed. Non-blocking; trivially addable during Phase 2.

### N3. `TEMPORARY_ENTITLEMENT_GRANT` cleanup cron
`source: "rc_temp"` with 24h `expiresAt` is in the schema (`:336`), but no cron or transition explicitly demotes an un-reconciled `rc_temp` row back to `free` when the real event doesn't arrive. The v1 review said: *"if a real `RENEWAL`/`INITIAL_PURCHASE` doesn't arrive, it expires cleanly to `free`."* The existing `by_status_trialExpiresAt` index and `trial-reminder-48h` cron don't cover this. A tiny extra cron or a predicate inside the existing daily sweep (`status = "pro" AND source = "rc_temp" AND expiresAt < now → status = "free"`) closes the loop. Non-blocking because `TEMPORARY_ENTITLEMENT_GRANT` is rare and the next webhook will correct most cases, but worth a one-liner in `§3.2` cron block.

---

## Supporting confirmations (no action needed)

- **Apple review path.** The combination of (a) 3.1.2 disclosure on the interstitial in storefront language, (b) intro-offer eligibility branch before the StoreKit sheet, (c) visible Restore Purchases via RC default chrome, (d) `trial_confirmation_shown` post-purchase banner, and (e) `app/settings/delete-account.tsx` in V1 gives a clean Apple 3.1.2 + 5.1.1(v) response packet.
- **Version pin policy.** The "exact pin + revalidate on bump" policy mirrors the `pnpm.overrides` pattern for `react-native-nitro-modules@0.32.2` — which is the right precedent.
- **Offline paywall degrade** (Offline-Sync #7, reflected in §S9 `:217`) correctly disables the primary CTA and keeps skip enabled rather than calling `presentPaywall()` with no network.

---

## Verdict: **APPROVED**

All 5 v1 blockers are addressed with concrete file paths, env-var wiring, schema columns, and Phase 2/8/10 exit criteria. All 6 before-ship/minor items land. N1/N2/N3 are optional polish; Phase 2 can ship without them.

Sources:
- [RevenueCat Webhook Event Types and Fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [RevenueCat Displaying Paywalls](https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls)
- [Apple App Store Review Guidelines 3.1.2](https://developer.apple.com/app-store/review/guidelines/#3.1.2)

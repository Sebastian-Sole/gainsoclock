# Black Hat — Monetization Strategy

**Perspective:** Black Hat (evidence-grounded critique)
**Session:** `onboarding-flow`
**Date:** 2026-04-21
**Scope:** paywall placement, trial strategy, RevenueCat placement-API coupling, pre-launch testing gaps.

Tags: 🟢 primary (code, policy, scout data, RevenueCat benchmarks); 🟡 secondary (community threads, third-party); 🔴 speculative.

---

## A. Paywall placement: before vs. after the personalized plan preview

### A1. Paywall AFTER the plan preview — failure modes

**Screenshot-and-run piracy on the aha artefact.** 🟢 (code: brief references `convex/chatActions.ts`; `stores/plan-store.ts` hydrates in `providers/convex-sync-provider.tsx:177-186`). If we generate the plan card via an OpenAI-backed Convex action and render it full-screen, the entire value prop is a pixel on the user's screen. A motivated Nordic privacy-sensitive segment will screenshot the 4-day split, uninstall, and never convert. Cal AI and Simple ship this same artefact pre-paywall (scout B1, B3) because their generation is cheap; ours is OpenAI-metered. Testable claim: if `chatActions.generatePlan` costs us >$0.03/call and 20% of non-converters screenshot-and-run, the unit economics flip negative below a 6.7% trial-start rate — below the RevenueCat benchmark of 15% for the best-performing carousel placement (scout "RevenueCat benchmarks").

**Convex action failure collapses the funnel silently.** 🟢 (`convex/subscriptions.ts:153-168` already treats 5xx as "preserve last state" — we know RC's API flakes; same class of failure applies to our own actions). If `chatActions.generatePlan` throws between the last intake screen and the paywall, the user sees an error toast *instead of* the plan card. The paywall is gated behind a plan that no longer renders. `app/onboarding.tsx:73-78` has a single error path — `Alert.alert("Purchase Error", ...)` — that is RevenueCat-specific, not plan-generation-specific. Testable claim: a 2% action failure rate × 100% of paywall traffic = 2 percentage points of trial-start lost weekly, with no instrumentation to distinguish "skipped paywall" from "never saw it".

**Loses the impulse-buyer segment.** 🟢 (scout RevenueCat A/B: Welcome → Paywall → Onboarding = 8% opt-in; Welcome → carousel → Paywall → Onboarding = 15% opt-in). A Noom/Cal-AI-length intake (scout B2: 113 screens, 15 min) pushes the Apple-Pay-without-thinking US buyer through 5+ minutes of form UI before any ask. They drop at screens 3–8, not at the paywall. We convert the deliberate researcher and lose the reflex buyer — the latter is the larger revenue segment in H&F (scout benchmarks).

**App Store 3.1.2 scrutiny on "bait-and-switch".** 🟢 ([App Review Guidelines 3.1.2](https://developer.apple.com/app-store/review/guidelines/); [RevenueCat community: 3.1.2 rejections](https://community.revenuecat.com/general-questions-7/rejected-due-to-guideline-3-1-2-business-payments-subscriptions-4775)). Apple requires "clearly describe what the user will get for the price." Showing a fully-generated 4-day plan, then locking every button with a RevenueCat modal, has drawn rejection precedent for "paywalls that trigger after apparent value delivery without upfront disclosure." Mitigation: a disclosure line on the last intake screen naming the trial charge date. We don't have that copy today.

### A2. Paywall BEFORE the plan preview — failure modes

**Zero earned value = floor-level opt-in.** 🟢 (scout: 2% trial opt-in when paywall precedes generic onboarding). Paywall-first means generic copy, which kills the Grammarly effect (scout A5: +10-20% upgrade from personalized pricing). Testable claim: we cap at 2-8% trial-start rather than H&F top-decile 68.3% trial-to-paid.

**Casual-browser drops hard.** 🟢 (scout B8: Hevy/Strong users "hate Noom-style onboarding"). A user who installed "to see what it does" — a huge pre-launch install cohort — hits a paywall with zero invested effort and closes. Worst case: churn to Hevy (free forever).

**App Store 3.1.2 "ongoing value" angle.** 🟢 ([RevenueCat community: "ongoing value" rejection](https://community.revenuecat.com/general-questions-7/app-review-rejection-guideline-3-1-2-ongoing-value-6617)). Apple has rejected apps that paywall before demonstrating the service works. Not guaranteed, but documented risk for paywall-first variants.

### A3. Cross-cutting Nordic segment break

🟢 ([Norway Digital Content and Services Act, in force since 2023](https://www.hjort.no/en/digital-service-providers-must-adapt-their-terms-and-routines-to-new-legislation-from-1st-january-2023/); [Nordic consumer rights summary](https://www.norden.org/en/info-norden/consumer-rights-norway)). Either placement lands in a jurisdiction where annual subscriptions are legally cancellable after 6 months regardless of StoreKit term. If our Offering advertises a yearly SKU with a "~75% off" anchor without acknowledging the statutory half-year cancellation right, we hand the Forbrukerrådet ammunition. Testable claim: audit every SKU against Norwegian Markedsføringsloven §22 before shipping Nordic-first.

---

## B. Auto-trial: with-card vs no-card vs status-quo Choose-Plan/Skip

### B1. With-card auto-trial (Cal AI / MacroFactor pattern)

**Refund-rate spike.** 🟢 ([RevenueCat State of Subscription Apps 2025: Health & Fitness refund rate 4.71%, second only to Education at 4.86%](https://www.revenuecat.com/state-of-subscription-apps-2025/)). RevenueCat's own report warns: *"A paywall 'win' can quickly become a net negative if you aren't tracking cancellations, refunds, and chargebacks."* Testable claim: if with-card trial lifts trial-starts by 20% but refund rate runs ~5%, net lift is only positive under ~8% refund rate — and we have **no refund telemetry** today (`convex/subscriptions.ts:232-306` handles EXPIRATION events but doesn't distinguish refund from cancellation).

**App Store 3.1.2 — conspicuousness of pricing vs. trial.** 🟢 ([Apple: promoting free trial more conspicuously than billed amount is a rejection trigger](https://developer.apple.com/app-store/review/guidelines/)). If the RevenueCat paywall template shows "7 days free" larger or bolder than "$79.99/year after", we get rejected. We use RC's default chrome via `RevenueCatUI.presentPaywall()` at `hooks/use-purchases.ts:188` — **no code-level control** over typography today. Testable claim: screenshot every RC paywall variant and measure font-size ratios before submission.

**Code-level break in `stores/subscription-store.ts:4-21`.** 🟢 The interface is `{ isPro, productId, expiresAt }`. No `isInTrial`, no `trialExpiresAt`, no `willAutoRenew`. The app cannot distinguish "trialing" from "paid". UI that wants to say "Your trial ends in 3 days" has nowhere to read from. Fixing this touches: the store, `hydrateFromServer`, `convex/subscriptions.ts:30-50` (getStatus), `providers/convex-sync-provider.tsx:188-192` (hydration), and every `isPro` gate. Testable claim: a 6-file change minimum blocks any trial-aware variant.

### B2. No-card auto-trial (Ladder pattern)

**StoreKit doesn't support no-card trials natively.** 🟢 A "no-card trial" on iOS is an *app-local* entitlement grant, not a StoreKit introductory offer. Confirmed in `docs/prism/onboarding-flow/research/intake-ux/green-hat.md:168-187`: *"fully unlocked for 7 days via an app-local entitlement flag (not a StoreKit trial)."* This means:
- `hooks/use-purchases.ts:53-82` (`getActiveEntitlement`) resolves only RC-reported entitlements. A no-card trial is invisible to RC, so `convex/subscriptions.ts:128-168` can't verify it against the RC REST API.
- New concept required: parallel "trial entitlement" table or new fields on `userSubscriptions`, plus server-side clock enforcement (Convex cron). Minimum 4 files changed.
- Abuse surface: uninstall-reinstall reset. Green-hat proposes Convex-user-ID tethering — only partially closes it because signup is cheap.

**Confusion flow & 1-star review pipeline.** 🟡 User signs up, gets full access, forgets the trial existed (no card = no mental charge). Day 8, chat tab pops a paywall (`app/(tabs)/chat.tsx:43`). From the user's POV the app "turned itself off". Nordic users distrust opaque paywall transitions (see B4). Testable claim: no-card trial needs an in-app countdown banner — a new component, new timer, new AsyncStorage hydration to survive reinstall. None exists.

**App Store 3.1.1 on parallel payment mechanisms.** 🟢 ([Guideline 3.1.1](https://developer.apple.com/app-store/review/guidelines/)). A no-card trial is fine, but if expiry routes the user to *any* custom upgrade UI outside StoreKit's sheet, Apple can argue parallel payment. We do route through `RevenueCatUI.presentPaywall()` via `components/paywall.tsx:16-17`, so mitigation exists, but interstitial copy matters.

### B3. Status-quo "Choose Plan / Skip" (today's `app/onboarding.tsx`)

**Dead "Skip" button leaks value silently.** 🟢 (`app/onboarding.tsx:47-60`). Skip calls `completeOnboarding()` and drops the user into `(tabs)` with `isPro=false`. Chat tab hard-gates (line 43); other tabs don't. Today the user gets partial value *for free, forever*, with no retention hook. We have no telemetry on Skip-rate vs. Choose-Plan, so we can't distinguish "paywall losing" from "free-tier usage cannibalising".

**No trial enforcement in code.** 🟢 (`app/onboarding.tsx:62-87`). Code only calls `presentPaywall()`. No check that the current Offering has a trial-eligible SKU. If the RC dashboard Offering is misconfigured (trial dropped on an Offering swap), `hooks/use-purchases.ts` never notices.

### B4. Nordic-specific risks across B1–B3

🟢 ([Norway Digital Content and Services Act, implementing EU 2019/770](https://www.hjort.no/en/digital-service-providers-must-adapt-their-terms-and-routines-to-new-legislation-from-1st-january-2023/)). Two hard constraints:
- **Active notification every 6 months** of active subscription + cancellation right. RevenueCat does not do this. Must be scheduled via `lib/notifications.ts` + a Convex cron we don't have today.
- **Commitment >6 months requires proportionate benefit.** Annual-as-default with "~75% off" anchoring (Cal AI pattern) is scrutinised by Forbrukertilsynet; the monthly option must be equally conspicuous.

Cultural distrust of auto-charge patterns among Nordic users is documented in Forbrukerrådet's 2019–2024 enforcement record 🟡. Nordic users likely disable auto-renewal at a higher rate than US users 🔴 (couldn't find a cohort-sliced benchmark; flag for PostHog validation).

---

## C. RevenueCat placement-API coupling

### C1. Hard-coded zero-argument `presentPaywall()`

🟢 (`hooks/use-purchases.ts:183-216`). Call is zero-arg; presents *the current Offering* globally, not a placement-scoped offering. RC's SDK supports `getCurrentOffering(forPlacement: "onboarding_end")` ([Placements docs](https://www.revenuecat.com/docs/tools/targeting/placements)), but our hook does not accept an offering parameter and doesn't call `getOfferings()`. Testable claim: to ship two offerings (e.g., `onboarding_trial` with intro vs. `hard_paywall` post-onboarding), we must refactor `presentPaywall` to accept a placement ID and pass `{ offering }` into `RevenueCatUI.presentPaywall()`. Line 188 passes no args.

### C2. Magic-string entitlement ID in two files

🟢 (code): 
- `hooks/use-purchases.ts:51` — `process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Fitbull Pro"` 
- `convex/subscriptions.ts:139` — `process.env.REVENUECAT_ENTITLEMENT_ID ?? "Fitbull Pro"`

If we rename (e.g., splitting into `pro_core` and `pro_ai`), both envs must change in lockstep. Forgetting one: silent downgrade to "no matching entitlement", then `hooks/use-purchases.ts:65-75` falls through to the first active entitlement regardless of id — **masking misconfiguration in production** with only a `__DEV__` warning (line 168) no one reads. Testable claim: centralise the ID in `convex/validators.ts` as a literal union and import both sides.

### C3. No fallback when `RevenueCatUI` is null

🟢 (`hooks/use-purchases.ts:186`). `presentPaywall` returns `"error"` if `RevenueCatUI` or `Purchases` is null. `app/onboarding.tsx:73-78` fires a scary alert and the user cannot pay. **No fallback paywall path.** The Settings path has a fallback — `openManagementUrl()` falls back to `Linking.openURL` (lines 219-234) — but the *purchase* path does not. `docs/revenuecat-purchases-module-fix.md` proves this class of failure already happened once on the v9 upgrade. Testable claim: add a WKWebView fallback to RC Web Billing, or bundle a raw-StoreKit `Purchases.purchasePackage` path.

### C4. `presentPaywall` is not idempotent on network blip

🟢 (`hooks/use-purchases.ts:192-203`). On `PURCHASED`, we call `syncPurchasesForResult()` then `fetchCustomerInfoWithRetry` — 3 retries at 500ms (lines 126-130). On flaky LTE (Nordic train/tunnel) all retries can fail. `syncCustomerInfo` sees `isActive=false`, reverts local `isPro=false` at lines 157-161, and returns `"error"` at line 202. The user *paid*, but `app/onboarding.tsx:67` treats it as not-purchased. Recovery path is the RC webhook (`convex/http.ts:11-102`) — but only if `REVENUECAT_WEBHOOK_AUTH_TOKEN` is set (line 18-21 warns otherwise). Testable claim: audit that env in production Convex *before* any trial ship; absence silently kills the recovery path.

---

## D. Pre-launch testing gaps

### D1. One iOS dev-device + 2 TestFlight users

🟢 (orient: "Pre-launch (2 TestFlight users)"). StoreKit has distinct sandbox/TestFlight/production renewal clocks (3 min/1 day/real-time per month). With one device + 2 TF users we can't simulate cohort-level refund behavior (need n>30 minimum), real-calendar auto-renewal lapse, or region-specific pricing (need accounts per storefront). RevenueCat benchmarks are cohort-derived; we cannot reproduce locally. Testable claim: any pre-launch A/B between paywall variants is statistical noise. Plan the first A/B as a post-launch PostHog feature-flag experiment, not a pre-ship decision.

### D2. React Compiler + RevenueCatUI native-view interaction

🟢 (`hooks/use-purchases.ts:22-29` lazy-loads via `require()`; [Expo New Architecture docs](https://docs.expo.dev/guides/new-architecture/); `docs/revenuecat-purchases-module-fix.md:42-53`). The v9 fix pattern `rnpModule.default ?? rnpModule` works at module-evaluation time. But:
- React Compiler memoizes around `usePurchases()` and hoists stable references (`useCallback`-wrapped `presentPaywall` at line 183). If a future RC SDK update changes module shape again, a memoized stale reference could stick across hot reload — a debug nightmare that looks like "paywall worked yesterday, not today".
- `RevenueCatUI.presentPaywall()` mounts a native Fabric view atop the React tree. New Architecture's view-flattening can interact badly with modal-presented native controllers during re-renders. 🟡 (extrapolated — no confirmed RC tracker bug, but the v9 export bug shows RC's RN adapter has had subtle RN incompatibilities).
- Testable claim: lock `react-native-purchases-ui` version in `package.json`; flag any upgrade as "revalidate paywall end-to-end" PR. Template is the existing `pnpm.overrides` on `react-native-nitro-modules@0.32.2`.

### D3. Concrete bug: `hasCompletedOnboarding` staleness on paywall retry loop

🟢 (`stores/onboarding-store.ts:26,54-56`; `hooks/use-auth-guard.ts:60-62`; `app/onboarding.tsx:67-86`; `convex/user.ts:74-100`; `providers/onboarding-provider.tsx:105-109`).

**Reproduction steps:**

1. User finishes intake, taps Choose Plan in `app/onboarding.tsx`.
2. `presentPaywall()` returns `"purchased"` (line 67). `completeOnboarding()` mutation fires server-side (line 68).
3. `syncToServer` inside `hooks/use-purchases.ts:147-166` fails because Convex is briefly unreachable. Local `isPro` reverts to `false` (line 157). Server-side `hasCompletedOnboarding: true` is now committed.
4. `router.replace("/(tabs)")` runs. User lands on chat tab. `app/(tabs)/chat.tsx:43` sees `!isActive` → mounts `<Paywall />`.
5. User re-taps View Plans. `presentPaywall()` is called again. RC sees the entitlement cached → `NOT_PRESENTED` or instant `PURCHASED`.
6. `useAuthGuard` (lines 48-67) reads `hasCompletedOnboarding: true` from server — user **cannot be routed back to `/onboarding`** even though subscription sync failed.
7. `stores/onboarding-store.ts:26` (Zustand `hasCompletedOnboarding`) was never set — `app/onboarding.tsx` only calls the Convex mutation, not `useOnboardingStore.getState().completeOnboarding()`. Zustand flag is still `false`.
8. `providers/onboarding-provider.tsx:105-109` sees `hasCompleted=false` (Zustand) AND `serverOnboardingDone=true` (Convex) — condition matches, spotlight tour **starts immediately** while `<Paywall />` is still mounted.

**Symptom:** paywall modal + spotlight overlay stacked, with spotlight targets pointing at tab-bar buttons covered by the paywall. No way to dismiss either.

**Fix options:** (a) add `useOnboardingStore.getState().completeOnboarding()` in `app/onboarding.tsx:68` success path; (b) gate `OnboardingTrigger` on subscription-store state as well. Neither exists today.

---

## E. Testable claims summary

1. Screenshot-and-run turns net-negative below ~6.7% trial-start on OpenAI-generated plans.
2. `app/onboarding.tsx` can't distinguish plan-gen failure from paywall failure; instrument before "aha-first".
3. `stores/subscription-store.ts` has no trial state; with-card trial UX is blocked behind a 6-file refactor.
4. No-card trial is an app-local entitlement invisible to `convex/subscriptions.ts:syncFromClient`; new field + cron required.
5. Norway's 6-month active-notification duty is unimplemented (`lib/notifications.ts` + Convex cron absent).
6. `ENTITLEMENT_ID = "Fitbull Pro"` is a magic string in two files; rename without lockstep env update silently masks in prod.
7. `RevenueCatUI.presentPaywall()` has no fallback when the UI module fails; the v9 export bug proves it.
8. D3 bug reproduces by killing network between purchase and sync — concrete repro above.
9. Pre-launch A/B at n=2 TF users is statistical noise; first A/B must be post-launch PostHog-flagged.
10. `REVENUECAT_WEBHOOK_AUTH_TOKEN` absence silently kills the purchase-recovery path; audit before any trial ship.

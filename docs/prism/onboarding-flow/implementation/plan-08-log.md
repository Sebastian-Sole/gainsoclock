# Implementation Log: plan-08
Status: complete

## Summary
Shipped the S9 paywall interstitial + trial-start flow, the post-purchase trial-confirmation banner on home, the V1 Settings Privacy screen with per-consent withdrawal, and the Settings Delete-account flow with the full GDPR Art. 17 / Apple 5.1.1(v) cascade.

Key behaviours:
- Paywall interstitial renders header + Apple 3.1.2 disclosure + primary CTA above the fold. Copy branches on `checkTrialOrIntroDiscountEligibility` (`Start trial` when eligible, `Subscribe` otherwise) and includes the verbatim `Cancel anytime in Settings > Apple ID > Subscriptions.` line. Below the fold: Non-Promise Pledge accordion, Founder Letter accordion, Methodology link, and a tertiary skip at the same visual weight as Methodology. Accordion rows expose `accessibilityRole="button"` + `accessibilityState={{ expanded }}`. Reduce-Transparency swap is wired via `AccessibilityInfo`.
- Offline degrade uses an `AsyncStorage` price cache per storefront (`paywall:priceCache:v1`) plus a 3s `Promise.race` timeout on `getOfferings`. When both fail, disclosure falls back to *"Pricing will load when you're back online."* and the primary CTA is disabled. Skip remains enabled; `presentPaywall()` is never called offline.
- `RevenueCatUI` null fallback renders `<PaywallFallback>` with one button per offering package using `priceString` verbatim; fires `revenuecat_ui_unavailable`. `hooks/use-purchases.ts` gained `isRevenueCatUIAvailable()` and `purchasePackageRaw(pkg)` helpers to support this without changing the existing `presentPaywall` surface.
- Post-purchase: calls `checkStatus()` to force a client refresh (Risk #2 mitigation against webhook lag), captures `paywall_presented` + `trial_started`/`paid_converted`, and routes to `/(tabs)`.
- `TrialConfirmationBanner` renders when `subscription-store.status === "trial"` and `trialExpiresAt` is set. Auto-dismisses 24h after first show (persisted in `auth-cache-store`) + permanent X. Never computes trial-expiry logic client-side — it only reads `trialExpiresAt` for display (Offline-Sync #10).
- Settings Privacy toggles one row per consent purpose (`health_data_personalization`, `ai_coach_inference`, `analytics`) backed by `api.onboarding.withdrawConsent`. Analytics revoke calls `setAnalyticsConsent(false)` client-side which flips PostHog into `optOut()` + clears the pre-consent buffer. Server-side, `withdrawConsent` now also schedules `internal.posthogServer.deletePostHogUser` for analytics revokes, and `scheduleProfileErasure` now actually nulls body-stat fields on `userProfile`.
- Settings Delete-account is two-step (info → type-to-confirm) and, on success, runs the Convex cascade, calls `deleteAuthoredSamples()` when `clientCleanupHint.healthkit` comes back, wipes `AsyncStorage`, clears known `SecureStore` auth keys, calls `Purchases.logOut`, resets subscription + auth-cache stores + PostHog, signs out, and routes to sign-up.
- `convex/onboarding.deleteAccount` deletes every user-owned row across 14 tables (workoutSets, workoutLogExercises, templateExercises, planDays, chatMessages, workoutLogs, templates, exercises, userSettings, recipes, mealLogs, nutritionGoals, userOnboarding, userProfile, userSubscriptions, workoutPlans, chatConversations, onboardingAha, userConsents, aiSafetyIncidents) + the `users` row + schedules `internal.posthogServer.deletePostHogUser`.
- `convex/posthogServer.ts` is a new `"use node"` action that calls the PostHog REST delete endpoint with 3× linear-backoff retries. Failures are warned, not thrown, so they never block the mutation.
- `lib/healthkit.ts` gained `deleteAuthoredSamples()` — iOS-guarded, best-effort; wraps `deleteObjects` / `deleteSamples` on the native module.

## Files Created/Modified

### Created
- `components/paywall/paywall-interstitial.tsx` — S9 interstitial (props-driven, a11y, Reduce-Transparency aware).
- `components/paywall/paywall-fallback.tsx` — `RevenueCatUI`-null fallback screen.
- `components/paywall/founder-letter.tsx` — embedded founder narrative (≤300 words).
- `components/paywall/non-promise-pledge.tsx` — locked 4-bullet pledge.
- `components/home/trial-confirmation-banner.tsx` — trial banner with 24h auto + permanent X.
- `app/onboarding/paywall.tsx` — S9 route: offerings + eligibility + purchase orchestration.
- `app/settings/privacy.tsx` — consent withdrawal screen.
- `app/settings/delete-account.tsx` — two-step delete flow + client cascade.
- `convex/posthogServer.ts` — PostHog REST delete action (`"use node"`).
- `docs/prism/onboarding-flow/implementation/plan-08-log.md` — this log.

### Modified
- `app/onboarding/_layout.tsx` — registered `paywall` Stack screen.
- `app/(tabs)/index.tsx` — mounted `<TrialConfirmationBanner />` above the activation checklist.
- `app/settings/index.tsx` — added top-level Privacy and Delete-account rows (Apple 5.1.1(v) first-layer visibility).
- `convex/onboarding.ts` — fleshed out `deleteAccount` cascade; scheduled `posthogServer.deletePostHogUser` from analytics `withdrawConsent`.
- `convex/onboardingInternal.ts` — implemented `scheduleProfileErasure` (body-stat scrub + `dataSource: "manual"`).
- `hooks/use-purchases.ts` — added `isRevenueCatUIAvailable()` and `purchasePackageRaw(pkg)`.
- `lib/healthkit.ts` — added `deleteAuthoredSamples()` iOS helper.
- `stores/auth-cache-store.ts` — extended with persisted trial-banner dismissal state + full `clear()` wipe path.

## Tests

- `npx convex codegen` — clean (regenerated `_generated/api.d.ts` to include `posthogServer`).
- `npx tsc --noEmit` — clean (no errors across app code).
- `npx convex dev --once --typecheck=enable` — clean (`Convex functions ready!`).
- `pnpm lint` on plan-08-touched files — 0 errors, 2 pre-existing `Array<T>` warnings in `convex/onboarding.ts:16,18` (inherited from `assertBounds` signature, not introduced by this plan). Whole-repo lint also reports 3 pre-existing errors in `components/nutrition/today-tab.tsx` (unescaped quotes) — unrelated to this plan.
- No unit / Maestro runs executed. `testID`s wired on paywall primary CTA, skip, methodology link, accordions, fallback packages, trial banner dismiss/manage, and settings privacy/delete entries to feed plan-10 flows.

### Manual smoke / acceptance not executed here
Items requiring a dev client + Apple sandbox / HealthKit device or a seeded Convex user (eligible purchase, ineligible copy, offline degrade, `RevenueCatUI`-null fallback, per-consent revoke cascades, delete-account end-to-end) are left for plan-10 validation as specified.

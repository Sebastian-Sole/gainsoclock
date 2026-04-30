# Sub-Plan 08: Paywall Interstitial, Trial, + Settings Privacy & Deletion

## Dependencies
- **Requires:** plan-00 (`ENTITLEMENT_ID` constant), plan-01 (`withdrawConsent`, `deleteAccount` stub), plan-02 (state machine fully live; `hooks/use-purchases.ts` exposes `getOfferings` + `checkTrialOrIntroDiscountEligibility`; Resend cron in place for 48h email; exact-version pins on RC), plan-03 (analytics events), plan-07 (S8 Continue routes here; methodology page exists with scientific citations — this phase adds the founder-letter accordion embedding, not another page).
- **Blocks:** plan-09 (post-paywall activation checklist consumes trial confirmation banner state).

## Objective
Ship S9 — the paywall interstitial — and the trial-start flow, plus the V1-mandatory Settings surfaces for consent withdrawal and account deletion (Apple 5.1.1(v) + GDPR Art. 17 + Art. 7(3)). The interstitial carries the Apple 3.1.2 storefront-price disclosure above the fold, the Non-Promise Pledge below, the methodology link, and a tertiary skip. `checkTrialOrIntroDiscountEligibility` branches copy to prevent 3.1.2 bait-and-switch on reinstall. `RevenueCatUI` null-fallback is an in-component `Purchases.purchasePackage` button — not a scary alert. Offline paywall degrades gracefully with cached `priceString`. Post-purchase, the home-tab banner confirms the trial with ISO date. Settings privacy toggles each consent independently, and the delete-account cascade leaves no orphan rows across 10+ tables including PostHog + HealthKit externalUUID cleanup.

## Context

### Stack facts
- **RevenueCat:** `react-native-purchases` + `react-native-purchases-ui` pinned to exact versions (plan-02). `Purchases = rnpModule.default ?? rnpModule` lazy pattern preserved. `getOfferings` + `checkTrialOrIntroDiscountEligibility` are on `hooks/use-purchases.ts`.
- **Runtime:** Expo SDK 54, React Native 0.81, React 19, React Compiler on.
- **Router:** Expo Router 6. New routes: `app/onboarding/paywall.tsx` (S9), `app/settings/privacy.tsx`, `app/settings/delete-account.tsx`.
- **Convex:** `deleteAccount` cascade lives in `convex/onboarding.ts` (plan-01 stubbed; this phase fills the body) + `convex/posthogServer.ts` (delete API caller) + reuse `lib/healthkit.ts` for external-UUID sample cleanup.

### Coding conventions that apply here
- No `any`. RevenueCat types come from `@types/react-native-purchases` via the installed package.
- No `enum`. Subscription status literal union from `subscriptionStatusValidator` (plan-01).
- `getAuthUserId` on every new public Convex handler.
- Wrapper-only imports: `react-native-purchases` only through `hooks/use-purchases.ts`. Components in `components/paywall/*` take `priceString`, `introPriceString`, `trialLength`, `trialEligible`, `onCta`, `onSkip`, `onMethodology` as props — presentational.
- Accessibility: every interactive has `accessibilityLabel` + `accessibilityRole`. 3.1.2 disclosure must be readable in full (not clipped).
- Use RC's `priceString` verbatim. Never concatenate currency symbols manually (RC F9).

### Gate decisions + themes that apply
- **D6:** founder letter on paywall interstitial (embedded — non-colliding with methodology page which is scientific citations only).
- **D9:** interstitial carries Apple 3.1.2 disclosure + Non-Promise Pledge + Methodology link, followed by `RevenueCatUI.presentPaywall()` (or fallback).
- **UX #6:** interstitial hierarchy — above fold: header + 3.1.2 disclosure + primary CTA. Below fold: Non-Promise Pledge accordion + methodology + founder letter. Tertiary skip in footer, same weight as methodology link.
- **UX #12:** trial confirmation banner on home tab post-purchase: *"Trial active · 7 days free · ends {date}"*. Auto-dismiss 24h + permanent X. `trial_confirmation_shown` event.
- **RC F5:** `RevenueCatUI` null fallback → in-component `Purchases.purchasePackage(pkg)` button fed from `getOfferings()`. `revenuecat_ui_unavailable` event.
- **RC F6:** `checkTrialOrIntroDiscountEligibility([annualSKU])` branches copy.
  - Eligible → *"7 days free, then {priceString}/{period}. Cancel anytime in Settings > Apple ID > Subscriptions."*
  - Ineligible → *"{priceString}/{period}, cancel anytime."*
- **RC F9:** `priceString` pass-through from `Purchases.getOfferings()`. Iceland renders `$X.XX` USD fallback.
- **Offline-Sync #7:** offline paywall degrade — cached `priceString` or *"Pricing will load when you're back online."*; disable primary CTA; skip enabled; never call `presentPaywall()` offline.
- **Security CR3 / HealthKit-Privacy CR5:** withdrawal UI ships in V1. Per-consent toggles with revoke cascade (data-stop + PostHog delete + profile erasure scheduling on health withdrawal).
- **HealthKit-Privacy C4 / Theme F:** `deleteAccount()` cascade includes all app-owned tables + PostHog delete API + OpenAI zero-retention header + HealthKit `externalUUID` sample cleanup.
- **Mobile-A11y #13:** `AccessibilityInfo.setAccessibilityFocus` after `presentPaywall()` dismissal.
- **Mobile-A11y #14:** Reduce Transparency fallback to opaque `bg-background` on any `BlurView` or `bg-*/80` in the interstitial.

### Files this sub-plan touches
- **New (routes):**
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/paywall.tsx` (S9)
  - `/Users/sebastiansole/Documents/gainsoclock/app/settings/privacy.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/settings/delete-account.tsx`
- **New (components):**
  - `/Users/sebastiansole/Documents/gainsoclock/components/paywall/paywall-interstitial.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/paywall/paywall-fallback.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/paywall/founder-letter.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/paywall/non-promise-pledge.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/home/trial-confirmation-banner.tsx`
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/onboarding.ts` — flesh out `deleteAccount` cascade; `withdrawConsent` cascade tightening.
  - `/Users/sebastiansole/Documents/gainsoclock/app/(tabs)/index.tsx` — mount `<TrialConfirmationBanner>` (plan-09 takes this further with the Mural checklist).
  - `/Users/sebastiansole/Documents/gainsoclock/stores/auth-cache-store.ts` — cascade `clear()` extended for full wipe path.
- **New (Convex):**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/posthogServer.ts` — PostHog delete API caller (node action).
- **Methodology page** already shipped by plan-07 (`app/methodology.tsx`) with citations. Plan-08 extends it (or the paywall interstitial) with the sub-processors list if not present, and adds the founder letter accordion to the interstitial.
- **Dependencies:** may need `pnpm add react-native-purchases-ui` if absent (plan-02 pinned; this phase consumes).

### Data contracts

**`components/paywall/paywall-interstitial.tsx`:**
```tsx
export function PaywallInterstitial({
  priceString,         // e.g. "kr 499"
  introPriceString,    // optional intro (e.g. "kr 0 for 7 days")
  trialLength,         // "7 days" when eligible
  trialEligible,       // boolean
  subscriptionPeriod,  // { unit: "year"|"month", numberOfUnits: 1 }
  onCta,
  onSkip,
  onMethodology,
}: PaywallInterstitialProps): JSX.Element;
```
- **Above fold** (visible without scroll on iPhone 12):
  - Header: *"Fitbull Pro."*
  - Supporting copy: *"Plans that adapt to your week. Coach on call."*
  - 3.1.2 disclosure (verbatim per eligibility):
    - Eligible: *"7 days free, then {priceString}/{period}. Cancel anytime in Settings > Apple ID > Subscriptions."*
    - Ineligible: *"{priceString}/{period}, cancel anytime in Settings > Apple ID > Subscriptions."*
  - Primary CTA: *"Start trial"* (eligible) / *"Subscribe"* (ineligible).
- **Below fold:**
  - Non-Promise Pledge accordion (collapsed by default): *"4 things we promise — tap to read"*. Expanded copy comes from `components/paywall/non-promise-pledge.tsx`.
  - Methodology link: *"How we build your plan"* → routes to `/methodology`.
  - Founder letter accordion (collapsed by default): *"A note from the founder"* → `components/paywall/founder-letter.tsx`.
  - Tertiary skip: *"I'll decide later"* — same visual weight as methodology link, NOT grey-underlined.
- **Accessibility:** 3.1.2 copy readable in full (no truncation). Accordion rows `accessibilityRole="button"`, `accessibilityState={{ expanded }}`. After `presentPaywall()` dismissal, `AccessibilityInfo.setAccessibilityFocus(headingRef)`.
- **Reduce Transparency (Mobile-A11y #14):** if the interstitial uses `BlurView` or `bg-*/80`, swap to `bg-background` when `AccessibilityInfo.isReduceTransparencyEnabled()` is true.

**Paywall screen flow — `app/onboarding/paywall.tsx`:**
1. On mount: `useQuery(api.onboarding.getProfile)` + `hooks/use-purchases.ts::getOfferings()`.
2. Compute `trialEligible = await checkTrialOrIntroDiscountEligibility([annualSKU])`.
3. Compute `priceString, introPriceString, subscriptionPeriod` from the offering's annual package — use RC's `priceString` verbatim.
4. Capture `paywall_interstitial_shown { trialEligible }`.
5. Render `<PaywallInterstitial>` with callbacks:
   - `onCta`: check `RevenueCatUI` module availability.
     - If available: `await RevenueCatUI.presentPaywall({ offering })`. On `PAYWALL_RESULT.PURCHASED` → continue to post-purchase flow. On dismissal without purchase → stay on S9.
     - If null: capture `revenuecat_ui_unavailable`; render `<PaywallFallback>` (separate screen/modal) with in-component `Purchases.purchasePackage(pkg)` button.
   - `onSkip`: capture `plan_continue_tapped` (reuse existing event) with a new subprop if needed; `router.replace("/(tabs)")` (no trial started — state stays `free`).
   - `onMethodology`: `router.push("/methodology")`.
6. On `PAYWALL_RESULT.PURCHASED`:
   - Capture `paywall_presented { placementId: "onboarding_default" }` and `trial_started { source: "rc_intro" }` (eligible) or `paid_converted { productId }` (ineligible).
   - `router.replace("/(tabs)")`.
   - Mount trial-confirmation banner on home tab; analytics `trial_confirmation_shown`.
7. **Offline (Offline-Sync #7):**
   - If `getOfferings()` fails or times out after 3s: render interstitial with last-known cached `priceString` (AsyncStorage, keyed by storefront — store on each successful fetch). If no cache, substitute *"Pricing will load when you're back online."* and disable primary CTA; skip still enabled. Do NOT call `presentPaywall()` offline.

**`components/paywall/paywall-fallback.tsx`:**
```tsx
export function PaywallFallback({ offering, onPurchase, onSkip }: {
  offering: PurchasesOffering;
  onPurchase: (pkg: PurchasesPackage) => void;
  onSkip: () => void;
}): JSX.Element;
```
- Renders the offering packages as buttons (one per package — typically annual + monthly).
- Each button shows `priceString` + period + trial eligibility copy.
- On tap → `Purchases.purchasePackage(pkg)`.
- Used when `RevenueCatUI` is null at runtime.

**`components/paywall/non-promise-pledge.tsx`:**
- Four bullets (locked copy — "Non-Promise Pledge"):
  1. *"No gimmicks — no before/after photos. Progressive overload."*
  2. *"No guilt trips — miss a session, we adjust next time."*
  3. *"No lock-in — cancel anytime in Settings."*
  4. *"No surveillance — body stats stay on device and EU servers."*

**`components/paywall/founder-letter.tsx`:**
- Embedded mission-narrative copy (distinct from methodology — which is citations). Keep under 300 words. Author: Sebastian. Prose is Strava-dry per UX #14.

**`components/home/trial-confirmation-banner.tsx`:**
- Renders only when `subscription-store.status === "trial"` AND the row's `trialExpiresAt` is set AND banner not permanently dismissed AND auto-dismiss 24h not elapsed.
- Copy: *"Trial active · 7 days free · ends {new Date(trialExpiresAt).toLocaleDateString()}"*. *"Manage in Settings"* link to `/settings`.
- Auto-dismiss 24h from first show (persisted in Zustand); permanent X dismiss (persisted).
- Analytics: `trial_confirmation_shown` on first render.

**`app/settings/privacy.tsx`:**
- Reads `useQuery(api.onboarding.getConsents)`.
- Renders three toggles (one per purpose) with current granted/revoked state.
- Toggle action → call `useMutation(api.onboarding.withdrawConsent)({ purpose })`.
- Cascade effects (server side; see Convex section below):
  - `ai_coach_inference` revoke → mark in-flight `onboardingAha` rows `failed`; future aha actions refuse.
  - `health_data_personalization` revoke → schedule `internal.onboardingInternal.scheduleProfileErasure`.
  - `analytics` revoke → client calls `posthog.optOut()` + schedules `internal.posthogServer.deletePostHogUser`.
- User remains signed in. Show a toast with `ERROR_COPY` or a success confirmation ("Consent withdrawn").
- **Accessibility:** each toggle `accessibilityRole="switch"`, `accessibilityState={{ checked }}`, `accessibilityLabel` includes the full consent sentence from `lib/consent.ts`.

**`app/settings/delete-account.tsx`:**
- Apple 5.1.1(v) surface. Two-step:
  1. Info screen: *"Delete your account and all data. This can't be undone."* + list of what is deleted. Confirm button.
  2. Re-auth prompt (SIWA/email) → call `useMutation(api.onboarding.deleteAccount)`.
- On success: sign out + `auth-cache-store.clear()` bulk wipe + AsyncStorage full wipe + `expo-secure-store` clear + `posthog.reset()` → navigate to sign-up.

**`convex/onboarding.deleteAccount` cascade:**
Inside the mutation (`getAuthUserId` first):
1. `users` — delete row.
2. `userProfile` — delete by `userId`.
3. `userConsents` — delete all rows for userId.
4. `userOnboarding` — delete row.
5. `userSubscriptions` — delete row.
6. `chatConversations` + `chatMessages` — delete all for userId.
7. `workoutPlans` + `workoutLogs` — delete all for userId.
8. `onboardingAha` — delete all rows.
9. `aiSafetyIncidents` — delete all rows.
10. Schedule `internal.posthogServer.deletePostHogUser({ distinctId: userId })`.
11. Schedule HealthKit external-UUID cleanup on client-side via a mutation return flag (`clientCleanupHint: { healthkit: true }`) — the client's delete-account screen then invokes `lib/healthkit.deleteAuthoredSamples(userId)` if `Platform.OS === "ios"`.
12. Return.

All deletes paginate via `paginate` / `collect` on the relevant indexes. Run within a single mutation where possible; if size exceeds Convex limits, use `ctx.scheduler.runAfter(0, internal.onboarding.continueDeletion, { userId, cursor })` pattern.

**`convex/posthogServer.ts`:**
- `"use node"`. Calls PostHog REST delete API.
- Env: `POSTHOG_API_KEY` (server-scoped; plan-03 env enumeration).

**`lib/healthkit.ts` — add `deleteAuthoredSamples(userId)`:**
- Issues `deleteObjects(predicate: HKQueryMatchExternalUUID(userId))` for every sample Fitbull wrote.
- iOS-only; no-op elsewhere.

**Environment variable:**
- Reuse `POSTHOG_API_KEY` from plan-03.
- Reuse RC keys from plan-02 (`REVENUECAT_WEBHOOK_AUTH_TOKEN*`, `EXPO_PUBLIC_REVENUECAT_API_KEY`).

### Gotchas (from reviews)

- **RC F5 / Theme M:** `RevenueCatUI` null isn't an exception to catch — it's a runtime module-shape check. On some EAS builds the module resolves as undefined. `paywall-fallback.tsx` is a real, styled, purchase-capable screen — not a scary alert.
- **RC F4:** `Purchases = rnpModule.default ?? rnpModule` MUST stay. Same module may be pulled in both `react-native-purchases` and `react-native-purchases-ui`; do not assume one resolves the other.
- **RC F9:** never concatenate currency symbols. Use `priceString` directly. Iceland falls back to USD because Apple treats Iceland via USD for IAPs in some configurations — documented edge case, render `priceString` as-is.
- **Offline-Sync #7:** do NOT call `presentPaywall()` offline. It hangs. The interstitial degrades; the primary CTA is disabled; skip still works.
- **Offline-Sync #10:** the client NEVER evaluates `Date.now() > trialExpiresAt` for status purposes. The banner displays `trialExpiresAt` as text ("ends {date}") — that's read-only display, not a state transition.
- **UX #12:** banner auto-dismiss 24h + permanent X. Do not show it every launch for 7 days — that's nagging.
- **UX #6:** 3.1.2 disclosure must be ABOVE the fold. Apple review gates on this. Do not tuck it below the accordion.
- **Apple 5.1.1(v):** delete-account path must be visible from first-layer Settings, not buried three layers deep. Put a top-level entry.
- **Security CR3:** `withdrawConsent` must NOT sign the user out. The session persists; only data flows change.
- **Art. 17 cascade:** missing a single table (e.g. `chatMessages`) is a compliance failure. Enumerate explicitly.
- **PostHog delete:** the REST call is best-effort — network failures must not block the mutation. Schedule via `ctx.scheduler.runAfter(0, ...)` to decouple.

## Implementation

1. **Create `components/paywall/non-promise-pledge.tsx` + `components/paywall/founder-letter.tsx`.**
   - **What:** locked copy per Data contracts.
   - **Test:** `npx tsc --noEmit`.

2. **Create `components/paywall/paywall-interstitial.tsx`.**
   - **What:** per Data contract. Layout above/below fold. Accordions via `@rn-primitives/accordion` or existing primitive.
   - **Accessibility:** 3.1.2 text rendered in a `<Text>` that supports Dynamic Type; no `numberOfLines` clip.
   - **Reduce Transparency:** swap `bg-*/80` → `bg-background` if enabled.
   - **Test:** `npx tsc --noEmit`.

3. **Create `components/paywall/paywall-fallback.tsx`.**
   - **What:** per Data contract. Renders offering packages as a list of buttons.
   - **Test:** `npx tsc --noEmit`.

4. **Create `app/onboarding/paywall.tsx`.**
   - **What:** compose interstitial + fallback + RC calls per Data contract.
   - **Approach:** use `hooks/use-purchases.ts::getOfferings()` (plan-02). Cache `priceString` per storefront in AsyncStorage for offline degrade. 3s timeout on getOfferings via `Promise.race`.
   - **Analytics:** `paywall_interstitial_shown`, `paywall_presented`, `trial_started`, `paid_converted`, `revenuecat_ui_unavailable` at the right sites.
   - **Test:** `npx tsc --noEmit`; manual — happy eligible path on a dev Apple ID; ineligible (reinstalled account); offline (Network Link Conditioner); `RevenueCatUI` null (force-null in dev via a module patch).

5. **Create `components/home/trial-confirmation-banner.tsx`.**
   - **What:** per Data contract.
   - **Approach:** read `subscription-store` for `status` + `trialExpiresAt`. Persist dismissal state in Zustand (`auth-cache-store` is fine, add a slice).
   - **Test:** `npx tsc --noEmit`.

6. **Mount banner in `app/(tabs)/index.tsx`.**
   - **What:** inject `<TrialConfirmationBanner />` at the top of the home layout. Plan-09 adds the Mural checklist below — coordinate file layout.
   - **Test:** manual on dev user with a trial-active row.

7. **Create `app/settings/privacy.tsx`.**
   - **What:** per Data contract. Three toggles. Withdraw calls `useMutation(api.onboarding.withdrawConsent)`.
   - **Accessibility:** switches announce state.
   - **Test:** manual — toggle each consent; verify cascade (aha refuses after revoking `ai_coach_inference`).

8. **Flesh out `convex/onboarding.withdrawConsent` cascade.**
   - **What:** plan-01 shipped the basic append. This phase:
     - On `ai_coach_inference` revoke: patch existing `onboardingAha` rows → `status: "failed"`, `error: "consent_revoked"` (already done in plan-01).
     - On `health_data_personalization` revoke: `ctx.scheduler.runAfter(0, internal.onboardingInternal.scheduleProfileErasure, { userId })`.
     - On `analytics` revoke: `ctx.scheduler.runAfter(0, internal.posthogServer.deletePostHogUser, { distinctId: userId })`.
   - **Test:** REPL exercise for each purpose.

9. **Create `convex/posthogServer.ts`.**
   - **What:** `"use node"`; `deletePostHogUser({ distinctId })` action that calls PostHog REST delete API.
   - **Test:** `pnpm convex:dev`; manual with a test distinctId.

10. **Flesh out `convex/onboarding.deleteAccount`.**
    - **What:** full cascade per Data contract.
    - **Approach:** paginate each table delete. Return `clientCleanupHint: { healthkit: true }` so the client performs HealthKit externalUUID cleanup.
    - **Test:** dev REPL — seed a user with rows in every table; call `deleteAccount`; verify zero rows remain in each table.

11. **Add `lib/healthkit.deleteAuthoredSamples`.**
    - **What:** per Data contract. iOS-only; guard with `Platform.OS === "ios"`.
    - **Test:** dev device with authored samples; call → samples gone from Apple Health.

12. **Create `app/settings/delete-account.tsx`.**
    - **What:** per Data contract. Two-step confirm + delete. On success: sign out + `auth-cache-store.clear()` + AsyncStorage wipe + `expo-secure-store.clear()` + `posthog.reset()` → navigate to sign-up.
    - **Test:** manual — end-to-end deletion; confirm Convex dashboard shows zero rows.

13. **Wire Settings entry points.**
    - **File:** `app/settings/index.tsx` (the existing root Settings page).
    - **What:** add rows for "Privacy" → `/settings/privacy` and "Delete account" → `/settings/delete-account`. Both top-level (Apple 5.1.1(v) visibility).
    - **Test:** manual.

14. **Email copy templates (coordinating with plan-02).**
    - **What:** plan-02 wired Resend. This phase confirms copy strings for:
      - 48h trial reminder: *"Your Fitbull trial ends in 48 hours. Manage or cancel in Settings > Apple ID > Subscriptions."*
      - DCSA 6-monthly reminder (Nordic): *"Fitbull — 6-month subscription reminder. Your subscription is active. Cancel anytime in Settings > Apple ID > Subscriptions."*
      - Unsubscribe success: *"You won't receive further legal reminders from Fitbull via email. We'll use an in-app reminder instead."*
    - **Test:** send each via dev action.

### Test discipline
- Step 2: visual review on iPhone 12 + iPhone SE.
- Step 4: happy + ineligible + offline + null-UI paths.
- Step 8: REPL cascade verification.
- Step 10: Convex dashboard after deletion — zero rows across 10+ tables.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `app/onboarding/paywall.tsx`, `components/paywall/paywall-interstitial.tsx`, `components/paywall/paywall-fallback.tsx`, `components/paywall/non-promise-pledge.tsx`, `components/paywall/founder-letter.tsx` all exist.
- [ ] Code: 3.1.2 disclosure above the fold with eligibility-branched copy.
- [ ] Code: accordions for Non-Promise Pledge + Founder Letter below the fold.
- [ ] Code: methodology link routes to `/methodology`; tertiary skip has same weight as methodology link.
- [ ] Code: `RevenueCatUI` null branch renders `<PaywallFallback>` + fires `revenuecat_ui_unavailable`.
- [ ] Code: offline branch uses cached `priceString` or "Pricing will load when online" + disables primary CTA.
- [ ] Code: `priceString` passed through verbatim; no manual concatenation.
- [ ] Code: `components/home/trial-confirmation-banner.tsx` mounts on `(tabs)/index.tsx` when `status === "trial"`; auto-dismiss 24h + permanent X.
- [ ] Code: `app/settings/privacy.tsx` — three toggles backed by `withdrawConsent`.
- [ ] Code: `app/settings/delete-account.tsx` — two-step confirm + cascade.
- [ ] Code: `convex/onboarding.deleteAccount` cascade covers `users`, `userProfile`, `userConsents`, `userOnboarding`, `userSubscriptions`, `chatConversations`, `chatMessages`, `workoutPlans`, `workoutLogs`, `onboardingAha`, `aiSafetyIncidents`.
- [ ] Code: `convex/posthogServer.deletePostHogUser` scheduled from deleteAccount + analytics withdrawal.
- [ ] Code: `lib/healthkit.deleteAuthoredSamples` iOS-guarded.
- [ ] Code: Apple 3.1.2 copy verbatim — including *"Cancel anytime in Settings > Apple ID > Subscriptions."*
- [ ] Analytics: `paywall_interstitial_shown { trialEligible }`, `paywall_presented { placementId }`, `trial_started { source }`, `paid_converted { productId }`, `revenuecat_ui_unavailable`, `trial_confirmation_shown` fire at correct sites.
- [ ] Accessibility: 3.1.2 copy readable in full at Accessibility XXL (no clip). Accordions announce expanded state. Toggles announce state. Focus management after paywall dismissal.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Maestro: `testID` props in place for plan-10 flows (`05-trial-start.yaml`, `04-consent-revoke.yaml`, `06-account-delete.yaml`).
- [ ] Manual smoke:
  - Eligible trial: S8 Continue → interstitial → Start trial → Apple sheet → confirm → home tab with banner. `subscription-store.status === "trial"`.
  - Ineligible: same path; copy lacks free-trial line.
  - Offline: interstitial shows cached priceString or fallback copy; CTA disabled.
  - `RevenueCatUI` null: fallback screen renders with package buttons.
  - Withdraw `ai_coach_inference`: aha action refuses; existing `onboardingAha` rows marked failed.
  - Withdraw `health_data_personalization`: profile erasure scheduled; log row visible in Convex dashboard.
  - Withdraw `analytics`: `posthog.optOut()` fires; delete request scheduled.
  - Delete account: post-confirmation, 10+ tables show zero rows for the userId; PostHog delete queued; HealthKit externalUUID samples gone.
  - Sign-out cascade: after logout, AsyncStorage + secure-storage + posthog state all clear.
- [ ] Out-of-scope: Mural checklist UX (plan-09); pre-ship tests + citations DOI verification (plan-10); custom `<NativePaywall>` (V1.1).

## Risks

- **Risk:** Apple review flags 3.1.2 copy as insufficient.
  - **Detect:** review feedback.
  - **Mitigate:** copy follows Apple's recommended template verbatim. If rejected, add a longer variant.
  - **Escalate:** hotfix with a second sentence.

- **Risk:** `PAYWALL_RESULT.PURCHASED` fires client-side but the webhook hasn't landed — banner shows but `subscription-store.status` still `free`.
  - **Detect:** race condition on fresh purchase.
  - **Mitigate:** after `PAYWALL_RESULT.PURCHASED`, call `syncCustomerInfo()` explicitly to force a client-side refresh; the webhook catches up server-side. Banner reads from `subscription-store` which reflects whichever landed first.
  - **Escalate:** if race persists, defer banner render by 1s.

- **Risk:** delete-account cascade times out on users with huge `chatMessages` history.
  - **Detect:** Convex mutation timeout.
  - **Mitigate:** paginate deletion; `ctx.scheduler.runAfter(0, internal.onboarding.continueDeletion, { userId, cursor })` continuation pattern.
  - **Escalate:** document the continuation in the PR.

- **Risk:** PostHog delete API is rate-limited and fails silently.
  - **Detect:** post-deletion audit shows user data still in PostHog.
  - **Mitigate:** `deletePostHogUser` retries 3× with exponential backoff. Logs on failure for manual follow-up.
  - **Escalate:** if failures > 1%, expose a support-ticket fallback.

- **Risk:** HealthKit externalUUID cleanup fails because the user revoked HealthKit access before account deletion.
  - **Detect:** device-side error.
  - **Mitigate:** wrap the cleanup in try/catch; log failure to a client-side queue for retry on next HealthKit auth event. Server-side deletion is the primary compliance; HK cleanup is best-effort.
  - **Escalate:** document limitation in compliance notes.

- **Risk:** trial banner persists past 24h because Zustand persistence didn't land.
  - **Detect:** users see banner on day 2.
  - **Mitigate:** `auth-cache-store` already uses `persist`; verify the banner dismiss slice is included in `partialize`.
  - **Escalate:** add a `firstShownAt` server column if client-side persistence is unreliable.

- **Risk:** `components/paywall.tsx` (the existing component — not plan-02's modified file) still holds the old `isPro` boolean check and collides with S9 flow.
  - **Detect:** code review.
  - **Mitigate:** plan-02 migrated `components/paywall.tsx` to state-machine reads. This phase does not touch that file; the S9 interstitial is a new component.
  - **Escalate:** if stale, re-run plan-02 migration before merging.

- **Risk:** Iceland USD fallback surprises Nordic users.
  - **Detect:** plan-10 manual on Iceland Apple ID.
  - **Mitigate:** `priceString` is Apple's — we display what Apple gave us. Document as expected behaviour.
  - **Escalate:** if Apple changes Iceland behaviour, recalibrate.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. Manual smoke:
   - Eligible trial end-to-end; banner appears.
   - Ineligible copy variant.
   - Offline degrade.
   - Null-UI fallback.
   - Consent withdrawal (each of 3 purposes) with cascade verified.
   - Delete-account cascade — verify all 10+ tables empty for the userId.
5. VoiceOver smoke: interstitial + both Settings screens.
6. Maestro `testID` props in place.
7. Report diffs, including the deletion audit row count.

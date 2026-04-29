# Implementation Log: plan-04
Status: complete

## Summary

Shipped the Auth UI + Sign-in-with-Apple surface per plan-04:

- **Apple Sign-In**: `expo-apple-authentication` installed and wrapped in
  `components/auth/apple-sign-in-button.tsx`. Renders Apple's native button
  on iOS only, returns `null` on other platforms. The wrapper requests
  `FULL_NAME` + `EMAIL` scopes and calls upstream handlers with the
  credential. Cancel errors are swallowed; `siwa_email_collision` is routed
  to `onCollision`.
- **Sign-up screen refactor** (`app/(auth)/sign-up.tsx`): SIWA primary →
  divider → email + password fields (labeled via `nativeID` /
  `accessibilityLabelledBy`) → Art. 13 notice with tappable Privacy / Terms
  links → submit → "Already have an account? Sign in" → skeptic side-door
  ("Experienced lifter? Skip to the app"). Skeptic calls
  `api.onboarding.completeOnboardingV2` with defaulted goals/experience/days
  and all three consents set to `false`, then `router.replace("/(tabs)")`.
- **Sign-in screen refactor** (`app/(auth)/sign-in.tsx`): SIWA primary →
  divider → email + password → submit → "Create account". Mounts
  `AbandonmentRecoveryInterstitial` which checks the intake draft for
  non-empty content, `userIdPartition` match, < 7d freshness, and
  `hasCompletedOnboarding === false`. Continue routes to the last
  populated intake step; Start over clears the draft and routes to
  `/onboarding/goal`. Analytics: `intake_resumed` / `intake_restarted`.
- **Analytics**: `intake_started` on sign-up mount (also on sign-in when a
  returning user still has pending onboarding), `auth_method_selected`,
  `auth_succeeded`, and `skipped_to_app` wired at the correct callsites.
- **Privacy notice-at-collection (GDPR Art. 13)**: `lib/privacy-notice.ts`
  exports the short notice copy, the support email, and the SIWA collision
  copy. Notice renders ABOVE the sign-up submit button with tappable links
  to `/legal/privacy` and `/legal/terms`; both routes added as minimal
  placeholder screens that link to the hosted policy.
- **SIWA collision branch** (`convex/auth.ts`): added a
  `callbacks.createOrUpdateUser` override that, when Apple signs in with a
  new `sub` and the email is non-relay, looks up existing users by email
  and refuses to auto-link when they have a non-Apple `authAccounts` row.
  Throws `Error("siwa_email_collision")`; client maps to
  `SIWA_COLLISION_COPY`. Documented in `docs/siwa-email-collision.md`.
- **`app.json`**: added `expo.ios.usesAppleSignIn: true` and locked the
  HealthKit usage strings (both on `ios.infoPlist` for Apple config
  surfacing and on the HealthKit plugin config so they match).
- **Accessibility**: every `Pressable` has `accessibilityLabel` +
  `accessibilityRole`; skeptic link uses `accessibilityRole="link"` with an
  `accessibilityHint` distinct from the SIWA label. Submit targets meet
  44×44 pt via `min-h-[44px]`. After SIWA / email auth success the headings
  receive `AccessibilityInfo.setAccessibilityFocus`. The abandonment
  dialog sets `accessibilityViewIsModal`.
- **`testID` props** on SIWA buttons, skeptic link, submits, and
  interstitial actions for plan-10 Maestro flows.

## Files Created/Modified

**Created**
- `components/auth/apple-sign-in-button.tsx`
- `components/auth/abandonment-recovery-interstitial.tsx`
- `lib/privacy-notice.ts`
- `app/legal/privacy.tsx`
- `app/legal/terms.tsx`
- `docs/siwa-email-collision.md`

**Modified**
- `app/(auth)/sign-up.tsx`
- `app/(auth)/sign-in.tsx`
- `convex/auth.ts`
- `app.json`
- `package.json` / `pnpm-lock.yaml` (dependency add)

**Dependencies**
- `expo-apple-authentication@~8.0.8` (added via `npx expo install`).

## Tests

- **Typecheck (app)**: `npx tsc --noEmit` — plan-04 files pass. Remaining
  errors (`convex/http.ts`, `convex/subscriptions.ts`,
  `convex/subscriptionCrons.ts`, `convex/crons.ts`) are pre-existing in
  files this sub-plan did not touch and are owned by plan-03 / later.
- **Typecheck (convex)**: `npx tsc -p convex/tsconfig.json --noEmit` —
  `convex/auth.ts` passes. Same pre-existing unrelated failures persist.
- **Lint**: `pnpm exec eslint` over every file this plan created or
  modified (`apple-sign-in-button.tsx`, `abandonment-recovery-interstitial.tsx`,
  `sign-up.tsx`, `sign-in.tsx`, `legal/privacy.tsx`, `legal/terms.tsx`,
  `lib/privacy-notice.ts`, `convex/auth.ts`) — no warnings or errors. The
  wider `pnpm lint` is red on pre-existing chat/nutrition/workout warnings
  and three `react/no-unescaped-entities` errors in
  `components/nutrition/today-tab.tsx`; none touched here.
- **`app.json`**: `JSON.parse(app.json)` succeeds.
- **`pnpm convex:dev`**: not invoked in this pass — it requires live
  Convex dev credentials that were out of scope for the automated
  implementation loop. The file passes the project's own tsconfig check.
- **Manual smoke / Maestro**: out of scope for a headless implementation
  run. `testID` props are in place for plan-10 Maestro flows.

## Notes / follow-ups

- The SIWA success path posts `signIn("apple", { id_token: credential.identityToken })`
  to `@convex-dev/auth`. If the `0.0.90` runtime rejects that call shape
  for native SIWA (the repo previously used the OAuth redirect flow in
  `sign-in.tsx`), the server-side `createOrUpdateUser` collision branch
  still fires correctly, but the client call signature may need
  adjustment during plan-10 smoke. Recorded as a risk in
  `docs/siwa-email-collision.md`.
- Apple Developer portal SIWA entitlement: manual step for Sebastian
  before the next TestFlight build.
- The `lastScreen` draft field mentioned in the sub-plan is not yet
  persisted by the intake screens (plan-05 owns that). The interstitial
  infers the last-reached step from which draft fields are populated, so
  it works without plan-05 but will pick up the explicit `lastScreen`
  path once plan-05 writes it.

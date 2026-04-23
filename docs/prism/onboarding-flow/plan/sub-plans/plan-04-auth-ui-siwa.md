# Sub-Plan 04: Auth UI + Sign-in-with-Apple

## Dependencies
- **Requires:** plan-00 (reactive onboarding-status hook; legacy boolean flags gone), plan-01 (`completeOnboardingV2` available for the skeptic side-door to write a defaulted profile), plan-03 (analytics ready — `auth_method_selected`/`auth_succeeded`/`skipped_to_app` events).
- **Blocks:** plan-05 (intake screens route from S1 sign-up; abandonment-recovery interstitial lives on S1).

## Objective
Put Sign-in-with-Apple as the primary auth path in front of every user, add the skeptic side-door for experienced lifters who want to bypass intake, and harden the auth screens for accessibility and Apple review. Server-side SIWA plumbing already exists in `convex/auth.ts:10-21` — this phase ships the client UI, the collision handling for SIWA ↔ email accounts that share an address, the privacy-notice-at-collection legal surface (GDPR Art. 13), and the Apple config (`usesAppleSignIn: true` + HealthKit usage strings promoted from plan-06 so they land in the right `app.json` diff).

## Context

### Stack facts
- **Runtime:** Expo SDK 54, React Native 0.81, React 19, React Compiler on.
- **Native module:** `expo-apple-authentication` — native SIWA button with platform-correct contrast/Dynamic Type. iOS-only; gate with `Platform.OS === "ios"` (SIWA on Android via web is out of V1).
- **Auth backend:** `@convex-dev/auth`. Existing sign-up/sign-in handlers in `convex/auth.ts` accept Apple + email-password providers.
- **Router:** Expo Router 6. Auth routes are `app/(auth)/sign-up.tsx`, `app/(auth)/sign-in.tsx`.
- **Config:** `app.json` is the app config source of truth (not `app.config.ts`). `usesAppleSignIn: true` + HealthKit usage strings live there.

### Coding conventions that apply here
- No `any`. SIWA credential types come from `expo-apple-authentication`.
- `Platform.OS === "ios"` guard; SIWA button does not render on Android/web (which are out of V1 anyway, but defensive).
- Every interactive element: `accessibilityLabel` + `accessibilityRole`. Minimum touch target 44×44pt; `components/ui/button.tsx`'s `default` size is already compliant — use it.
- `components/ui/label.tsx` precedes every `<TextInput>` with `nativeID`/`accessibilityLabelledBy`. Placeholder is not a label.
- SIWA: render Apple's native button via `expo-apple-authentication`'s `<AppleAuthentication.AppleAuthenticationButton>` — don't roll a custom one (platform-correct contrast + Dynamic Type depend on it).
- Wrapper-only imports: SIWA logic lives in `components/auth/apple-sign-in-button.tsx`; screens import that wrapper, not `expo-apple-authentication` directly.

### Gate decisions + themes that apply
- **D4:** SIWA is the primary auth method.
- **UX #8:** skeptic side-door at S1 bottom — *"Experienced lifter? Skip to the app"*. Routes to `/(tabs)` after writing a defaulted `userProfile` + `hasCompletedOnboarding = true`, with `userConsents` NOT written (no consent rows means the aha action refuses — Mural item 1 for this cohort becomes "Enable AI personalisation" in plan-09).
- **UX #11 (abandonment recovery):** on relaunch with non-empty intake draft < 7d old and `hasCompletedOnboarding === false`, show *"Welcome back. Pick up where you left off?"* with Continue / Start over. Post-consent users who exited before the paywall land on aha directly. S1 is the mount point for this interstitial — this phase ships it.
- **Mobile-A11y #8:** secondary sign-in link labelled "Already have an account? Sign in" (not duplicating the SIWA label).
- **Mobile-A11y #13:** after SIWA success, call `AccessibilityInfo.setAccessibilityFocus()` on destination's first heading.
- **Security CR5 / Obs #5 (SIWA collision):** `convex/auth.ts` callback detects when a SIWA `sub` has no existing user but a same-email row exists (non-relay). Surface support path copy rather than silent double-account. `@privaterelay.appleid.com` is authoritative identity.
- **Performance #5:** cold-start → sign-up interactive ≤ 2.2s (verified in plan-10 with the full budget).
- **Privacy notice-at-collection (GDPR Art. 13):** Privacy + Terms links tappable ABOVE the submit button on S1.

### Files this sub-plan touches
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/app/(auth)/sign-up.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/(auth)/sign-in.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/convex/auth.ts` (collision branch)
  - `/Users/sebastiansole/Documents/gainsoclock/app.json` (`usesAppleSignIn: true`, HealthKit usage strings — locked verbatim below, used by plan-06)
- **New:**
  - `/Users/sebastiansole/Documents/gainsoclock/components/auth/apple-sign-in-button.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/auth/abandonment-recovery-interstitial.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/lib/privacy-notice.ts` (copy constants for Art. 13 notice)
- **Dependencies:** `pnpm add expo-apple-authentication` (if not already present via Expo SDK bundle).

### Data contracts

**`components/auth/apple-sign-in-button.tsx`:**
```tsx
export function AppleSignInButton({
  onSuccess, onError, onCollision, // onCollision fires when server returns { code: "siwa_email_collision" }
}: {
  onSuccess: (credential: AppleAuthentication.AppleAuthenticationCredential) => void;
  onError: (err: unknown) => void;
  onCollision: () => void;
}): JSX.Element;
```
- Renders `<AppleAuthentication.AppleAuthenticationButton>` with `buttonType: SIGN_IN`, `buttonStyle: BLACK` in light theme / `WHITE` in dark, corner radius matching `components/ui/button.tsx`.
- Calls `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL] })`.
- On success, passes credential upstream (the screen calls the Convex `@convex-dev/auth` sign-in action).
- Platform guard: returns `null` on non-iOS.

**SIWA collision branch in `convex/auth.ts`:**
- When `@convex-dev/auth` resolves Apple `sub` → no existing user but a same-email row exists via the email-password provider AND the email is not in the `@privaterelay.appleid.com` TLD → throw a typed error `{ code: "siwa_email_collision", message: "..." }`.
- Client catches the error in `onCollision` and surfaces copy: *"This email is already used for sign-in with a password. Please sign in with email first, or contact support@fitbull.app to link Apple."* No silent double-account creation.
- If `@convex-dev/auth@0.0.90` exposes an account-linking primitive, wire it; else the collision branch is the V1 documented behaviour. Phase 4 pre-flight investigation result documented in the PR description.

**Skeptic side-door:**
- Below SIWA button on S1: a tertiary link *"Experienced lifter? Skip to the app"* — same styling weight as a methodology link, not grey-underlined.
- On tap:
  1. Ensure a user identity exists. If the user has already signed in via SIWA or email, proceed. If not, prompt SIWA first — the side-door is a post-auth shortcut, not an unauthenticated bypass (we still need a `userId` to write a profile).
  2. Call `api.onboarding.completeOnboardingV2` with defaulted args:
     ```ts
     {
       clientIntakeId: newClientId(),
       goals: ["stronger"], primaryGoal: "stronger",
       experience: "experienced",
       trainingDaysOfWeek: [1,3,5],
       dataSource: "manual",
       consents: { health_data_personalization: false, ai_coach_inference: false, analytics: false },
       consentVersionHash: await computeCombinedHash(),
     }
     ```
  3. Capture `skipped_to_app { reason: "experienced_lifter" }`.
  4. `router.replace("/(tabs)")`.
- Rationale: defaulted consents are `false` — the user can turn on personalisation from Settings (plan-08) or the Mural checklist (plan-09). The aha action refuses without `ai_coach_inference` consent.

**Abandonment recovery interstitial:**
- On `(auth)/sign-in.tsx` (or `sign-up.tsx` for the returning-user case) mount: check `intake-draft-store` for non-empty draft + `userIdPartition` matching current user + `lastTouchedAt` within 7d + `hasCompletedOnboarding === false` (from `useOnboardingStatus`).
- If all true: render a modal-style interstitial from `components/auth/abandonment-recovery-interstitial.tsx`:
  - Title: *"Welcome back."*
  - Body: *"Pick up where you left off?"*
  - Primary: `Continue` → route to last-seen screen (stored in draft as `lastScreen: "goal" | "experience" | ...`).
  - Secondary: `Start over` → `clearDraft()` + route to `/onboarding/goal`.
  - Capture `intake_resumed` on Continue; `intake_restarted` on Start over.
- If S6 completed but paywall-exited: skip the interstitial; route directly to aha (`/onboarding/aha`). The onboarding-status hook tells us `hasCompletedOnboarding === true`; `auth-guard` then handles.

**Privacy notice-at-collection (Art. 13):**
- `lib/privacy-notice.ts`:
  ```ts
  export const PRIVACY_NOTICE_SHORT =
    "By signing up you agree to our Privacy Policy and Terms.";
  export const SUPPORT_EMAIL = "support@fitbull.app";
  ```
- Render above the submit button with `<Pressable>` wrappers around `Privacy` and `Terms` that route to `/legal/privacy` and `/legal/terms` respectively. Both are existing routes; if they don't exist, create minimal placeholder screens that link to the hosted policy (do NOT inline the whole policy here — out of scope).

**`app.json` diff:**
```json
{
  "expo": {
    "ios": {
      "usesAppleSignIn": true,
      "infoPlist": {
        "NSHealthShareUsageDescription": "Fitbull reads your weight, height, and body-fat percentage from Apple Health so you don't have to re-enter them. We never read sleep, heart rate, cycle, or workout data.",
        "NSHealthUpdateUsageDescription": "Fitbull writes your completed strength workouts and estimated active energy to Apple Health so they count toward your Fitness rings."
      }
    }
  }
}
```
- Replace the current vague strings in `app.json:48-49`.
- Verify Apple Developer team entitlement for SIWA is enabled before TestFlight (manual step for Sebastian — document in PR).
- The HealthKit strings land here for Apple config reasons even though plan-06 is the HealthKit owner; coordinate by citing plan-06 in the PR.

**Accessibility details:**
- SIWA button: native, no extra `accessibilityLabel` needed (VoiceOver announces "Sign in with Apple" natively).
- Secondary sign-in link: `accessibilityLabel="Already have an account? Sign in"`, `accessibilityRole="link"`.
- Skeptic link: `accessibilityLabel="Experienced lifter? Skip to the app"`, `accessibilityRole="link"`, `accessibilityHint="Skip setup and use a default profile"`.
- After SIWA success, `AccessibilityInfo.setAccessibilityFocus(headingRef.current)` on the destination screen's first heading.
- Touch target audit: every `Pressable` has effective area ≥ 44×44pt via `hitSlop` if visual height is smaller.

### Gotchas (from reviews)

- **Security CR5:** relay emails (`@privaterelay.appleid.com`) are the authoritative identity — never surface the relay address as the user's "real" email in UI copy.
- **Mobile-A11y #8:** the secondary sign-in link MUST NOT duplicate the SIWA label; VoiceOver rotor-sweep would then land on two "Sign in with Apple" items.
- **UX #11:** the abandonment interstitial's 7-day cutoff is load-bearing — older drafts are stale and likely contain outdated self-perception (user's goals shift; copy hash may be stale). Auto-clear; don't resurface.
- **Performance #5:** the SIWA button imports are heavy — lazy the `apple-sign-in-button.tsx` module only if necessary. Measure cold-start in plan-10.
- **Apple review:** Art. 13 notice-at-collection must be visible at or above the submit button. Putting it in a tucked-away "Learn more" link is a Apple review risk.
- **Convex auth flow:** the SIWA credential from `expo-apple-authentication` passes to `@convex-dev/auth`'s Apple provider. Do not re-implement the JWT verification client-side.

## Implementation

1. **Install `expo-apple-authentication`.**
   - `pnpm add expo-apple-authentication` (if absent).
   - Run `expo install` to sync peers.
   - **Test:** `pnpm lint`; `npx tsc --noEmit`.

2. **Create `lib/privacy-notice.ts`.**
   - **What:** per Data contract.
   - **Test:** `npx tsc --noEmit`.

3. **Create `components/auth/apple-sign-in-button.tsx`.**
   - **What:** per Data contract. iOS guard returns `null` on non-iOS.
   - **Approach:** wrap the native button; surface SIWA credential upstream. Do not handle the Convex sign-in call in the component — keep it presentational; screens own the action call.
   - **Test:** `npx tsc --noEmit`.

4. **Refactor `app/(auth)/sign-up.tsx`.**
   - **What:** layout from top to bottom:
     - Heading.
     - Copy: *"One account, syncs across iPhone and iPad. We don't share your data with advertisers."*
     - SIWA button (primary).
     - Or-divider.
     - Email + password fields (`<Label>` + `<Input>` with `nativeID`/`accessibilityLabelledBy`).
     - Privacy + Terms tappable text (Art. 13) — ABOVE submit.
     - Submit button.
     - Tertiary link: *"Already have an account? Sign in"* (disambiguated label, `accessibilityRole="link"`).
     - Tertiary link: *"Experienced lifter? Skip to the app"* (skeptic side-door).
   - **Approach:** `<ScrollView>` to handle small screens + Dynamic Type. Keyboard-avoiding view for the password field.
   - **Analytics:** on mount, `capture({ name: "intake_started", props: {} })` (buffered by plan-03 until analytics consent). On SIWA tap, `capture({ name: "auth_method_selected", props: { method: "apple" } })`; on email-submit, same with `"email"`. On success, `auth_succeeded`. On skeptic link tap, `skipped_to_app`.
   - **Accessibility:** every `Pressable` has `accessibilityLabel` + `accessibilityRole`. After SIWA success, focus destination heading via `AccessibilityInfo.setAccessibilityFocus`.
   - **Test:** `npx tsc --noEmit`; manual smoke on iPhone simulator — SIWA succeeds; email path succeeds; skeptic link writes defaulted profile and routes to tabs.

5. **Refactor `app/(auth)/sign-in.tsx`.**
   - **What:** similar layout; SIWA primary + email secondary + tertiary "Create account" link. No skeptic link here (side-door is a sign-up-path thing).
   - **Abandonment recovery:** on mount, if draft conditions met, show `<AbandonmentRecoveryInterstitial>` as a modal overlay.
   - **Analytics:** `intake_resumed` / `intake_restarted` on interstitial actions.
   - **Test:** `npx tsc --noEmit`; manual smoke — with a seeded draft, verify interstitial appears; with an expired draft (>7d), verify auto-clear + normal sign-in.

6. **Create `components/auth/abandonment-recovery-interstitial.tsx`.**
   - **What:** modal-style overlay per Data contract.
   - **Approach:** use `@rn-primitives/dialog` or existing modal primitive in `components/ui/`. `accessibilityViewIsModal={true}`.
   - **Test:** `npx tsc --noEmit`.

7. **Extend `convex/auth.ts` with collision branch.**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/convex/auth.ts`
   - **What:** in the Apple provider callback (current code around lines 10–21), after resolving the SIWA `sub`:
     - Query `users.by_email(email)`; if a row exists with a different authentication provider (email-password) AND the email is NOT `@privaterelay.appleid.com`, throw a typed error `{ code: "siwa_email_collision" }`.
     - Client catches the error (`components/auth/apple-sign-in-button.tsx` passes it up via `onError`; screens map to `onCollision`).
   - **Approach:** if `@convex-dev/auth@0.0.90` has a linking primitive, investigate in the PR; otherwise document the V1 behaviour in PR description. Result of investigation goes in `docs/revenuecat-webhook-rotation.md`-sibling: create `docs/siwa-email-collision.md` with the decision.
   - **Test:** `pnpm convex:dev`; dev-harness: sign up with email `a@b.com` (password); then attempt SIWA where the Apple account's email is `a@b.com` (non-relay) — expect collision error.

8. **Update `app.json`.**
   - **What:** per Data contract. `usesAppleSignIn: true`, HealthKit usage strings locked.
   - **Approach:** diff-only — don't rewrite unrelated config. Verify the Apple Developer portal entitlement is enabled (manual, for Sebastian).
   - **Test:** `expo prebuild --platform ios` regenerates `ios/` correctly (don't actually run prebuild in this phase if it would conflict; verify the JSON is well-formed).

### Test discipline
- After step 4: manual simulator boot — SIWA succeeds; email path succeeds.
- After step 5: draft-resume test with dev harness (seed draft via dev button; kill app; relaunch).
- After step 7: Convex dev REPL with collision scenario.
- After step 8: `npx expo-doctor` if convenient; at minimum `JSON.parse(fs.readFileSync("app.json"))` is clean.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `components/auth/apple-sign-in-button.tsx` exists; renders Apple's native button on iOS; returns null on non-iOS.
- [ ] Code: `app/(auth)/sign-up.tsx` shows SIWA primary, email secondary, Privacy + Terms above submit, skeptic link below.
- [ ] Code: `app/(auth)/sign-in.tsx` shows SIWA primary, email secondary, `AbandonmentRecoveryInterstitial` modal on mount when conditions met.
- [ ] Code: `components/auth/abandonment-recovery-interstitial.tsx` exists with Continue / Start over actions, 7-day staleness check, analytics events on either action.
- [ ] Code: `convex/auth.ts` throws `{ code: "siwa_email_collision" }` on SIWA↔email address collision for non-relay emails.
- [ ] Code: `app.json` has `usesAppleSignIn: true` under `expo.ios` and the locked HealthKit usage strings under `expo.ios.infoPlist`.
- [ ] Accessibility: every interactive element has `accessibilityLabel` + `accessibilityRole`. Skeptic link distinguishes from SIWA via label. Submit is 44×44pt.
- [ ] Accessibility: after SIWA success, destination's first heading receives `AccessibilityInfo.setAccessibilityFocus`.
- [ ] Analytics: `auth_method_selected`, `auth_succeeded`, `skipped_to_app`, `intake_started`, `intake_resumed`, `intake_restarted` wired at the correct call sites.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Maestro: `.maestro/onboarding/01-signup-siwa.yaml` passes on iOS simulator (flow owner: plan-10 assembles these, but plan-04 must leave `testID` props on the SIWA button wrapper and the skeptic link).
- [ ] Manual smoke:
  - SIWA happy path: Apple Hide My Email relay succeeds; profile created; onboarding status flips to `pending`; router lands on S2.
  - Email happy path: sign up → S2.
  - Skeptic side-door: after auth, tap skips to `/(tabs)` with defaulted profile written. `useOnboardingStatus` returns `"complete"`. Aha action refuses (no consent) — verified separately in plan-07 smoke.
  - Abandonment recovery: seed draft, relaunch, see interstitial, Continue routes to last-seen screen. 7-day-old draft auto-clears.
  - Collision: email `a@b.com` with password → SIWA with same non-relay email → collision copy surfaces, no double account.
- [ ] Env/config: SIWA entitlement enabled in Apple Developer portal (manual check; note in PR).
- [ ] Out-of-scope: the actual intake screens S2–S6 (plan-05); the legal text of the privacy/terms pages (existing or placeholder only).

## Risks

- **Risk:** SIWA entitlement missing on the developer portal; TestFlight rejects the build.
  - **Detect:** build fails or Apple review flags it.
  - **Mitigate:** Sebastian enables the entitlement before submitting the next TF build. PR description includes a checkbox.
  - **Escalate:** if the portal access is the blocker, pause TF submission — do not ship SIWA UI without the entitlement.

- **Risk:** `expo-apple-authentication` version drift with Expo SDK 54.
  - **Detect:** native build failure; Metro warning on import.
  - **Mitigate:** install via `expo install expo-apple-authentication` (not `pnpm add` directly) so the SDK's version resolver picks a compatible release.
  - **Escalate:** RC F4-style exact-pin for this module if drift recurs.

- **Risk:** skeptic side-door writes defaulted profile for a user who then changes their mind — they still see Mural checklist item 1 as "Enable AI personalisation" forever.
  - **Detect:** user feedback.
  - **Mitigate:** Mural item 1 dismisses on tap (plan-09 handles). Documented UX trade-off per gate.
  - **Escalate:** if conversion data in plan-10 shows the skeptic cohort has lower 7-day retention than expected, revisit item 1 copy in V1.1.

- **Risk:** collision branch triggers on relay emails accidentally because a future Apple change shifts relay TLDs.
  - **Detect:** inbound support emails about "I can't sign in with Apple any more."
  - **Mitigate:** the TLD check is `endsWith("@privaterelay.appleid.com")`. If Apple adds new relay TLDs, update the list.
  - **Escalate:** quick hotfix; this is a tight loop.

- **Risk:** the abandonment interstitial blocks sign-in entirely (modal can't be dismissed on tight simulator screens).
  - **Detect:** Maestro fails; manual test reveals trapped users.
  - **Mitigate:** `Start over` is always available and clears draft. Also provide a `Pressable` on the backdrop that acts as "dismiss without action" — but note: dismissing-without-action means the draft persists and the interstitial returns on next launch. Document behaviour.
  - **Escalate:** if users get stuck, add a 10s auto-dismiss.

- **Risk:** HealthKit usage strings land in `app.json` here but plan-06 changes them.
  - **Detect:** merge conflict.
  - **Mitigate:** the strings are LOCKED in this phase (verbatim from master plan S0). Plan-06 must not modify them; it depends on them being in place.
  - **Escalate:** coordinate via PR linkage.

- **Risk:** Apple review: Art. 13 notice is above submit but the copy is too terse and Apple's reviewer pushes back.
  - **Detect:** review feedback.
  - **Mitigate:** `PRIVACY_NOTICE_SHORT` is one sentence plus tappable links to full docs — meets Art. 13 notice-at-collection. The short notice is informational; the full doc fulfills the detailed disclosure. If Apple wants more on-surface copy, we have room below the short notice to expand in a V1.0.1 patch.
  - **Escalate:** if rejected, add a second sentence per Apple's guidance.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. Maestro: `.maestro/onboarding/01-signup-siwa.yaml` (if already scaffolded by plan-10; else add `testID` props for plan-10 to consume).
5. Manual smoke:
   - SIWA happy path (Hide My Email) → S2.
   - Email happy path → S2.
   - Skeptic side-door → `/(tabs)` with defaulted profile; `useOnboardingStatus` = complete.
   - Abandonment interstitial on relaunch with seeded draft.
   - Collision copy on SIWA↔email clash.
6. VoiceOver smoke: rotor-sweep the sign-up screen; every element announces with a unique, meaningful label; SIWA button works; `setAccessibilityFocus` lands on the destination heading after success.
7. Report diffs: `app.json` diff, new files, collision branch location.

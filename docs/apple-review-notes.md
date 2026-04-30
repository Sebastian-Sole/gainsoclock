# Apple Review Notes — Fitbull V1.0

Draft responses to anticipated App Review queries. Paste relevant section
into the "Notes" field of the submission, or into a reviewer reply if
rejected.

Keep this file updated per release.

---

## 3.1.2 — Subscriptions: disclosure

**Expected question:** "The subscription terms aren't clearly disclosed
before purchase."

**Response:**

> The subscription interstitial is `app/onboarding/paywall.tsx` (shown
> immediately after the personalised plan reveal on S8). Above the fold the
> user sees:
>
> - Trial length (7 days free).
> - Price and billing period in the user's local currency (rendered from
>   `priceString` returned by RevenueCat / StoreKit, not hardcoded).
> - Cancellation path ("Cancel anytime in Settings → Subscriptions").
> - Auto-renewal disclosure.
>
> Links to the full Terms of Service and Privacy Policy are on the same
> screen (`app/legal/terms.tsx`, `app/legal/privacy.tsx`). The Restore
> Purchases affordance (`testID=paywall-restore`) is visible on both the
> onboarding paywall and `app/settings/index.tsx`.

**Evidence reviewer can check:**
- Screen recording of onboarding → paywall in the submitted build.
- Screenshots in ASC media.

---

## 5.1.3 — Health data handling

**Expected question:** "How is HealthKit data used? Is any data sent to a
third party?"

**Response:**

> HealthKit is read-only, iOS-only, and opt-in. The primer is
> `app/onboarding/healthkit.tsx`; the system permission sheet appears only
> after the user taps "Connect". If they dismiss, we route to manual entry
> (`app/onboarding/manual-stats.tsx`) — no body stat is required for the
> app to be usable (see 4.2 below).
>
> Usage descriptions in `app.json`:
>
> - `NSHealthShareUsageDescription` — read-only: age, weight, height, body
>   fat percentage. Used to prefill onboarding so the user doesn't retype
>   data they already have.
> - `NSHealthUpdateUsageDescription` — not requested in V1.0.
>
> Data residency: all Convex functions run in the EU region. User rows
> containing body stats are stored in EU Convex. We do NOT forward body
> stats to PostHog (they are on the replay denylist: `S5`, `S5a`, `S5b`,
> `S7`, `S8`). Sub-processors are enumerated on the methodology page
> (`app/methodology.tsx` → "Sub-processors" section).

---

## 4.2 — Minimum functionality

**Expected question:** "The app's core value is behind a paywall; what can a
non-paying user do?"

**Response:**

> The personalised plan reveal (aha moment — `app/onboarding/aha.tsx`) is
> shown BEFORE the paywall and remains available after the paywall is
> dismissed. A non-paying user can:
>
> - See their personalised calorie / schedule / summary plan.
> - Log workouts and view their history (Mural).
> - Chat with the AI coach (rate-limited free tier).
> - View stats, track weight, use the calculator tools.
>
> The paywall unlocks advanced coach turns, meal planning, and premium
> imports. The "skeptic-skip" Maestro flow
> (`.maestro/onboarding/09-skeptic-skip.yaml`) demonstrates that the
> skeptic path terminates on a fully-usable home tab without any purchase
> or optional consent.

---

## 5.1.1(v) — Account deletion

**Expected question:** "The account deletion path must be reachable from
within the app and delete all user data."

**Response:**

> Path: `app/settings/index.tsx` → "Delete account" (top section, visible
> without scrolling on iPhone SE). The confirmation sheet calls
> `convex/user.ts` → `deleteAccount` which:
>
> - Deletes all user rows across every domain table (intake, consent,
>   workouts, meals, plans, coach messages, subscription, sessions).
> - Calls PostHog `/api/person/{distinct_id}/` DELETE to purge analytics.
> - Calls the HealthKit `externalUUID` cleanup in `lib/healthkit.ts`.
> - Invalidates RevenueCat appUserID via REST.
>
> Confirmation is synchronous; the user is signed out on completion. The
> flow is exercised by a Maestro critical-path flow in
> `.maestro/settings/delete-account.yaml` (to be added if reviewer asks
> for video evidence).

---

## General notes

- Privacy Nutrition Label: see `docs/privacy-nutrition-label.md` for the
  exact declared categories in ASC.
- Age gate: 13+ at sign-up (`components/onboarding/age-gate-block.tsx`).
  Per-region stricter gates (16+ in NO/SE/DK under Art. 8 GDPR) are applied
  at consent step (`app/onboarding/consent.tsx`), documented in
  `docs/compliance/age-gate.md`.
- TestFlight contact: sebastian.solelt@gmail.com for reviewer questions.

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

> HealthKit is iOS-only and opt-in, with two separately-authorized tiers:
>
> 1. **Baseline (onboarding)** — read-only body stats (weight, height,
>    body-fat %) to prefill onboarding, plus write access for completed
>    workouts / active energy so they count toward Fitness rings. The
>    primer is `app/onboarding/healthkit.tsx`; per 5.1.1(iv) (resolved in
>    submission 44d05ba8) it has a single Continue CTA that requests
>    access and always advances regardless of the user's choice. No body
>    stat is required for the app to be usable (see 4.2 below).
> 2. **Import (Settings → Apple Health → "Import workouts & health
>    data")** — incremental, read-only authorization for workouts from
>    other apps/devices, sleep, resting heart rate, HRV, steps, and
>    active energy. Requested only when the user enables this toggle,
>    whose visible copy describes exactly these types
>    (`lib/healthkit.ts` → `HEALTHKIT_IMPORT_READ_SCOPES`). The
>    onboarding permission sheet never lists these scopes.
>
> Usage descriptions in `app.json` match the tiers above
> (`NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`).
>
> Health data and AI: imported health metrics are included in AI-coach
> context **only** when the user's `health_data_personalization` consent
> (collected at onboarding, revocable in Settings → Privacy & Consent) is
> granted — enforced server-side in `convex/healthData.ts`
> (`hasHealthPersonalizationConsent`); the gate covers chat context,
> weekly review generation, and post-workout feedback. Displaying the
> user's own imported data back to them (History timeline, weekly review
> stats) is core functionality of the import toggle.
>
> Data residency: all Convex functions run in the EU region. User rows
> containing body stats and imported health metrics are stored in EU
> Convex. We do NOT forward body stats or health metrics to PostHog (replay
> denylist: `S5`, `S5a`, `S5b`, `S7`, `S8`). Meal photos taken for
> AI-assisted logging are stored transiently in Convex storage and deleted
> after the meal is logged or the flow is canceled
> (`convex/nutritionVision.ts` → `discardMealPhoto`); the image is sent to
> OpenAI (existing AI sub-processor) solely to produce the macro estimate.
> Sub-processors are enumerated on the methodology page
> (`app/methodology.tsx` → "Sub-processors" section).

---

## 4.2 — Minimum functionality

**Expected question:** "The app's core value is behind a paywall; what can a
non-paying user do?"

**Response:**

> The pre-paywall experience (demo screens — `app/onboarding/demo-chat.tsx`,
> `demo-meals.tsx`, `demo-workouts.tsx`, plus `founder-note.tsx`) is shown
> BEFORE the soft paywall. The paywall is non-blocking: every outcome
> (purchase, dismissal, or unauthenticated fall-through) routes to the home
> tabs via `router.replace('/(tabs)')` (`app/onboarding/paywall.tsx:64,181`).
> A non-paying user can:
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
> `api.onboarding.deleteAccount` (`app/settings/delete-account.tsx:44`),
> which schedules the internal cascade `deleteAccountCascade`
> (`convex/onboarding.ts:500-630`). The cascade:
>
> - Deletes user rows across the workout, template, exercise, meal, recipe,
>   nutrition-goal, plan, chat, subscription, profile, consent, onboarding,
>   AI-safety-incident, and `@convex-dev/auth` session/account tables, then
>   the user row.
> - Calls PostHog `deletePostHogUser` to purge analytics.
> - Returns `clientCleanupHint.healthkit` so the client performs the
>   HealthKit `externalUUID` cleanup.
>
> Known gap (under remediation): the cascade does NOT currently delete
> `externalWorkouts`, `healthDailyMetrics`, or `weeklyReviews`. See
> `docs/compliance/age-gate-status.md` for the full deletion-coverage matrix
> and severity note. Do not assert synchronous deletion of imported Apple
> Health data until that gap is closed.
>
> The cascade is asynchronous (paginated across Convex limits); the client
> signs out immediately on completion. A Maestro critical-path flow
> (`.maestro/settings/delete-account.yaml`) can be added if the reviewer
> asks for video evidence.

---

## General notes

- Privacy Nutrition Label: see `docs/privacy-nutrition-label.md` for the
  exact declared categories in ASC.
- Age gate: decision of record is 16+ (`docs/compliance/age-gate.md`).
  Current enforcement status is under review — see
  `docs/compliance/age-gate-status.md`. Do not assert that an in-app age gate
  is active until that status is resolved.
- TestFlight contact: sebastian.solelt@gmail.com for reviewer questions.

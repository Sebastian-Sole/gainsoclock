# Privacy Nutrition Label — Fitbull V1.0

This is the declared-in-ASC label for App Store Connect → App Privacy.
Source of truth for what Fitbull collects and why. Every category below
maps to a concrete collection point in the codebase.

Attach ASC "Data Collection" screenshot to the pre-ship PR and link here:
<link>.

---

## Summary

| Heading | Declared? |
|---|---|
| Data Used to Track You | **No** |
| Data Linked to You | **Yes** — see categories below |
| Data Not Linked to You | No |

We do NOT track users across apps/websites owned by other companies. We do
NOT run advertising. PostHog events are first-party analytics, retained
for product improvement only; no identifier-matching with third-party
ad networks.

---

## Declared categories — Linked to You

### Health & Fitness

- **Purpose:** App Functionality.
- **Data types:**
  - Health & Fitness (body stats: age, weight, height, body fat %)
  - Fitness (workout logs, sets, reps, RPE, heart rate if provided)
  - Health & Fitness — imported via the opt-in "Import workouts & health
    data" toggle (Settings → Apple Health): workouts from other
    apps/devices, sleep duration, resting heart rate, HRV, step count,
    active energy. Stored in `externalWorkouts` / `healthDailyMetrics`
    (EU Convex).
- **Legal basis:** Art. 9 GDPR (explicit consent) for body stats and health
  data; Art. 6 GDPR for workout logs. Imported health metrics enter
  AI-coach prompts only under the `health_data_personalization` consent
  (enforced in `convex/healthData.ts`).
- **Collection point:**
  - `app/onboarding/healthkit.tsx` (HealthKit read / stats step)
  - `components/home/healthkit-reask-card.tsx` (day-3 re-ask)
  - `convex/onboarding.ts` → `updateHealthStats` (body-stats persistence)
  - `convex/onboardingInternal.ts` → intake persistence
  - `hooks/use-health-import.ts` → `convex/healthData.ts` (import sync)
- **Retention:** account lifetime; intended to be deleted on account
  deletion (5.1.1(v) path). NOTE: as of `4500535` the deletion cascade does
  not yet cover the imported-health tables (`externalWorkouts`,
  `healthDailyMetrics`) — verification in progress, see
  `docs/compliance/age-gate-status.md` matrix.

### Identifiers

- **Purpose:** Analytics.
- **Data types:**
  - User ID (Convex `userId`)
  - Device ID: **none** — we explicitly do NOT read IDFV/IDFA.
  - PostHog `distinct_id` (generated per install, not tied to device)
- **Collection point:** `lib/analytics.ts` / `providers/posthog-provider.tsx`
- **Retention:** 180 days for PostHog events; purged on account delete.

### User Content

- **Purpose:** App Functionality.
- **Data types:**
  - Other User Content — chat messages with AI coach, aha intake answers,
    workout notes, saved recipes, logged meals (incl. AI-estimated macros).
  - Photos — meal photos taken for AI-assisted logging. **Transient:**
    uploaded to Convex storage, sent to OpenAI (sub-processor) for the
    macro estimate only, and deleted when the meal is logged or the flow
    is canceled (`convex/nutritionVision.ts` → `discardMealPhoto`). Not
    retained, not used for training, not shared further. Declare under
    "Photos or Videos" → App Functionality in ASC.
- **Collection point:**
  - `convex/chatActions.ts` (coach chat, incl. log_meal tool)
  - `convex/onboardingInternal.ts` (intake)
  - `convex/workoutLogs.ts` (workouts)
  - `convex/nutritionVision.ts` / `convex/mealLogs.ts` (meal logging)
- **Retention:** account lifetime; deleted on account deletion. Meal
  photos: transient (above).

### Contact Info

- **Purpose:** App Functionality.
- **Data types:**
  - Email Address — collected only on the email sign-up path. SIWA users
    use Apple's relay email (Apple documentation treats relay email as
    email for label purposes).
- **Collection point:** `app/(auth)/sign-up.tsx` + `convex/auth.ts`
- **Retention:** account lifetime.

---

## NOT collected (explicit)

- Advertising data.
- Precise location.
- Approximate location.
- Browsing history.
- Search history.
- Purchases (we receive RevenueCat webhook events but treat them as
  entitlement state, not as purchase-history analytics).
- Contacts.
- Sensitive info beyond Art. 9 health data above (no political, religious,
  or sexual-orientation categories).

---

## Tracking declaration

- Data Used to Track You: **None**.

Fitbull does NOT link user or device data from this app with data from
other companies' apps, websites, or offline properties for targeted
advertising or measurement. We do NOT share data with data brokers.

---

## Verification checklist

- [ ] ASC "Data Collection" screen matches every row above.
- [ ] Screenshot attached to `docs/perf/preship-measurements.md`
      §Env-var enumeration section (same PR).
- [ ] Replay denylist (`S5`, `S5a`, `S5b`, `S7`, `S8`, `S11`, `auth`) is
      in effect — verified by first-50-user replay review.
- [ ] Delete-account path purges PostHog (5.1.1(v) response).

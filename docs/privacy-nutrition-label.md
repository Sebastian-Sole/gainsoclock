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
- **Legal basis:** Art. 9 GDPR (explicit consent) for body stats and health
  data; Art. 6 GDPR for workout logs.
- **Collection point:**
  - `app/onboarding/healthkit-prefill.tsx` (HealthKit read)
  - `app/onboarding/manual-stats.tsx` (manual entry)
  - `convex/onboardingInternal.ts` → intake persistence
- **Retention:** account lifetime; deleted synchronously on account
  deletion (5.1.1(v) path).

### Identifiers

- **Purpose:** Analytics.
- **Data types:**
  - User ID (Convex `userId`)
  - Device ID: **none** — we explicitly do NOT read IDFV/IDFA.
  - PostHog `distinct_id` (generated per install, not tied to device)
- **Collection point:** `lib/analytics.ts` / `providers/analytics-provider.tsx`
- **Retention:** 180 days for PostHog events; purged on account delete.

### User Content

- **Purpose:** App Functionality.
- **Data types:**
  - Other User Content — chat messages with AI coach, aha intake answers,
    workout notes, saved recipes.
- **Collection point:**
  - `convex/chatActions.ts` (coach chat)
  - `convex/onboardingInternal.ts` (intake)
  - `convex/workoutLogs.ts` (workouts)
- **Retention:** account lifetime; deleted on account deletion.

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

# HealthKit & Privacy Review — Onboarding Master Plan (v2 re-review)

**Reviewer persona:** HealthKit & Privacy (Apple App Review privacy manager lens)
**Target:** `docs/prism/onboarding-flow/plan/master-plan.md` (revised)
**Prior review:** v1 (2026-04-21) — 5 critical + 6 concerns + open questions
**Date:** 2026-04-21
**Verdict:** **APPROVED**

---

## Summary

The revised plan resolves all five v1 critical items head-on and also addresses the six supporting concerns. The fixes are not cosmetic: the HealthKit firewall type form is now load-bearing, session replay is denylisted on every Art. 9-bearing screen, the OpenAI transmission is disclosed as a US sub-processor with SCC basis in the S6 checkbox label, the two `Info.plist` usage strings are rewritten to mirror `lib/healthkit.ts:40-50` and locked into Phase 6 + Phase 10, the Settings withdrawal path ships in Phase 8 of V1, and the Art. 17 erasure cascade is specified comprehensively with HealthKit `externalUUID` sample cleanup, PostHog delete-API, and OpenAI ZDR headers. The plan now survives both an Apple App Review 5.1.3 + 5.1.1(v) audit and a Datatilsynet Art. 9/13/17 inspection at the level a plan can defensibly carry before implementation.

---

## v1 Resolved

### CR1 — HealthKit firewall type guard (Resolved)

Master plan §3.3 (lines 434-444) now uses:

```
type NoHealthKitFields<T> = Extract<keyof T, ForbiddenKeys> extends never ? T : never;
export function capture<E extends AnalyticsEvent>(
  event: E & { props: NoHealthKitFields<E["props"]> }
): void { ... }
```

This is the correct distributive form. When `T = { weightKg: number; screen: string }`, `Extract<"weightKg"|"screen", ForbiddenKeys>` is `"weightKg"` (not `never`), so the conditional resolves to `never` and the `props` constraint fails at the call site — exactly the v1 ask. `NoHealthKitFields` is now *applied* to the `capture()` signature (v1 caught that it was defined but unused). `ForbiddenKeys` extends to the derived metrics I called out: `activityLevel | tdee | bmr | bmi | caloriesBurned | workoutDurationSec | restingHeartRate | activeCalories`, plus the raw set. A defense-in-depth runtime key-scan throws in `__DEV__` and drops+warns in prod. Phase 3 exit criterion adds `lib/analytics.test-types.ts` as a type-only negative test file. This is now genuinely the 5.1.3 kill-switch.

### CR2 — Session replay denylist (Resolved)

§3.3 (lines 454-458) specifies explicit allowlist and denylist. **Replay OFF:** S5, S5a, S5b, S7, S8, S11, all `(auth)/*` routes. This matches my requested coverage exactly. The mechanism is correct: `posthog.startSessionRecording()` / `stopSessionRecording()` driven by Expo Router transitions, with `maskAllInputs: true` set globally and per-route overrides only opt-out (never opt-in). `recordVideo: false`, 5MB buffer cap, 900s session timeout. S7 and S8 are denylisted both for body-stat visibility and frame-sensitivity (Performance #3) — two reasons agree on the same posture.

### CR3 — OpenAI as third-party + split consent (Resolved)

S6 copy now names OpenAI verbatim (§2 S6, line 144): *"OK, send my profile (weight, height, age, training goals) to OpenAI (United States, under Standard Contractual Clauses) so the AI coach can generate my plan."* That discharges Art. 13(1)(f) recipient and Art. 46 transfer-mechanism disclosure at point of collection. The three-way split `health_data_personalization` / `ai_coach_inference` / `analytics` is in `consentPurposeValidator` with `"marketing"` deleted from V1. `generateAhaWorkout` queries `userConsents` for the latest `ai_coach_inference` row and throws a typed error if `granted !== true` (§3.5, line 530). Sub-processor list lives on the methodology page (§Phase 7, line 790) and is linked from S6 below the three checkboxes. The `analytics` grant is default-off with `intake_started` held in an in-memory buffer until S6 flushes or drops it — closes the v1 "PostHog starts capturing on first mount" gap (C1).

### CR4 — `app.json` usage strings (Resolved)

§2 S0 (lines 54-58) locks the final strings and Phase 6 writes them into `app.json`, Phase 10 verifies:

- Share: *"Fitbull reads your weight, height, and body-fat percentage from Apple Health so you don't have to re-enter them. We never read sleep, heart rate, cycle, or workout data."*
- Update: *"Fitbull writes your completed strength workouts and estimated active energy to Apple Health so they count toward your Fitness rings."*

These are factually aligned with `lib/healthkit.ts:40-50` (BodyMass / Height / BodyFatPercentage reads; ActiveEnergyBurned + HKWorkoutType writes). The v1 "workout history" falsity and "body measurements" vagueness are both gone. Phase 6 exit + Phase 10 pre-ship check are explicit deliverables, not implicit.

### CR5 — Settings withdrawal UI in V1 (Resolved)

§3.10 + Phase 8 (lines 680-689, 799) commit `app/settings/privacy.tsx` to V1 with a toggle-to-revoke pattern calling `withdrawConsent({ purpose })`, append-only to `userConsents` (never mutating history — addresses Security CR4 append-only audit-trail posture). Cascade is specified per purpose: `ai_coach_inference` withdrawal archives `onboardingAha` rows and future `generateAhaWorkout` refuses; `health_data_personalization` withdrawal schedules profile purge; `analytics` withdrawal stops `capture()` forwarding and invokes PostHog server-side delete. S6 copy that promises "withdraw in Settings anytime" is now backed by shipped code — Art. 7(3) "as easy as giving it" is defensible.

---

## v1 Still Open

None. All five criticals and the supporting concerns (C1 analytics grant gate, C3 Privacy Nutrition Label expansion to Identifiers / User Content / Contact Info, C4 account-deletion cascade, C5 primer copy order, C6 `grantedScopes` rationale, C2 re-ask cadence + `Linking.openSettings()`) are closed in the plan or the changelog with inline review tags.

---

## New Concerns

### N1 — Convex region still unresolved (open question, not blocking)

§Phase 0 / open questions (line 921) flags "Convex region — verify EU deployment" as a pre-Phase-1 owner item. If the Convex deployment is US, the `userProfile` storage is itself a cross-border Art. 46 transfer — same SCC obligation as OpenAI. The sub-processor list on the methodology page references "Convex per region declaration," which is honest, but an actual region decision is required before S6 copy is final. Not a blocker at plan level; would become one at ship if Convex-US and consent copy silently omits it. Flag for Sebastian.

### N2 — `generateAhaWorkout` consent check is a DB read, not a token-bound claim

The action reads the latest `ai_coach_inference` row at entry. If a user withdraws *during* generation, the in-flight call completes anyway. For a 3-8s action this is acceptable (GDPR doesn't require mid-flight abort), but the plan doesn't say so. Minor: add one line to §3.5 noting that withdrawal affects *future* inferences, not in-flight. Not blocking.

### N3 — PostHog EU session-replay blob residency is still an open question

§Phase 3 open question. PostHog EU Cloud posts session-replay blobs to Frankfurt in current configuration, but verifying this is a pre-ship item. If blobs routed elsewhere, the S6 `analytics` copy claim "to PostHog (Frankfurt, EU)" is wrong. Same pattern as Convex region — owner item, not plan defect.

---

## Handled Well

- **CR1's `Extract<>` form is the textbook distributive fix**, and critically the signature *uses* `NoHealthKitFields<E["props"]>` now rather than defining-and-orphaning it.
- **`ForbiddenKeys` extending to `activityLevel | tdee | bmr | bmi`** closes the "compute-then-emit" back-door I worried about most.
- **Session replay posture is defensively correct**: `maskAllInputs: true` global, route allowlist minimal (S1/S2/S3/S4/S6 chrome/S9/S10), denylist exhaustive for any body-stat-bearing screen.
- **S6 copy names OpenAI + SCC in the checkbox label itself**, not in a buried privacy policy — this is the specific, unbundled, Art. 9(2)(a) consent the Datatilsynet guidance expects.
- **`deleteAccount()` cascade is comprehensive**: `users`, `userProfile`, `userConsents`, `userOnboarding`, `userSubscriptions`, `chatConversations`, `chatMessages`, `workoutPlans`, `workoutLogs`, `onboardingAha`, `aiSafetyIncidents` — plus PostHog server delete API, OpenAI ZDR headers, HealthKit `HKExternalUUID` predicate cleanup, AsyncStorage + `expo-secure-store` wipe. Apple 5.1.1(v) in-app account deletion and GDPR Art. 17 are both discharged.
- **Primer copy order (won't-reads → reads → writes → revocation)** with two equal-weight buttons matches stakeholder §04 and my C5 verbatim.
- **Analytics consent gate before PostHog capture starts**, with `intake_started` held in-memory and flushed at S6 only if granted, is the correct EDPB 05/2020 posture I asked for at C1. `marketing` purpose removed entirely.
- **Re-ask cadence** (one dismiss → 30d suppress, two → permanent until Settings; `Linking.openSettings()` on `.sharingDenied`) matches C2 exactly.

---

## Final Verdict

**APPROVED** — no blocking concerns remain in the HealthKit-privacy domain. The three "New Concerns" (N1 Convex region, N2 in-flight withdrawal semantics, N3 PostHog blob residency) are either owner-decision items already flagged by the plan or single-line tightenings. None require replanning.

The revised plan is defensible against Apple 5.1.3 (no HealthKit data to ads/analytics/third parties without specific consent), Apple 5.1.1(v) (in-app deletion), Apple HealthKit usage-string accuracy, GDPR Art. 6/9/13/17/46, and Datatilsynet April 2025 guidance on unbundled consent. Target effort for N1-N3 verification: under half a day, all pre-Phase-1 or Phase-3 owner checks. Ship.

# Age gate (16+)

Fitbull refuses onboarding completions for users under 16 years of age. This
document records the decision, the copy, the user's recourse, and where in the
code the rule is enforced.

## Threshold

**Minimum age: 16.** Decided in the Prism onboarding-flow session under
AI-Safety #7 and AI-Safety #4 (sanity bounds). Rationale:

- Fitbull generates AI coaching content using body data. Under-16 users are a
  population the product has not been validated for, and several source
  datasets (nutrition recommendations, calorie expenditure models) explicitly
  scope themselves to adults or teens 16+.
- Regulatory posture: GDPR Art. 8 sets the minimum age for digital-services
  consent at 16 in most EU member states (some lower it to 13–15; we pick the
  highest common denominator). Avoiding parental-consent capture keeps the
  product's consent stack simple.
- Product posture: we would rather lose a small under-16 segment than ship a
  coach that has never seen that population in any QA scenario.

Upper bound: 100, enforced client- and server-side. Same ranges apply to the
other Art. 9 fields (weight 30–250 kg, height 120–230 cm, body fat 3–60%).

## Copy

Shown in `AgeGateBlock`:

> Thanks for stopping by.
>
> Fitbull is for users 16 and older. Please come back when you're eligible.
>
> [Close]

"Close" signs the user out and routes to `/(auth)/sign-up`. There is no
"I'll come back later" path that would allow the user to continue through
intake with a flagged profile — the decision is binding for the session.

## Where it lives in code

| Layer | File | Behaviour |
| --- | --- | --- |
| Client intake (S5a / S5b) | `app/onboarding/healthkit-prefill.tsx`, `app/onboarding/manual-stats.tsx` | When the user taps Continue with age < 16, the screen replaces itself with `<AgeGateBlock />`. Continue is disabled otherwise. |
| Component | `components/onboarding/age-gate-block.tsx` | Full-screen modal-style block; `accessibilityViewIsModal` traps VoiceOver; single Close action signs out + routes to sign-up. |
| Client parser | `lib/format.ts` → `parseAgeYears` | Returns `null` outside 16–100, forcing the UI into an inline error. Shared between S5a and S5b. |
| Server | `convex/onboarding.ts` → `completeOnboardingV2` + `assertBounds` | Re-verifies `ageYears >= 16`. Throws `onboarding/age_gate` on violation. Never trust the client. |
| Aha generation | `convex/chatActions.ts` (plan-07) | Inherits the server-side profile, so an under-16 profile cannot reach the LLM. |

## Recourse for the user

If the user is actually 16+ but mistyped their age, they tap Close, sign back
in, and re-enter. We do not offer a self-service "appeal" path — the gate is
deliberately unforgiving. A support path (email) exists outside this flow.

## What this doc is NOT

- Not a marketing-age or parental-consent flow. We do not collect parental
  consent and do not offer a 13–15 experience.
- Not a substitute for platform (App Store) age-rating controls. Those operate
  independently; this gate is a product-level guard in addition.

If the threshold ever moves, update `parseAgeYears` in `lib/format.ts`, the
client bounds in `app/onboarding/healthkit-prefill.tsx` and
`app/onboarding/manual-stats.tsx`, and `assertBounds` in
`convex/onboarding.ts` in the same commit.

# Onboarding Flow Overhaul — Brief

**Session:** `onboarding-flow`
**Created:** 2026-04-21
**Owner:** Sebastian Sole

## Problem

Fitbull's current onboarding is a rough-draft placeholder: a post-signup feature-list screen with a paywall, followed by an 8-step spotlight tour of the tab bar. It captures **zero** personalization data, shows no proof of value before asking for payment, and doesn't leverage the app's differentiator — the AI coach. We're rebuilding the entire sequence from sign-up through first activation, using industry-standard patterns (personalized intake, aha-moment before paywall, conversational tone, social proof) to lift trial starts, paid conversion, and D1/D7 retention simultaneously.

## Stakeholders

- **End users** — new installs landing on the app for the first time. Primary audience is iOS-only fitness-minded individuals.
- **Product owner** — Sebastian (solo). Evaluates visual/UX quality, business fit, and code quality.
- **Revenue (RevenueCat / subscriptions)** — the onboarding flow is the primary monetization surface.
- **AI coach (OpenAI via Convex actions)** — onboarding doubles as the intake that feeds the AI coach's personalization context.
- **Apple Health ecosystem** — HealthKit is the preferred source for body stats and activity baseline on iOS.

## Success Criteria

Optimize for three outcomes, all tracked against a post-launch baseline:

1. **Trial-start rate** — % of new signups who either (a) land on a paywall and start a trial, or (b) begin a no-CC trial if we adopt auto-trial.
2. **Paid conversion** — trial → paid subscription within the conversion window.
3. **D1 / D7 activation** — % of new users who complete their first tangible action (logged workout, generated plan, chat with coach) within 24h / 7 days.

"Done well" means:
- The flow feels like a modern fitness app (Cal AI / Noom / Future tier), not a generic app tour.
- Users see the AI coach produce something personalized **before** being asked to pay.
- Intake data flows into a real user profile that the AI coach, macro calculator, and plan generator all consume — no throwaway questions.
- Accessibility: WCAG 2.1 AA equivalents, Dynamic Type, VoiceOver. No regressions.
- Offline and error paths degrade gracefully (Convex sync, HealthKit permission denials, RevenueCat failures).

## Background Materials

**Current implementation (code)**
- `app/onboarding.tsx` — post-signup paywall/feature screen
- `lib/onboarding-steps.ts` — 8-step spotlight tour config
- `stores/onboarding-store.ts` — Zustand persisted flag + step state
- `providers/onboarding-provider.tsx` — registry + trigger for spotlight overlay
- `components/onboarding/{onboarding-card,onboarding-tooltip,onboarding-overlay}.tsx` — overlay primitives
- `app/(auth)/sign-up.tsx`, `app/(auth)/sign-in.tsx` — email/password sign-up (Convex auth)
- `hooks/use-purchases.ts`, `stores/subscription-store.ts` — RevenueCat integration (read through these, never directly)
- `convex/user.ts` — `completeOnboarding` mutation, `getOnboardingStatus` query
- `hooks/use-healthkit.ts`, `lib/healthkit.ts` — iOS HealthKit wrapper (iOS-only, must be guarded)
- `convex/chatActions.ts`, `convex/aiTools.ts` — AI coach surface we'd showcase inside onboarding

**External references (A/B tests, case studies)**
- https://www.insidergrowthhq.com/p/3-onboarding-and-checkout-secrets
- https://www.insidergrowthhq.com/p/3-experiments-to-boost-conversion
- https://www.insidergrowthhq.com/p/3-e... *(URL the user pasted was truncated — full version TBD)*
- https://abtest.design/tests/onboarding-checklist
- https://abtest.design/tests/conversational-tone-in-onboarding
- https://abtest.design/tests/onboarding-with-multi-intent-queries
- https://abtest.design/tests/separating-contact-information-into-multiple-screens
- https://abtest.design/tests/personali... *(truncated — full version TBD)*
- https://conversion.com/case-study/dollar-shave-club/
- https://growth.design/case-studies/grammarly-onboarding-survey

**Project rules that bound the solution**
- `CLAUDE.md` — stack, constraints, directory map
- `.claude/rules/coding-conventions.md` — TypeScript/Expo/Convex/NativeWind rules
- `docs/revenuecat-purchases-module-fix.md` — known paywall native-build workaround

## Constraints

**Non-negotiable**
- **iOS-only first** — ship for iOS, no Android, no web for this effort.
- **Convex is the only backend** — no sidecar API. Auth goes through `@convex-dev/auth`.
- **Sign-up is required** for the app to function (Convex-bound user identity). Anonymous / delayed-email patterns need explicit evaluation against Convex auth capabilities before being proposed.
- **RevenueCat stays** as the paywall/purchase layer. The current native-build workaround must be preserved.
- **Stack rules**: Zustand + Convex pattern, NativeWind only, `@/*` alias, no `enum`, no `any`, no direct `react-native-purchases` / `@kingstinct/react-native-healthkit` / `expo-haptics` imports outside their wrappers.
- **Accessibility**: WCAG 2.1 AA equivalents, Dynamic Type, VoiceOver labels on all interactive elements, 44×44 pt touch targets.
- **Locale**: comma-decimal support on any numeric input (see `lib/format.ts`).
- **Offline-first**: writes go through `lib/convex-sync.ts` queue; onboarding progress must survive flaky network.
- **No new frameworks** — no new state library, no new form library without discussion, no new animation runtime beyond Reanimated.

**Strong preferences**
- Keep narrow, reversible edits. Prefer composing existing primitives (`components/ui/*`, `@rn-primitives/*`) over building parallel ones.
- Current RevenueCat paywall UI presentation is the baseline; changes to it are in scope only if exploration shows a clear lift.

## Scope

**In scope**
- The entire new-user sequence: app open → sign-up → personalization intake → HealthKit prompt → body/goal data → AI "aha" moment (personalized plan or chat preview) → paywall / trial start → first-run guidance in-app.
- Data model additions in Convex (`convex/schema.ts`, `convex/user.ts`) to persist intake answers and surface them to the AI coach, macro calc, and plan generator.
- Replacing or deleting the current spotlight tour (`providers/onboarding-provider.tsx`, `components/onboarding/*`, `lib/onboarding-steps.ts`) unless it proves load-bearing for a specific step.
- Copy, motion, haptics, and visual polish to hit the "modern fitness app" bar.
- Analytics instrumentation sufficient to measure the three success metrics.

**Explicitly out of scope**
- Android and web onboarding (iOS only for this session).
- Re-onboarding existing users (only new-user first-run flow).
- Rewriting the AI coach, macro calculator, plan generator, or RevenueCat wiring themselves — we consume them, we don't refactor them.
- Introducing a new auth provider, a new analytics provider, or a new paywall vendor.
- Unit/integration test framework adoption (project has none today; that's a separate decision).
- Dietary-style intake (explicitly excluded by product per this session's scoping).

## Initial Questions (things we already know we don't know)

**Flow shape & sequencing**
- Should email/password sign-up happen **first** (before intake) or **later** (after the user is invested)? Constrained by Convex auth — does anonymous/guest auth exist in `@convex-dev/auth` and is it acceptable here?
- Where does the paywall sit relative to the personalized plan preview — **before** (commit first, see value after) or **after** (see value, then commit)?
- Should we auto-start a free trial for all users (no-CC or with-CC), or keep the current "Choose Plan / Skip" model?
- Single scroll vs. multi-screen intake — which wins in the referenced A/B tests for a fitness-app context?

**Intake content**
- Exact question set, order, and copy. Confirmed *in*: primary goal, training experience, days/week, equipment, HealthKit import, age, sex, weight, height, current activity. Confirmed *out*: dietary style.
- HealthKit prompt timing — before body stats (prefill) vs. after (fallback only)?
- How many questions is too many? Where's the drop-off cliff in the referenced case studies?

**Value moment**
- What does the "aha" output look like — a plan card, a chat message from the AI coach, a macro target, all three?
- Can we generate something meaningful fast enough (p95 latency budget) without blocking the user?
- What happens if the AI call fails — fallback copy, retry, skip?

**Social proof & tone**
- Do we have/ can we source real testimonials, App Store review snippets, or usage counts to include?
- Conversational-tone pattern — how much persona does the copy take on before it feels gimmicky?

**Commitment devices**
- Goal-setting / streak-setting / commitment-pledge moments — worth including? Evidence from the references?
- "Checklist" pattern post-onboarding (abtest.design/tests/onboarding-checklist) — does it fit our (tabs) layout or clash with it?

**Data model & downstream use**
- Final Convex schema additions for the intake profile. Do existing tables already cover any of it?
- How does the AI coach consume the profile — via prompt injection in `chatActions.ts`, or a structured "profile summary" tool?

**Metrics**
- Which analytics provider instruments the funnel? (The repo has no analytics today as far as the brief author can see — confirm before designing events.)
- What conversion window defines "paid conversion"?

**Truncated references**
- Two reference URLs are truncated (`.../3-e...`, `.../personali...`) — need full URLs before the explore phase.

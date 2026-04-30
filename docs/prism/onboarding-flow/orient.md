# Orient: onboarding-flow

**Date:** 2026-04-21
**Context:** Pre-launch (2 TestFlight users). Final pre-ship task. Nordic-first (1A), US/EU (1B). Analytics provider selected: PostHog. No existing social-proof assets.

## Explore (High Value, Low Understanding)

These become the exploration backlog for `/prism-explore`. Explorers will likely consolidate overlapping items into thematic briefs.

| # | Inquiry | V | U | Dimension | Rationale |
|---|---------|---|---|-----------|-----------|
| 1 | Does `@convex-dev/auth` support anonymous / guest sessions? If yes, how does upgrade-to-email work? | 5 | 1 | Unknown | Gates every "sign-up later" flow variant. Load-bearing for sequencing. |
| 2 | Onboarding teardowns of proven fitness/health apps: Cal AI, Noom, Fastic, Future, Rise, Macrofactor, Ladder, Cal-AI clones | 5 | 2 | Prior art | Closest analogues to our target bar. Pattern source. |
| 3 | Deep-read of the 10 case studies / A/B tests supplied in brief | 5 | 2 | Prior art | The explicit evidence base for this overhaul. |
| 4 | AI "aha moment" — generation latency, streaming UX, failure modes, fallback copy, retry strategy | 5 | 1 | Risk | If plan generation is slow or flaky, the moment collapses into churn. |
| 5 | Paywall timing: before vs. after personalized plan preview (and what "after" looks like mechanically with RevenueCat) | 5 | 2 | Domain | Single biggest lever on paid conversion. |
| 6 | Auto-trial strategy: no-CC vs. with-CC vs. status-quo Choose-Plan/Skip; conversion + refund economics | 5 | 2 | Domain | Direct monetization trade-off user flagged. Also App Store policy-sensitive. |
| 7 | Intake question count — drop-off curves, optimal range, ordering effects | 5 | 2 | Domain | Core friction vs. personalization trade-off. |
| 8 | Conversational vs. form UI in intake; single-scroll vs. one-question-per-screen | 4 | 2 | Domain | User linked two abtest.design tests covering this directly. |
| 9 | HealthKit-first UX: permission prompt timing, explainer copy, prefill mechanics, denial fallback design | 4 | 2 | Prior art + Risk | User wants HealthKit before body stats; denial fallback must be coherent. |
| 10 | Plan-preview "aha" content: plan card, AI chat message, macro targets, streak commitment — which, combined, or sequenced? | 5 | 2 | Vision | Defines what "personalized value" actually looks like on screen. |
| 11 | PostHog wiring: RN SDK setup, event schema for the three success metrics, Convex-side events, session stitching, feature-flag A/B infra | 4 | 2 | Risk | Required to measure the flow. Dependency for future iteration. |
| 12 | Convex schema additions for the user profile (goals, experience, stats, training prefs) and how AI coach + macro calc + plan generator consume it | 4 | 2 | Risk | Wrong shape = rework across three downstream consumers. |
| 13 | RevenueCat paywall placement & customization: what trigger points, what UI control, what Apple reviewers tolerate | 4 | 2 | Risk | Bounds the answer space for #5 and #6. |
| 14 | Social proof strategy for a pre-launch app with no real assets — what is credible (founder note, science-backed claims, aggregate intent stats, stock faces with attribution, waitlist counts) | 3 | 2 | Domain | Addresses trust gap without inventing fake reviews. |
| 15 | Nordic-first localization: copy tone, paywall pricing psychology, payment methods (Vipps/MobilePay/Klarna), GDPR touchpoints in intake/PostHog | 4 | 2 | Domain + Risk | 1A market changes more than translation; paywall and data handling both affected. |

## Deepen (High Value, Higher Understanding)

| # | Inquiry | V | U | Dimension | Rationale |
|---|---------|---|---|-----------|-----------|
| D1 | Accessibility budget for motion/haptics-heavy onboarding (Dynamic Type, VoiceOver, reduced-motion) | 4 | 3 | Risk | Rules known from coding-conventions; specific application to onboarding patterns isn't. |
| D2 | GDPR + Apple privacy nutrition labels for intake + PostHog in Nordic market | 3 | 3 | Risk | Legal-adjacent; low effort to confirm, costly to miss. |

## Note (Interesting, Lower Priority)

| # | Inquiry | V | U | Dimension | Rationale |
|---|---------|---|---|-----------|-----------|
| N1 | React Compiler + Reanimated interaction patterns in onboarding animations | 2 | 3 | Risk | Solvable at implementation; not planning-tier. |
| N2 | ASO / App Store listing alignment with the new onboarding | 3 | 1 | Domain | Worth a sentence in the plan; not worth exploration tokens now. |

## Skip (Known Enough / Not Worth Tokens)

| # | Topic | Why skip |
|---|-------|----------|
| S1 | Convex user schema migration risk | Pre-launch, 2 TestFlight users — schema is freely mutable. |
| S2 | Spotlight tour deprecation / salvage | Confirmed rough draft; clean delete. |
| S3 | RevenueCat native-build workaround | Documented in `docs/revenuecat-purchases-module-fix.md`. Follow, don't re-derive. |
| S4 | Stack choices (Expo, Convex, Zustand, NativeWind, RevenueCat, `@rn-primitives/*`) | Locked by CLAUDE.md and pnpm overrides. |
| S5 | Commit/CI/lint conventions | Locked by `coding-conventions.md`. |

## Consolidation Hints for /prism-explore

Likely exploration themes (explorers will group these):

- **Prior art** — #2 + #3 merged into a sweep of teardowns and case studies, distilled into patterns to steal.
- **Monetization** — #5 + #6 + #13 bundled: paywall timing, trial strategy, RevenueCat placement constraints.
- **Intake UX** — #7 + #8 + #10 bundled: question count, screen structure, aha-moment content.
- **Auth & data spine** — #1 + #12 bundled: anonymous/guest auth path, Convex profile schema, downstream consumer contracts.
- **AI aha moment** — #4 standalone: latency, streaming, failure, fallback.
- **HealthKit integration** — #9 standalone: permission UX, prefill, fallback.
- **Measurement** — #11 standalone: PostHog wiring + event schema.
- **Localization & trust** — #14 + #15 bundled: social proof strategy, Nordic-first pricing/copy/GDPR.
- **Quality bars (Deepen)** — D1 + D2 as lighter-weight passes.

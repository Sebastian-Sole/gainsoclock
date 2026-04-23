# Loadout: onboarding-flow

## Currently Available

**Core tools**
- `WebFetch` — pull individual case-study URLs (abtest.design, growth.design, insidergrowthhq, conversion.com) and vendor docs (Convex, RevenueCat, PostHog, Apple HIG).
- `WebSearch` — discover teardowns/reviews of Cal AI, Noom, Fastic, Future, Rise, Macrofactor, Ladder; resolve the two truncated brief URLs; find recent App Store policy posts.
- `Read` / `Grep` / `Glob` — inspect current onboarding code (`app/onboarding.tsx`, `lib/onboarding-steps.ts`, `hooks/use-purchases.ts`, `hooks/use-healthkit.ts`, `convex/user.ts`, `convex/chatActions.ts`, `convex/schema.ts`).
- `Bash` — `pnpm why`, `pnpm list @convex-dev/auth`, `pnpm list react-native-purchases posthog-react-native` to confirm installed versions before researching feature matrices.

**Skills** (`.claude/skills/*`)
- `expo-ios` — Expo SDK 54 / New Arch / iOS build nuances (relevant to any onboarding screen that touches native modules).
- `mobile-ux-ios` — Apple HIG patterns for intake screens, haptics, permission priming.
- `screen-reader-test` — VoiceOver verification for the new flow (D1).
- `frontend-patterns` — Reanimated + React Compiler patterns for motion-heavy onboarding (N1).
- `design-system` — token/`cva` wiring for new intake primitives.
- `prism-methodology` — session structure; already in play.

**MCPs**
- `maestro` (project `.mcp.json`) — once the flow exists, author E2E flows covering sign-up → intake → paywall.

## Recommended to Install

None. Every theme below is served by WebFetch + WebSearch + project skills. Installing a Convex or PostHog MCP is not justified for a one-session research pass; the vendor docs are public and WebFetch handles them.

## Per-Topic Tool Recommendations

**Prior art (#2, #3)** — `WebSearch` for teardowns ("Cal AI onboarding teardown", "Future app onboarding 2025"); `WebFetch` each abtest.design / growth.design / conversion.com URL in the brief. Resolve the two truncated URLs via `WebSearch` site:insidergrowthhq.com and site:abtest.design.

**Auth & data spine (#1, #12)** — `WebFetch` https://labs.convex.dev/auth and https://docs.convex.dev (anonymous providers, session upgrade). `Grep` for `getAuthUserId`, `convexAuth`, `@convex-dev/auth` in `convex/` to map current config. Read `convex/schema.ts` + `convex/validators.ts`.

**Monetization (#5, #6, #13)** — `WebFetch` https://www.revenuecat.com/docs/tools/paywalls and /docs/subscription-guidance/free-trials. `WebSearch` "RevenueCat paywall placement App Store review 2026". `Read` `docs/revenuecat-purchases-module-fix.md`, `hooks/use-purchases.ts`, `stores/subscription-store.ts`.

**AI aha moment (#4)** — `WebFetch` https://platform.openai.com/docs/guides/streaming and Convex actions streaming docs. `Read` `convex/chatActions.ts`, `convex/aiTools.ts`, `hooks/use-chat.ts` for current streaming shape and error handling.

**HealthKit (#9)** — `WebFetch` Apple HIG "Requesting Permission" + HealthKit authorization docs. `Read` `lib/healthkit.ts`, `hooks/use-healthkit.ts`. `WebSearch` "@kingstinct/react-native-healthkit permission UX".

**Measurement (#11)** — `WebFetch` https://posthog.com/docs/libraries/react-native and /docs/feature-flags. `WebSearch` "PostHog Convex server-side events" for session stitching.

**Localization & trust (#14, #15)** — `WebFetch` RevenueCat Nordic pricing docs and https://developer.apple.com/app-store/review/guidelines/#payments. `WebSearch` "Vipps MobilePay App Store in-app purchase 2026" (confirm they remain off-limits for digital subs), "Klarna App Store IAP". `WebFetch` Apple Privacy Nutrition Labels and EU GDPR guidance for analytics SDKs (D2).

**Accessibility (D1)** — use `screen-reader-test` skill + `mobile-ux-ios` references; `WebFetch` Apple "Accessibility on iOS — Dynamic Type, Reduce Motion".

## Not Recommended

- **Convex MCP / PostHog MCP** — nothing a Dashboard + docs + `pnpm convex:dev` doesn't cover at this stage.
- **Figma MCP** — no Figma source cited in brief.
- **Installing Storybook / Chromatic** — out-of-stack for this session (no new frameworks rule).
- **GitHub MCP** — `gh` CLI via `Bash` is already wired.

## Skills to Create

- **`convex-auth-patterns`** (small) — once #1 is resolved, capture the anonymous-to-email upgrade recipe so the implementer phase doesn't re-derive it. Contents: provider config, client hooks, migration mutation shape, gotchas.
- **`revenuecat-paywall-placement`** (small) — codify which trigger points / presentation modes survive Apple review, referencing `docs/revenuecat-purchases-module-fix.md`. Worth creating only if exploration surfaces multiple viable placements.

Defer both until synthesis — create them only if the explored patterns are reused beyond this session.

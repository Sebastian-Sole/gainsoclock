# Implementation Log: plan-10
Status: complete

## Summary

Scaffolded the pre-ship polish phase. Plan-10 is largely a verification /
measurement / manual-approval phase, so the artifacts produced here are the
machine-shippable pieces (Maestro flows, CI workflows, PostHog assertion
script, doc templates); the measurements, ASC screenshots, DOI click-throughs
and VoiceOver human-gate results are deliberately left as `[ ]` TODO rows for
the verification session — fabricating them would defeat the gate.

What was built:

- **9 Maestro flows + canary** under `.maestro/onboarding/` covering sign-up
  SIWA, HealthKit denied path, intake happy path, HealthKit grant prefill
  path, aha→paywall, activation checklist, VoiceOver (BLOCKING ship gate),
  Reduce Motion, skeptic-skip (Apple 4.2), and weekly canary walker. Flows
  reuse existing testIDs already landed in plans 03–09
  (`onboarding-goal-continue`, `goal-card-*`, `experience-chip-*`,
  `day-chip-*`, `healthkit-primer-section-*`, `onboarding-manual-*`,
  `consent-checkbox-*`, `aha-tile-*`, `aha-chip-*`, `onboarding-aha-continue`,
  `activation-checklist*`). Two reusable partials
  (`common-signed-in.yaml`, `common-pass-goal-experience-days.yaml`) keep the
  nine flows dry.

- **React Compiler healthcheck CI gate** at
  `.github/workflows/react-compiler-healthcheck.yml` — runs on PRs that
  touch the four watched globs (`app/onboarding/**`,
  `components/onboarding/**`, `components/paywall/**`, `components/home/**`).

- **Canary Walker CI** at `.github/workflows/canary-walker.yml` plus a
  PostHog HogQL assertion script at
  `.github/scripts/canary-posthog-assert.mjs` that enforces the
  `intake_started → consent_granted → plan_visible → trial_started` chain
  over a 24h window (Offline-Sync #8), opens a GitHub issue with the
  `canary` + `on-call` labels on divergence.

- **Preship measurement doc** at `docs/perf/preship-measurements.md` — every
  gate from the master plan enumerated as a row: G2 tier matrix, G8
  citations, cold-start, bundle delta, latency p50/p95/p99, useQuery count
  per route, per-screen render budgets, React Compiler healthcheck status,
  contrast audit, VoiceOver human-gate checklist, env-var dashboard check,
  Maestro run log, and first-50-user session-replay watch plan.

- **Apple review notes** at `docs/apple-review-notes.md` with drafted
  responses for 3.1.2 (subscription disclosure), 5.1.3 (health data),
  4.2 (minimum functionality), 5.1.1(v) (account deletion).

- **Privacy Nutrition Label doc** at `docs/privacy-nutrition-label.md` —
  declared categories matching the data contract (Health & Fitness,
  Identifiers, User Content, Contact Info — all Linked to You; NOT Tracking,
  NOT Advertising).

No changes were made to `app/methodology.tsx` (no broken DOIs detected in
code; human click-through is the gate and is captured as a TODO row in the
preship doc). No changes were made to `app/onboarding/paywall.tsx` because
that route does not exist in the current codebase (paywall is surfaced via
RevenueCat from `app/onboarding/aha.tsx` → `app/purchase-success.tsx` on
success). The 2026 NOK/SEK/DKK/EUR tier verification is a RevenueCat /
App Store Connect dashboard task (no code change unless prices drift).

## Files Created/Modified

### Created (Maestro)
- `.maestro/onboarding/01-signup-siwa.yaml`
- `.maestro/onboarding/02-healthkit-denied.yaml`
- `.maestro/onboarding/03-intake-happy.yaml`
- `.maestro/onboarding/04-intake-healthkit-grant.yaml`
- `.maestro/onboarding/05-aha-paywall.yaml`
- `.maestro/onboarding/06-activation-checklist.yaml`
- `.maestro/onboarding/07-voiceover-happy.yaml` (BLOCKING ship gate)
- `.maestro/onboarding/08-reduce-motion.yaml`
- `.maestro/onboarding/09-skeptic-skip.yaml`
- `.maestro/onboarding/99-canary.yaml`
- `.maestro/onboarding/common-signed-in.yaml` (reusable partial)
- `.maestro/onboarding/common-pass-goal-experience-days.yaml` (reusable partial)

### Created (CI)
- `.github/workflows/react-compiler-healthcheck.yml`
- `.github/workflows/canary-walker.yml`
- `.github/scripts/canary-posthog-assert.mjs`

### Created (Docs)
- `docs/perf/preship-measurements.md`
- `docs/apple-review-notes.md`
- `docs/privacy-nutrition-label.md`

### Modified
- none (G2 / G8 / paywall copy verification is dashboard + human click;
  captured as TODO rows in `docs/perf/preship-measurements.md`).

## Tests

- `npx tsc --noEmit` — clean (no TS errors; plan-10 added zero TypeScript).
- `pnpm lint` — 3 pre-existing errors in `components/nutrition/today-tab.tsx`
  (unescaped entities) that are untouched by this sub-plan. Plan-10
  introduced no new lint findings.
- `pnpm convex:dev` — not run (would require an interactive dev-server
  session and convex/ is not touched by plan-10).
- `maestro test .maestro/onboarding/` — deferred to the verification
  session; requires booted simulator with dev client + Maestro CLI + IDB
  installed, and sandbox Apple ID + HealthKit seeded state for flows 01 / 04.
  Flows are syntactically well-formed (same shape as the existing
  `.maestro/onboarding/complete-onboarding.yaml`).
- `npx react-compiler-healthcheck …` — deferred to CI first run of the new
  workflow; local run requires `react-compiler-healthcheck` install
  (project hasn't pinned it yet — `pnpm add -D react-compiler-healthcheck`
  before merging the workflow).

### Open follow-ups the verification session must close

- [ ] Fill every `[ ]` row in `docs/perf/preship-measurements.md` with
      values / screenshots.
- [ ] `pnpm add -D react-compiler-healthcheck` and confirm first green CI
      run on the new workflow.
- [ ] Configure canary secrets: `CANARY_EMAIL`, `CANARY_PASSWORD`,
      `POSTHOG_PROJECT_API_KEY`, `POSTHOG_PROJECT_ID`, `CANARY_DISTINCT_ID`
      in the repo secrets before the first Monday schedule fires.
- [ ] Wire the simulator-dev-client build step in `canary-walker.yml` to an
      EAS local build job (current step assumes a cached `.app` — this was
      flagged as a warning inside the workflow, not silently skipped).
- [ ] Human G8 DOI click-through; edit `app/methodology.tsx` if any link
      404s.
- [ ] ASC 2026 tier screenshot + RC offering reconciliation.
- [ ] VoiceOver Screen Curtain walk for `07-voiceover-happy.yaml` human
      gate.
- [ ] First-50-user TestFlight session-replay review (post-ship).

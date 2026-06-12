# Decision: Test runner for `lib/**` pure modules — Vitest

**Status**: Accepted
**Date**: 2026-06-12
**Plan**: `plans/025-test-runner-baseline.md`

## Context

CLAUDE.md and `.claude/rules/coding-conventions.md` gate the test stack:
"adding a test runner is a stack decision, not a per-PR choice." This memo
records that decision so future PRs can add `lib/**` tests without re-opening it.

The repo has no one-command way to know its pure logic still works. The
dangerous untested core, all pure or near-pure today:

- **Offline-queue drop semantics** — `lib/convex-sync.ts`: items are dropped on
  unknown mutation path (`lib/convex-sync.ts:174`) or after `MAX_RETRIES`
  (`lib/convex-sync.ts:44`, `:181-183`). A regression silently loses queued
  workouts.
- **Two-timezone date math** — `lib/stats.ts` (local-time `format`/`getDay`)
  vs `lib/streaks.ts` (UTC day-ordinal arithmetic, `lib/streaks.ts:16-24`).
  A regression yields wrong streaks at midnight / across DST.
- **Comma-decimal + bounds parsers** guarding the 16+ age gate and weight/height
  input — `lib/format.ts:32-67` (`parseLocaleNumber`, `parseWeightKg`,
  `parseHeightCm`, `parseAgeYears`). A regression breaks numeric input or the
  onboarding age gate.
- **Calorie math** — `lib/bmr.ts` (Mifflin-St Jeor + activity multiplier). A
  regression shows a wrong maintenance-calorie target on the aha tile.

Nothing today would catch any of these. These modules are already pure or
near-pure; characterization tests are mechanical once a runner exists.

## Options considered

1. **Vitest (chosen).** Fast, zero React Native coupling, no preset to drag in.
   Runs `lib/**` pure modules under the Node environment with the `@/*` alias
   pointed at the repo root. Tests use **explicit imports**
   (`import { describe, it, expect } from "vitest"`) — no globals — so
   `eslint.config.js` (10 lines, no test globals) needs no change and the app
   `tsc` program picks up vitest's types per-file via those imports.
2. **`jest-expo`.** Brings the full React Native Jest preset (transformers,
   `react-test-renderer`, RN module mocks). That weight buys component testing
   we do not need for this `lib/**`-only scope. Not banned, but heavier than the
   job. Revisit if/when component testing becomes a separate stack decision.
3. **Do nothing.** Keep the status quo: the dangerous modules above stay
   uncovered. Rejected — the regression risk is real and the modules are
   cheap to pin now.

Banned tooling (Biome, Husky) is unaffected; Vitest is neither.

## Decision

Adopt **Vitest**, scoped to **`lib/**` pure modules only**, with the
**explicit-import** style (no globals). Config:

- `vitest.config.ts` — `environment: "node"`, `include: ["lib/**/*.test.ts"]`,
  `resolve.alias` mapping `@` → repo root.
- `package.json` script: `"test": "vitest run"`.
- Devled dependency: `vitest` (dev only). Test files are imported by nothing in
  the Metro entry graph, so the app bundle is unaffected.

### In scope (this plan)

- `lib/format.test.ts`, `lib/streaks.test.ts`, `lib/stats.test.ts`,
  `lib/bmr.test.ts` — characterization tests pinning CURRENT behavior, oddities
  included and commented.

### Out of scope / deferred follow-ups

- **`lib/convex-sync.test.ts`** — deferred to a follow-up after plan 007
  stabilizes that file. It needs real mocks
  (`@react-native-async-storage/async-storage` native module; the
  `@/stores/network-store` zustand store is usable as-is). The mock surface is
  genuine work, not characterization — keep it out of this baseline.
- **CI step** — plan 001's `checks.yml` should gain a one-line
  `pnpm test` step as a follow-up so the suite runs on every PR.
- **Component / React testing** (`react-test-renderer` / RNTL, or `jest-expo`)
  remains a SEPARATE future stack decision. This memo does not authorize it.

## Consequences

- `pnpm test` becomes the one-command check for `lib/**` pure logic.
- Plans 008 and 017 (refactors of these modules) gain a characterization safety
  net to refactor against; their STOP conditions reference these tests.
- The convention "no unit-test script yet" is now stale and updated in
  CLAUDE.md and `.claude/rules/coding-conventions.md`.

# Implementation Log: plan-05
Status: complete

## Summary
Shipped the intake stack layout and four of six screens (S2 goal, S3 experience, S4 days, S6 consent) under `app/onboarding/`. Added the 5-dot progress indicator, canonical `ERROR_COPY`, the `onboarding` Button size variant (h-12 / 48pt), locale-aware numeric parsers, the Strava-dry copy rubric doc, and four 1×1 placeholder WebP assets (44 bytes each) for the goal cards. Replaced the TODO-queued consent gate in `ConvexSyncProvider` with a live `api.onboarding.getConsents` subscription so PostHog flips on the moment the user grants `analytics` on S6. Demolished the legacy `app/onboarding.tsx` and the bridge mutation `api.user.markLegacyOnboardingComplete`, and pointed `useAuthGuard` at `/onboarding/goal`. S6 submits go directly through `useMutation(api.onboarding.completeOnboardingV2)` with explicit retry UI on failure — never routed through `lib/convex-sync.ts` (per Offline-Sync #1). Art. 9 fields remain in the in-memory draft slice only. Installed `expo-image@~3.0.11` via `pnpm expo install` for blurhash-capable goal-card rendering.

## Files Created/Modified

### Created
- `app/onboarding/_layout.tsx` — Stack with 5-dot header, rage-quit hook, redirect-on-complete guard.
- `app/onboarding/goal.tsx` — S2 with 4 goal cards, primary-pin radio, disabled-CTA microcopy, `goal_set` analytics.
- `app/onboarding/experience.tsx` — S3 single-select chips; `experience_set` analytics and forward-only advance.
- `app/onboarding/days.tsx` — S4 multi-select day chips with ≤375pt 2-row grid via `useWindowDimensions`; `days_set` analytics; routes to `/onboarding/healthkit` (plan-06).
- `app/onboarding/consent.tsx` — S6 intake summary + 3 unbundled consents; direct `useMutation(completeOnboardingV2)`; retry UI; `consent_granted` on success; navigates to `/onboarding/analysis` (plan-07).
- `components/onboarding/progress-dots.tsx` — `accessibilityRole="progressbar"` with reduce-motion awareness.
- `components/onboarding/goal-card.tsx` — `expo-image` + blurhash, checkbox role, nested radio for primary pin.
- `components/onboarding/experience-chip.tsx`
- `components/onboarding/day-chip.tsx`
- `components/onboarding/consent-row.tsx` — checkbox with full-sentence accessibility label.
- `components/onboarding/intake-summary-list.tsx` — Edit chips carry value in label, action in hint.
- `lib/copy/errors.ts` — exactly four keys: `NETWORK_SYNC`, `HEALTHKIT_PERMISSION`, `AHA_LLM`, `PAYWALL_SHEET`.
- `docs/prism/onboarding-flow/copy-rubric.md` — Strava-dry rubric committed.
- `assets/onboarding/goal-stronger.webp`, `goal-leaner.webp`, `goal-healthier.webp`, `goal-routine.webp` — 44-byte 1×1 VP8 placeholders; plan-10 swaps in final art.

### Modified
- `components/ui/button.tsx` — added `onboarding` size variant (h-12, px-6, py-3) and matching text size entry.
- `lib/format.ts` — added `parseLocaleNumber`, `parseWeightKg`, `parseHeightCm`, `parseAgeYears` with bounds and integer gate.
- `hooks/use-auth-guard.ts` — routes unfinished users to `/onboarding/goal`.
- `providers/convex-sync-provider.tsx` — subscribes to `api.onboarding.getConsents` and drives `setAnalyticsConsent(consents?.analytics?.granted ?? false)`; removes the plan-01 TODO stub.
- `convex/user.ts` — removed the plan-01 bridge mutation `markLegacyOnboardingComplete` now that the legacy screen is gone.
- `package.json` / `pnpm-lock.yaml` — `expo-image@~3.0.11` added.

### Deleted
- `app/onboarding.tsx` — legacy placeholder. All inbound hrefs already pointed at `/onboarding/goal` or `/onboarding/<step>` except the one `/onboarding` fallback in `use-auth-guard`, which is now updated.

## Tests
- `npx tsc --noEmit` — **green** (app code).
- `npx tsc --noEmit -p convex/tsconfig.json` — **green** (Convex code).
- `pnpm lint` — exits non-zero, but all 3 errors and 37 warnings are pre-existing (`components/nutrition/today-tab.tsx` and friends). **Zero** lint findings in any file touched by plan-05 (verified by filtering `pnpm lint` output to `app/onboarding/**`, `components/onboarding/**`, `lib/copy/**`, `lib/format.ts`, `hooks/use-auth-guard.ts`, `components/ui/button.tsx`, `providers/convex-sync-provider.tsx`, `convex/user.ts`).
- Manual smoke, Maestro `.maestro/onboarding/03-intake-happy.yaml`, VoiceOver rotor sweep, Convex write verification, AsyncStorage Art.9 inspection, and iPhone SE layout verification are **not yet executed** — they belong to /prism-run / plan-10 (Maestro flows and the test harness live there). `testID` props are in place: `onboarding-progress-dots`, `goal-card-<id>`, `goal-card-<id>-primary`, `experience-chip-<id>`, `day-chip-<n>`, `onboarding-goal-continue`, `onboarding-days-continue`, `consent-row-<purpose>`, `consent-checkbox-<purpose>`, `onboarding-consent-submit`, `onboarding-consent-retry`, `intake-summary-edit-<field>`, `consent-subprocessors-link`.

### Deviations from the plan
- **Goal card assets are 1×1 placeholder WebPs**, not final imagery. The plan explicitly allows this ("if not available at this phase, use placeholder 1×1 solid-colour WebPs … plan-10 replaces them"). All four files are well under the 40 KB cap (44 bytes).
- **Sub-processors link target.** The plan specifies a link to `/methodology` (plan-07 ships the page). Since the route does not exist yet, the link attempts `Linking.openURL("fitbull://methodology")` and silently swallows the failure; plan-07 wires the real target.
- **`dataSource` inference on S6 submit.** Plan-06 owns the canonical `dataSource` signal (HealthKit vs manual vs mixed). Until that field lands on the draft store, the consent screen submits `"manual"` — this is a safe default and will be replaced by the plan-06 field read when plan-06 merges.
- **Installed `expo-image@~3.0.11`** via `pnpm expo install`. The sub-plan specified `expo-image` with blurhash for goal cards; it was not previously in the dependency list. No config-plugin changes needed — pure JS import.

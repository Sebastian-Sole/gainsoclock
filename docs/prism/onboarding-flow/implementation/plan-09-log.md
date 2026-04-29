# Implementation Log: plan-09
Status: complete

## Summary
Built the post-paywall Mural-style activation checklist (S10) and mounted the
HealthKit re-ask card (S11) on the home tab. All five activation booleans plus
skeptic-cohort + first-training-day metadata flow from a single aggregated
Convex query (`api.home.getActivationState`) so the home tab stays under the
≤ 3 concurrent `useQuery` budget. Item 2 ("generate plan") resolves on the
first user-requested `workoutPlans` row only — aha workouts in
`onboardingAha` are explicitly excluded. Skeptic users (no
`ai_coach_inference` consent) see slot 1 swapped to "Enable AI personalisation"
routing to `/settings/privacy`; granting the consent flips them out of skeptic
state and the slot reverts. Per-item dismiss, ≥3 collapsed-chip, and the 48h
"Setup done. See you {firstTrainingDay}." → null lifecycle are persisted in a
new Zustand slice (`stores/activation-store.ts`). `activation_gate_{name}`
fires once per false→true transition; previous-state tracking is persisted so
analytics don't re-fire after a relaunch.

The TrialConfirmationBanner (plan-08) is not mounted yet — left a TODO marker
above `<ActivationChecklist />` in `app/(tabs)/index.tsx` because plan-08 has
not landed. The skeptic slot's `/settings/privacy` route also depends on
plan-08 and will resolve once that ships.

## Files Created/Modified
- Created: `convex/home.ts` — aggregated `getActivationState` query. Uses
  `take(1)` for existence checks so the cost stays O(1) for power users.
- Created: `components/home/activation-checklist.tsx` — 5-item list, skeptic
  swap, collapsed chip, full-complete + 48h null-out, analytics flip detection.
- Created: `components/home/activation-item.tsx` — accessibility-labelled row
  with checkbox affordance, optional microcopy, and dismiss X.
- Created: `stores/activation-store.ts` — persisted dismiss flags, collapsed
  state, `firstCompletedAt`, `permanentlyDismissed`, and per-item
  `lastSeenItemState` for analytics flip detection.
- Created: `lib/activation-types.ts` — shared `ActivationItemId` union (the
  app tsconfig excludes `convex/`, so this lives in `lib/` for app-side
  imports while `convex/home.ts` redeclares the same union).
- Modified: `app/(tabs)/index.tsx` — mounted `<ActivationChecklist />` and
  `<HealthKitReaskCard />` at the top of the Templates tab (TODO for the
  trial banner from plan-08).
- Regenerated: `convex/_generated/api.d.ts`, `api.js`, `dataModel.d.ts`,
  `server.d.ts`, `server.js` via `npx convex codegen` so `api.home` is wired
  up.

## Tests
- `npx tsc --noEmit` → clean (exit 0).
- `pnpm lint` → no new errors in any plan-09 file. The 3 remaining lint
  errors (`components/nutrition/today-tab.tsx`, unescaped quotes) are
  pre-existing on this branch and out of scope.
- `npx convex codegen` → clean; `api.home` present.
- Manual smoke not run in this implementation pass — the home tab UI requires
  a live simulator and a seeded user matrix (intake / skeptic / mid-complete /
  full-complete / re-ask). Per the sub-plan's verification checklist, those
  six manual paths should be exercised before the phase is marked verified.

## Notes / Out-of-scope deferrals
- TrialConfirmationBanner (plan-08): TODO comment in `app/(tabs)/index.tsx`
  above `<ActivationChecklist />`. Mount once plan-08 ships.
- `/settings/privacy` route (plan-08): the skeptic slot routes here
  optimistically; the route lands with plan-08.
- "Your first session is ready" primary card (UX #9 empty state, points at
  plan-07's aha row): not added — plan-07's `workoutPlans`-vs-`onboardingAha`
  surface isn't in place yet. Will be added in a follow-up once plan-07 lands.
- Maestro `testID` props are present on the checklist, item, dismiss, chip,
  and complete-state nodes; the actual `06-activation-checklist.yaml` flow is
  plan-10's deliverable.
- Settings target-setting surface is treated as out-of-scope per the sub-plan;
  the slot's tap currently routes to `/settings`.

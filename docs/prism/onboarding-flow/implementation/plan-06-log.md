# Implementation Log: plan-06
Status: complete

## Summary

Shipped the HealthKit primer (S5), prefill confirmation screen (S5a), and
manual-stats fallback (S5b), plus the day-3 re-ask primitive (S11) that
plan-09 will mount on the home tab. The primer layout is locked in the order
required by HealthKit-Privacy C5 / UX #3 (won't-reads → reads → writes →
revocation → two equal-weight buttons) and each section is VoiceOver-grouped
so the rotor lands on 3 section headers + 2 buttons instead of 8 bullets.

On grant we pull weight / height / body-fat via `queryQuantitySamples` with
`limit: 1` + `ascending: false`, prefill the draft store's in-memory Art. 9
slice, and fire `healthkit_granted { grantedScopes }` — scope identifier
names only, never values (HealthKit-Privacy C6). Edits to any prefilled field
flip `dataSource` to `"mixed"`; unchanged prefills stay `"healthkit"`; S5b
always writes `"manual"`.

The 16+ age gate is enforced in both S5a and S5b: age < 16 renders an inline
`<AgeGateBlock />` with no workaround path. Close signs the user out and
routes back to sign-up. The decision is documented in
`docs/compliance/age-gate.md`.

Server: `api.onboarding.updateHealthStats` is a sibling of
`completeOnboardingV2` — patches `userProfile` with sanity-bounded stats.
Used by the re-ask card after a late grant.

The re-ask card suppresses for 30 days after one dismissal and permanently
hides after two. On `sharingDenied` it routes to `Linking.openSettings()`
because Apple will not re-prompt once denied. Dismiss counts persist (they
are interaction metadata, not Art. 9 data).

## Files Created/Modified

### New
- `app/onboarding/healthkit.tsx` — S5 primer screen
- `app/onboarding/healthkit-prefill.tsx` — S5a confirm-prefill screen
- `app/onboarding/manual-stats.tsx` — S5b single-screen manual form
- `components/onboarding/healthkit-primer-section.tsx` — VoiceOver-grouped primer section
- `components/onboarding/age-gate-block.tsx` — full-screen 16+ block
- `components/home/healthkit-reask-card.tsx` — day-3 re-ask primitive (plan-09 mounts)
- `docs/compliance/age-gate.md` — age-gate decision + recourse

### Modified
- `lib/healthkit.ts` — locked scope-set constants (`HEALTHKIT_READ_SCOPES`, `HEALTHKIT_WRITE_SCOPES`), added `getAuthorizationStatus()`, `getLatestStats()` (parallel reads, `limit: 1`, descending sort, body-fat fraction normalisation), file-top lock comment
- `hooks/use-healthkit.ts` — exposes `getAuthorizationStatus`, `getLatestStats`
- `stores/intake-draft-store.ts` — added `dataSource`, `reaskState`, `markReaskDismissed`, `resetReaskState`; allowlisted `reaskState` + `dataSource` for persistence (not Art. 9); rehydrate backfill for pre-plan-06 clients
- `convex/onboarding.ts` — new `updateHealthStats` mutation with sanity bounds
- `app/onboarding/_layout.tsx` — registered `healthkit`, `healthkit-prefill`, `manual-stats` Stack screens
- `app/onboarding/consent.tsx` — consumes `draft.dataSource` (populated by S5a/S5b) instead of the placeholder `inferDataSource` helper

## Tests

- `npx tsc --noEmit` — green (app code)
- `cd convex && npx tsc --noEmit` — green (Convex)
- `pnpm lint` — no new issues in any file touched by this plan. The 3 pre-existing errors in `components/nutrition/today-tab.tsx` are unrelated and predate this work.

Test runner is not wired up for this project, and iOS-Simulator / real-device
smoke tests (300ms prefill perf measurement, VoiceOver rotor sweep, grant /
deny / partial-deny paths, `.sharingDenied` opening Settings) require a
booted dev client and HealthKit-seeded device — those will be executed by the
plan-10 Maestro/manual-QA pass with testID hooks already in place
(`onboarding-healthkit-grant`, `onboarding-healthkit-dismiss`,
`onboarding-prefill-*`, `onboarding-manual-*`, `healthkit-reask-*`,
`onboarding-age-gate-close`).

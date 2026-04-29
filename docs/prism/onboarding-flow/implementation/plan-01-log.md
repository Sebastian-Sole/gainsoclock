# Implementation Log: plan-01
Status: complete

## Summary

Delivered the schema + persistence foundation for the V2 onboarding flow.

- Four new Convex tables: `userProfile`, `userConsents` (append-only), `onboardingAha`, `aiSafetyIncidents`.
- Extended `userSubscriptions` with V2 state-machine columns (all `v.optional(...)` so plan-02's `migrateSubscriptionsV2` can backfill the 2 TestFlight rows without breaking the schema deploy) and four new indexes (`by_status`, `by_status_trialExpiresAt`, `by_status_lastVerifiedAt`, `by_status_notificationAnchorAt`).
- New validators in `convex/validators.ts`: `goalValidator`, `experienceValidator`, `consentPurposeValidator`, `subscriptionStatusValidator`, `subscriptionSourceValidator`, `dataSourceValidator`, `biologicalSexValidator`, `ENTITLEMENT_IDS`.
- `convex/onboarding.ts` with `completeOnboardingV2` (atomic, `clientIntakeId`-idempotent, server-authored timestamps, sanity bounds + 16+ age gate with typed errors), `getProfile`, `getConsents` (latest-per-purpose reduction), `withdrawConsent` (append-only + ai-inference cascade onto `onboardingAha` + scheduler hand-off to `scheduleProfileErasure` on health-data withdrawal), and `deleteAccount` stub (TODO plan-08).
- `convex/onboardingInternal.ts` with `writeAhaDelta` (TODO plan-07) and `scheduleProfileErasure` (TODO plan-08) stubs exposing the exact signatures those phases need.
- `lib/consent.ts`: `CONSENT_COPY` triple + `hashConsentCopy` + `computeCombinedHash` using `expo-crypto` (SHA-256, 8-hex prefix).
- `lib/id.ts`: added `newClientId` + `newGenerationId` (21-char `nanoid/non-secure`), kept existing `generateId` for other callers.
- `stores/intake-draft-store.ts`: Zustand `persist` store with an allowlist `partialize` that **never** lets Art. 9 fields (age/sex/weight/height/bodyfat) hit AsyncStorage. Partitions by `userIdPartition`, wipes on mismatch, wipes on >7-day staleness, debounces writes 300ms, and flushes on `AppState` background/inactive.
- `hooks/use-onboarding-status.ts` now maps the real `profile` + `consents` payload from `api.user.getOnboardingStatus` (previously stubbed as `null`) using generated `Doc<"userProfile">` types.
- `convex/user.ts`: legacy `completeOnboarding` mutation deleted; replaced by a thin `markLegacyOnboardingComplete` bridge so the existing `app/onboarding.tsx` placeholder keeps working until plan-05 demolishes it. `getOnboardingStatus` now returns `{ hasCompletedOnboarding, profile, consents }`.

## Files Created/Modified

**Created**
- `convex/onboarding.ts`
- `convex/onboardingInternal.ts`
- `lib/consent.ts`
- `stores/intake-draft-store.ts`

**Modified**
- `convex/schema.ts` — 4 new tables + `userSubscriptions` V2 columns + 4 new indexes
- `convex/validators.ts` — 8 new exports
- `convex/user.ts` — deleted `completeOnboarding`; added bridge `markLegacyOnboardingComplete`; rewrote `getOnboardingStatus` to include profile + consents
- `hooks/use-onboarding-status.ts` — real typed shape via `Doc<"userProfile">`
- `lib/id.ts` — added `newClientId` / `newGenerationId`
- `app/onboarding.tsx` — swapped `api.user.completeOnboarding` → `api.user.markLegacyOnboardingComplete` (bridge; plan-05 demolishes this screen entirely)
- `package.json` / `pnpm-lock.yaml` — added `expo-crypto` dependency

**Renamed (unblocking fix)**
- `convex/openai-config.ts` → `convex/openaiConfig.ts`, with the import in `convex/chatActions.ts` updated. The original filename contained a hyphen, which Convex's module-path validator rejects (`openai-config.js is not a valid path to a Convex module`). This file was introduced by plan-00 as an untracked file and was blocking `convex codegen` / deploy for everyone on the branch. Rename is minimal and keeps plan-00's semantics unchanged.

## Tests

- `npx tsc --noEmit` — **green** (0 errors across the app tree).
- `cd convex && npx tsc --noEmit` — **green** (0 errors in the Convex tree after `convex codegen` regenerated `_generated/api.d.ts`).
- `pnpm exec convex codegen --typecheck disable` — **green**; `_generated/api.d.ts` now exposes `onboarding.*`, `onboardingInternal.*`, and `user.markLegacyOnboardingComplete`. Full `convex dev` push was not run end-to-end to avoid touching the dev deployment mid-plan; deploy is unblocked (the openai-config rename was the last hurdle).
- `pnpm lint` — only pre-existing errors remain (all in `components/nutrition/today-tab.tsx`, untouched by this sub-plan). Zero lint errors or warnings introduced by files created/modified here.
- Maestro / unit tests — not applicable (no runner in repo; plan-01 has no UI).
- Manual Convex REPL smoke (happy path / idempotency / age-gate / withdraw cascade) — **not executed**. Requires a signed-in dev user against the live Convex dev deployment; deferred to the `/prism-run` verification step per the plan's "Verification Checklist for /prism-run" §5.

## Notes / Gaps for Future Phases

- **Bridge mutation `markLegacyOnboardingComplete`**: plan-01 was written assuming plan-00 had demolished `app/onboarding.tsx`'s call to `api.user.completeOnboarding`, but the screen still exists (master plan §2 says plan-05 owns the demolition). The bridge is a 20-line no-state-change mutation that just flips `userOnboarding.hasCompletedOnboarding = true`. It should be removed in plan-05 when the new intake stack lands.
- **`openai-config.ts` rename**: treated as an unblocking drive-by — without it, nobody on the branch can run `convex codegen` or `convex dev`. Flag to the plan-02 agent so they don't re-introduce the hyphenated name.
- **`Doc<"userProfile">` type**: now available everywhere in app code via `@/convex/_generated/dataModel` thanks to the regenerated Convex types. Plan-05's intake screens should reuse this type, not redeclare it.

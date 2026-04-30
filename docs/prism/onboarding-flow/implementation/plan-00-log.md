# Implementation Log: plan-00
Status: complete

## Summary

Cleared the ground before downstream sub-plans can build. Introduced a single
code-constant `ENTITLEMENT_ID = "fitbull_pro"` shared by client and Convex,
deleted every env-var fallback and the "first active entitlement" silent
promotion. Replaced the dual-boolean onboarding flag (Zustand store +
Convex query) with a single reactive tri-state hook (`useOnboardingStatus`)
backed by `useQuery` + offline cache write-through, and rewired the auth
guard to return early on `loading` (D3 race fix). Deleted the placeholder
spotlight tour (provider, store, registry, overlay, card, tooltip, target
hook) and the associated ref plumbing in the tab layout + workouts screen.
Added `convex/openai-config.ts` as the single OpenAI model abstraction and
refactored `convex/chatActions.ts` to route every call through
`OPENAI_CHAT_MODEL`. Added the RevenueCat dual-token webhook rotation
runbook.

## Files Created/Modified

### Created
- `lib/subscription-constants.ts` — `ENTITLEMENT_ID = "fitbull_pro" as const`
- `hooks/use-onboarding-status.ts` — tri-state reactive hook (`loading` |
  `pending` | `complete`) with offline cache fallback and write-through.
- `convex/openai-config.ts` — `OPENAI_AHA_MODEL`, `OPENAI_AHA_FALLBACK_MODEL`,
  `OPENAI_CHAT_MODEL`.
- `docs/revenuecat-webhook-rotation.md` — dual-token rotation runbook.

### Modified
- `hooks/use-purchases.ts` — import `ENTITLEMENT_ID` from the new constants
  file; deleted the `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Fitbull Pro"`
  fallback and the "first active entitlement" silent promotion.
- `convex/subscriptions.ts` — import `ENTITLEMENT_ID` from
  `../lib/subscription-constants`; deleted the
  `REVENUECAT_ENTITLEMENT_ID ?? "Fitbull Pro"` fallback and
  `Object.values(entitlements)[0]` fallback.
- `convex/chatActions.ts` — every `model: "gpt-5.2"` site now reads
  `OPENAI_CHAT_MODEL`.
- `hooks/use-auth-guard.ts` — reads `useOnboardingStatus()`, returns early
  on `loading`, adds a `TODO(plan-05)` for the destination route.
- `stores/auth-cache-store.ts` — added `setHasCompletedOnboarding(value)`
  for the hook's write-through path.
- `app/_layout.tsx` — unmounted `<OnboardingProvider>` wrapper; removed
  the import.
- `app/(tabs)/_layout.tsx` — removed `useOnboardingTarget` refs + the
  `View` wrapper around each tab icon; cleaned up the now-unused `View`
  import.
- `app/(tabs)/index.tsx` — removed `useOnboardingTarget` refs on the FAB
  container and the start-empty button.

### Deleted
- `lib/onboarding-steps.ts`
- `providers/onboarding-provider.tsx`
- `stores/onboarding-store.ts`
- `components/onboarding/onboarding-card.tsx`
- `components/onboarding/onboarding-tooltip.tsx`
- `components/onboarding/onboarding-overlay.tsx`
- `hooks/use-onboarding-target.ts`
- (`components/onboarding/` directory is now empty and was removed by git.)

## Tests

- `npx tsc --noEmit` → clean (exit 0).
- `npx tsc --noEmit -p convex/tsconfig.json` → clean (exit 0). `pnpm
  convex:dev` itself not started (it's a long-running dev server; the
  typechecker pass covers the same codepath).
- `pnpm lint` → 3 errors + 37 warnings, all **pre-existing**. Verified by
  `git stash && pnpm lint` on the same tree before my patch: identical
  40-problem output, no delta introduced. Errors are in
  `components/nutrition/today-tab.tsx` (unescaped entities), unrelated to
  this phase.
- Grep sweep for `REVENUECAT_ENTITLEMENT_ID`,
  `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, `?? "Fitbull Pro"`,
  `stores/onboarding-store`, `OnboardingProvider`, `onboarding-steps`,
  `onboarding-card`, `onboarding-tooltip`, `onboarding-overlay`,
  `use-onboarding-target` across `app/`, `components/`, `hooks/`, `lib/`,
  `stores/`, `convex/`, `providers/` → zero hits. Remaining matches are
  confined to `docs/prism/onboarding-flow/**` research/plan/review
  artefacts, which are historical records.

## Notes for downstream phases

- `.env.local` was not read per session policy. Per the risk note in the
  sub-plan, the user should manually remove
  `REVENUECAT_ENTITLEMENT_ID` / `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
  from `.env.local` and the Convex dashboard before shipping — code no
  longer references them.
- The auth guard still routes pending users to the legacy `/onboarding`
  placeholder. plan-05 replaces the destination with `/onboarding/goal`;
  the `TODO(plan-05)` comment flags the swap site.
- `hooks/use-onboarding-status.ts` returns `profile: null` / `consents:
  null` in the `complete` state. plan-01 hydrates the Convex query with
  the real `userProfiles` / `userConsents` shape; the hook type already
  admits both.
- `pnpm convex:dev` not started (long-running). Downstream phases that
  need the Convex dev server should start it; all static checks on
  `convex/**` pass.

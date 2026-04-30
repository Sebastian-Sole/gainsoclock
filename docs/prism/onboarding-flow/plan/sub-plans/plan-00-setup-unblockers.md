# Sub-Plan 00: Setup & Unblockers

## Dependencies
- **Requires:** nothing — this is the first phase.
- **Blocks:** plan-01 (schema depends on deleted legacy stores + entitlement constant), plan-02 (state machine needs entitlement constant + rotation doc), plan-03 (analytics needs reactive onboarding-status hook), plan-04 (auth UI needs tri-state guard), plan-07 (AI aha needs OpenAI model abstraction).

## Objective
Clear the ground before anyone else can build on it. Delete the placeholder spotlight tour, replace the two boolean flags that caused the D3 onboarding race with a single reactive tri-state hook, centralise the RevenueCat entitlement ID (currently scattered across two env-var fallbacks + a hardcoded string), and introduce the OpenAI model-abstraction constants that plan-07 will rely on. No new product surface — pure plumbing — but the phase is load-bearing because every other sub-plan assumes these unblockers are in place.

## Context

### Stack facts (apply throughout)
- **Package manager: pnpm only.** `pnpm-workspace.yaml` + `pnpm.overrides` pin `react-native-nitro-modules@0.32.2`. npm/yarn silently drop the override and break the iOS build.
- **Runtime:** Expo SDK 54, React Native 0.81, React 19 (React Compiler enabled). New Architecture is on.
- **Router:** Expo Router 6 with `typedRoutes`. Use `Href<T>` types, never cast paths to `any`.
- **Backend:** Convex with `@convex-dev/auth`. Convex is excluded from the root tsconfig — typecheck Convex via `pnpm convex:dev`, app code via `npx tsc --noEmit`.
- **Styling:** NativeWind v4 + Tailwind 3. Merge classes through `cn()` from `lib/utils.ts`.
- **Path alias:** `@/*` resolves to repo root. In app code: `@/hooks/use-onboarding-status`. Inside `convex/` use relative imports.

### Coding conventions that apply here
- No `any`. Use `unknown` + narrowing or a real type.
- No `enum`. Use string-literal unions (for TS) or `v.union(v.literal(...))` (for Convex validators).
- Path alias `@/*` in app code.
- Every Convex public query/mutation/action opens with `const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Not authenticated");`.
- Wrapper-only imports: `react-native-purchases` only through `hooks/use-purchases.ts` + `stores/subscription-store.ts`. `@kingstinct/react-native-healthkit` only in `lib/healthkit.ts` + `hooks/use-healthkit.ts`. `expo-haptics` only via `lib/haptics.ts`.
- No `console.log` in committed code. Use `__DEV__` guards.
- No `ts-ignore`, `ts-expect-error`, or `as` casts to silence strict-mode errors.

### Gate decisions + themes that apply
- **D3 (onboarding race):** single reactive source of truth for onboarding completion — no dual-boolean flags split between Zustand and Convex. The fix lands here in plan-00 and is consumed by plan-04 (auth guard) and plan-05 (intake _layout).
- **Theme K — entitlement boundary:** `ENTITLEMENT_ID = "fitbull_pro"` is a **code constant** in `lib/subscription-constants.ts`, not an env var. Imported from both `convex/` and client. RevenueCat F2.
- **Convex-Realtime C3 + Offline-Sync #4:** the onboarding-status hook is reactive (`useQuery`), offline-fallback only when the network provider reports offline, and never defaults to `"complete"` on uncertainty.

### Files this sub-plan touches
- **New:**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/subscription-constants.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-onboarding-status.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/convex/openai-config.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/docs/revenuecat-webhook-rotation.md`
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-purchases.ts` (line 51 entitlement ref; first-active-entitlement fallback at lines 65–75)
  - `/Users/sebastiansole/Documents/gainsoclock/convex/subscriptions.ts` (line 139 entitlement ref)
  - `/Users/sebastiansole/Documents/gainsoclock/convex/chatActions.ts` (refactor OpenAI model access through `openai-config.ts`)
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-auth-guard.ts` (wire to `useOnboardingStatus`)
  - `/Users/sebastiansole/Documents/gainsoclock/app/_layout.tsx` (unmount `OnboardingProvider` + remove tour overlays)
  - `/Users/sebastiansole/Documents/gainsoclock/stores/auth-cache-store.ts` (the persisted `hasCompletedOnboarding` mirror — single offline source)
- **Deleted:**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/onboarding-steps.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/providers/onboarding-provider.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/stores/onboarding-store.ts` (the Zustand store that holds the duplicate `hasCompletedOnboarding` boolean — the tri-state hook replaces it)
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/onboarding-card.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/onboarding-tooltip.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/onboarding-overlay.tsx`
  - Any `use-onboarding-target.ts` hook referenced by the tour overlay

If any of the delete targets do not exist (name drift), search for references via Grep and delete what's actually there; do not invent new files.

### Data contracts

**`lib/subscription-constants.ts`** — single literal export:
```ts
export const ENTITLEMENT_ID = "fitbull_pro" as const;
export type EntitlementId = typeof ENTITLEMENT_ID;
```

**`convex/openai-config.ts`** — model abstraction:
```ts
export const OPENAI_AHA_MODEL = process.env.OPENAI_AHA_MODEL ?? "gpt-5.2";
export const OPENAI_AHA_FALLBACK_MODEL =
  process.env.OPENAI_AHA_FALLBACK_MODEL ?? "gpt-5.2-chat-latest";
// chat uses the same primary model; fallback ladder shared for consistency.
export const OPENAI_CHAT_MODEL = OPENAI_AHA_MODEL;
```
Use `process.env` directly (Convex reads env vars this way). Do not import `dotenv`.

**`hooks/use-onboarding-status.ts`** — reactive tri-state:
```ts
type OnboardingStatus =
  | { status: "loading" }
  | { status: "pending"; profile?: undefined; consents?: undefined }
  | { status: "complete"; profile: UserProfile | null; consents: ConsentMap | null };

export function useOnboardingStatus(): OnboardingStatus;
```
- Reads `useQuery(api.user.getOnboardingStatus)` — a query that returns `{ hasCompletedOnboarding: boolean; profile: UserProfile | null; consents: ConsentMap | null }`. In plan-00, `profile` and `consents` may be `null` — the query returns them as optional stubs until plan-01 backs them with real tables.
- If `useQuery` returns `undefined` (loading), check `NetworkProvider` via `useNetworkState()`:
  - Offline → read `auth-cache-store.hasCompletedOnboarding` → map to `"complete"` or `"pending"`.
  - Online → return `"loading"`.
- Never defaults to `"complete"` on `undefined`. This is the fix for D3.
- On every server transition `hasCompletedOnboarding → true`, write-through to `auth-cache-store` so offline cold-boot holds truth.

### Gotchas (from reviews)
- **Convex-Realtime C3 / Offline-Sync #4:** the hook must not trigger `router.replace` during `"loading"`. `use-auth-guard.ts` shows a splash / last-route during loading rather than routing forward. If you change auth-guard to route forward unconditionally, you reintroduce the race.
- **Theme K / RC F2:** after this phase, grep must return zero hits for `REVENUECAT_ENTITLEMENT_ID`, `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, and `?? "Fitbull Pro"`. The "first active entitlement" fallback at `hooks/use-purchases.ts:65-75` is a silent source of bugs and must be deleted in the same PR — not left with a TODO.
- **React Compiler:** `useOnboardingStatus` is called every render — no conditional hooks, no ref mutations during render. Memoise the mapped status object with `useMemo` only if the consumer chain actually benefits; the compiler otherwise handles it.

## Implementation

1. **Create `lib/subscription-constants.ts`**
   - **What:** single-export file with `ENTITLEMENT_ID` + type alias (see Data contracts above).
   - **Approach:** literal `as const` export; no functions.
   - **Test:** `npx tsc --noEmit`.

2. **Migrate `hooks/use-purchases.ts`**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/hooks/use-purchases.ts`
   - **What:** at line 51 replace whatever reference pulls the entitlement ID (env var or hardcoded string) with `import { ENTITLEMENT_ID } from "@/lib/subscription-constants";`. At lines 65–75 delete the "first active entitlement" fallback branch — if `ENTITLEMENT_ID` isn't on `customerInfo.entitlements.active`, treat the user as non-pro. Do not silently promote another entitlement.
   - **Preserve:** the `Purchases = rnpModule.default ?? rnpModule` lazy-require pattern (RC F4). Do not touch it in this phase.
   - **Test:** `npx tsc --noEmit`; manual smoke — launch app, confirm subscription state still resolves for the developer's logged-in user.

3. **Migrate `convex/subscriptions.ts`**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/convex/subscriptions.ts`
   - **What:** at line 139 replace the env-var reference with an import from `../lib/subscription-constants` (relative, since inside `convex/`). Delete the `?? "Fitbull Pro"` fallback.
   - **Test:** `pnpm convex:dev` deploys cleanly.

4. **Remove legacy env vars**
   - **What:** grep the repo for `REVENUECAT_ENTITLEMENT_ID` and `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`. Remove every reference (code, `.env.example` comments, any `app.config.*` lookups). Expected zero hits after this step.
   - **Test:** `Grep` output empty; `pnpm lint` clean.

5. **Create `hooks/use-onboarding-status.ts`**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/hooks/use-onboarding-status.ts`
   - **What:** reactive tri-state hook per Data contract.
   - **Approach:** `useQuery(api.user.getOnboardingStatus)` + `useNetworkState()` from `providers/network-provider.tsx` + `useAuthCacheStore()` selector for `hasCompletedOnboarding`.
   - **Note:** the Convex query `api.user.getOnboardingStatus` may already exist (today's `convex/user.ts:74-101` has `completeOnboarding`). If the query doesn't exist or returns the wrong shape, add a thin read-only query that returns `{ hasCompletedOnboarding, profile: null, consents: null }` for now — plan-01 replaces it with the real shape.
   - **Write-through:** in an effect, when `status === "complete"`, call `useAuthCacheStore.getState().setHasCompletedOnboarding(true)`.
   - **Test:** `npx tsc --noEmit`; manual — verify the hook returns `"loading"` at first paint, flips to `"pending"` for a fresh user, and `"complete"` for a user that has already run the old `completeOnboarding`.

6. **Wire `hooks/use-auth-guard.ts` to the tri-state**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/hooks/use-auth-guard.ts`
   - **What:** replace whatever read of `hasCompletedOnboarding` exists (Zustand or direct query) with `useOnboardingStatus()`. Guard rule:
     - `"loading"` → do nothing (no `router.replace`); return early. Caller shows splash.
     - `"pending"` → `router.replace("/onboarding/goal")` (the new route tree — plan-05 ships it; for now route to the existing `/onboarding` path and note in a `TODO(plan-05)` comment that the destination changes).
     - `"complete"` → `router.replace("/(tabs)")`.
   - **Test:** `npx tsc --noEmit`; manual — cold-boot the app signed out, signed in with onboarding pending, signed in with onboarding complete. No flashing/redirect loop.

7. **Delete the spotlight tour**
   - **Files:** delete each path listed under "Deleted" in Context.
   - **Approach:** `git rm` each file. After deletion, Grep for any remaining references (imports of `OnboardingProvider`, `onboardingSteps`, `OnboardingCard`, `OnboardingTooltip`, `OnboardingOverlay`). Remove the imports + JSX mount sites.
   - **Root layout:** `/Users/sebastiansole/Documents/gainsoclock/app/_layout.tsx` — unmount `<OnboardingProvider>` wrapper; delete the import. If the tour overlay was composed into a layout, remove it.
   - **Duplicate boolean:** `stores/onboarding-store.ts` is deleted outright — the tri-state hook replaces it. Consumers that read `hasCompletedOnboarding` from this store must be migrated to `useOnboardingStatus()` in the same PR. Find them with Grep on `from "@/stores/onboarding-store"`.
   - **Test:** `pnpm lint`; `npx tsc --noEmit`; app still boots to the legacy `/onboarding` placeholder for pending users (plan-05 replaces the placeholder).

8. **Create `convex/openai-config.ts`**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/convex/openai-config.ts`
   - **What:** per Data contract.
   - **Test:** `pnpm convex:dev`.

9. **Refactor `convex/chatActions.ts`**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/convex/chatActions.ts`
   - **What:** replace any inline `"gpt-..."` string or `process.env.OPENAI_MODEL` read with `import { OPENAI_CHAT_MODEL } from "./openai-config";`. Use the constant at every OpenAI call site.
   - **Preserve:** tool-calling behaviour, subscription gate, streaming pattern. This is a mechanical replacement, not a functional change.
   - **Test:** `pnpm convex:dev`; manual smoke — send a chat message; confirm reply still streams.

10. **Create `docs/revenuecat-webhook-rotation.md`**
    - **File:** `/Users/sebastiansole/Documents/gainsoclock/docs/revenuecat-webhook-rotation.md`
    - **What:** short (≤ 40 lines) runbook. Sections:
      - Why dual-token (RC F3 / Theme L): rotating a webhook auth token must not drop events mid-flight.
      - How to rotate: set `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` to the current value, generate a new `REVENUECAT_WEBHOOK_AUTH_TOKEN`, push both to RC dashboard one at a time, confirm both accepted, remove the `_PREVIOUS` var after 7 days.
      - What the server does: timing-safe compare against both; accept either.
      - Who owns it: Sebastian. Runbook consumer: plan-02 implementer.
    - **Test:** content review only.

11. **Verify deletions and imports**
    - Grep `onboarding-provider`, `OnboardingProvider`, `onboarding-steps`, `onboarding-card`, `onboarding-tooltip`, `onboarding-overlay`, `REVENUECAT_ENTITLEMENT_ID`, `Fitbull Pro"`, `stores/onboarding-store`. All should return zero code hits (docs/comments may linger; fix those too).
    - `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev` must all pass.

### Test discipline (run after each block of changes, not only at the end)
- Steps 1–4: `npx tsc --noEmit`, `pnpm convex:dev`.
- Steps 5–6: `npx tsc --noEmit`; boot app once to confirm no redirect loop.
- Step 7: `pnpm lint` after each deletion pass.
- Steps 8–9: `pnpm convex:dev`.
- Step 10: content review.
- Final: full `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `lib/subscription-constants.ts` exists and exports `ENTITLEMENT_ID = "fitbull_pro"`.
- [ ] Code: `convex/openai-config.ts` exists and exports `OPENAI_AHA_MODEL`, `OPENAI_AHA_FALLBACK_MODEL`, `OPENAI_CHAT_MODEL`.
- [ ] Code: `hooks/use-onboarding-status.ts` exists and returns the tri-state contract above.
- [ ] Code: `docs/revenuecat-webhook-rotation.md` exists.
- [ ] Deletions: `lib/onboarding-steps.ts`, `providers/onboarding-provider.tsx`, `stores/onboarding-store.ts`, `components/onboarding/onboarding-card.tsx`, `components/onboarding/onboarding-tooltip.tsx`, `components/onboarding/onboarding-overlay.tsx` are removed from the repo.
- [ ] Cleanliness: `Grep` for `REVENUECAT_ENTITLEMENT_ID`, `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, `?? "Fitbull Pro"`, `stores/onboarding-store`, `OnboardingProvider` returns zero hits in `app/`, `components/`, `hooks/`, `lib/`, `stores/`, `convex/`, `providers/`.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Manual smoke: app cold-boots signed out → routes to auth; signed in + onboarding pending → routes to legacy `/onboarding` placeholder (plan-05 replaces it); signed in + onboarding complete → routes to `/(tabs)` with no flash.
- [ ] Manual smoke: kill app with network off after a successful onboarding completion — reboot still routes to `/(tabs)` from cache.
- [ ] D3 race no longer reproduces: in a dev build, force the Convex query to stall by disabling the network after sign-in; the app shows splash/last-route, never routes to `/(tabs)` prematurely.
- [ ] Out-of-scope (explicitly not this phase): any new onboarding screens, new Convex tables, PostHog install, paywall UI changes, AI action changes.

## Risks

- **Risk:** deleting the tour leaves dangling imports (Metro red-screen on boot).
  - **Detect:** `pnpm lint` + `npx tsc --noEmit` + first boot.
  - **Mitigate:** run Grep after each deletion; don't batch deletes without verifying.
  - **Escalate:** if a tour component is referenced from a screen not in the obvious onboarding tree (e.g. tutorial surfaced from Settings), stop and ask before ripping it out.

- **Risk:** deleting `stores/onboarding-store.ts` breaks a consumer that read a non-onboarding field.
  - **Detect:** Grep for `from "@/stores/onboarding-store"` before delete; enumerate every consumer.
  - **Mitigate:** if a consumer reads a field that isn't `hasCompletedOnboarding` (unlikely — this store was purpose-built), leave the store in place and only remove the `hasCompletedOnboarding` slice. Note in PR description.
  - **Escalate:** if more than one non-trivial consumer appears, pause and re-scope.

- **Risk:** `hooks/use-auth-guard.ts` introduces a flicker on cold boot because the cache read is async.
  - **Detect:** cold-boot smoke on a throttled simulator.
  - **Mitigate:** `auth-cache-store` uses synchronous Zustand reads of AsyncStorage-hydrated state; prefer `zustand/middleware/persist` with `skipHydration: false` so the store is ready by first render. If hydration is async, show splash on `loading` + `pending` until hydration flushes.
  - **Escalate:** if the flicker is unavoidable, coordinate with plan-04 (auth guard owner) rather than introducing a new synchronous persistence layer.

- **Risk:** `convex/chatActions.ts` subscription gate regresses because the model refactor touches the same file.
  - **Detect:** manual chat smoke after the refactor.
  - **Mitigate:** change only the model constant reference — do not restructure the action.
  - **Escalate:** if the gate fails, revert the chatActions change in isolation and land the model constant as a separate follow-up PR.

- **Risk:** environment drift — legacy env vars still set in the Convex dashboard.
  - **Detect:** after landing, scan Convex env via the dashboard.
  - **Mitigate:** delete `REVENUECAT_ENTITLEMENT_ID` and `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` from Convex env and the local `.env.local` (if present). Do NOT read `.env.local` — ask the user to delete it if they see it.
  - **Escalate:** if the user's TestFlight build was reading the env-var override, bump the app config version and re-release in plan-10 pre-ship.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green (leave it running; subsequent phases depend on it).
4. Maestro: not applicable this phase (no UI changes).
5. Manual smoke:
   - Cold-boot signed out → auth screen.
   - Cold-boot signed in, onboarding pending → legacy `/onboarding` placeholder.
   - Cold-boot signed in, onboarding complete → `/(tabs)`.
   - Force Convex offline mid-sign-in → splash / last route, no premature `/(tabs)` redirect.
6. Report diffs: file paths for every created, modified, and deleted file. Note any Grep hits that survived deletion and why (should be none in src; docs/comments OK if updated).

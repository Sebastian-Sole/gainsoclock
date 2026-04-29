# Implementation Log: plan-03
Status: complete

## Summary

Shipped the funnel-first analytics foundation that every downstream onboarding
phase emits into. Wraps `posthog-react-native` and `posthog-node` in a single
`lib/analytics.ts` module so components only ever call `capture({ name, props })`.
The wrapper enforces three load-bearing invariants:

1. **Compile-time HealthKit firewall.** `NoHealthKitFields<T>` is the
   distributive `Extract<keyof T, ForbiddenKeys> extends never ? T : never`
   conditional — the inert `keyof T extends ForbiddenKeys` shape is referenced
   only in a doc-comment that explains why it's wrong. A type-only negative
   test (`lib/analytics.test-types.ts`) holds three `@ts-expect-error`
   assertions that fail compile if the firewall is ever weakened.
2. **Runtime defence-in-depth.** `capture()` scans prop keys against the
   forbidden set on every call; in `__DEV__` it throws, in prod it warns and
   drops. The same forbidden-key set is duplicated server-side in
   `convex/analytics.ts` so a compromised client can't push body-stat fields
   through the action wrapper.
3. **Consent-gated forwarding.** PostHog initialises `optOut()` and stays
   that way until `setAnalyticsConsent(true)` flips it. Pre-consent, only the
   intake-funnel events (`intake_started`, `intake_resumed`,
   `intake_restarted`, `consent_granted`, `skipped_to_app`) are buffered in a
   module-level in-memory queue (max 50, no AsyncStorage). Granting flushes;
   revoking calls `posthog.optOut()` and clears the buffer.

PostHog construction is deferred via `InteractionManager.runAfterInteractions`
in `providers/posthog-provider.tsx`, mounted below the
`NetworkProvider → ConvexAuthProvider → ConvexSyncProvider` stack so the
consent gate is wired before capture forwards anything. Session-replay is
masked by default (`maskAllTextInputs`, `maskAllImages`,
`maskAllSandboxedViews`) and gated to a route allowlist driven by
`usePathname()` — the default is `stopSessionRecording()`, so any screen we
forget to add to the allowlist stays out of replays. EU host
(`https://eu.i.posthog.com`) and `disableGeoip: true` on both client and
server.

Server-side wrapper (`convex/analytics.ts`) is an `internalAction` (no public
surface) that uses `captureImmediate` with `flushAt: 1` / `flushInterval: 0`
and bounds shutdown via `Promise.race([client.shutdown(2000), timeout(2000)])`
so analytics never blocks the user-facing action.

Also delivered the shared a11y hooks the next phases depend on:
`hooks/use-reduce-motion.ts` (mirrors AccessibilityInfo) and
`hooks/use-rage-quit-tracking.ts` (fires `rage_quit` if the user backgrounds
within 3s of mount; mount-only, never unmount).

The consent gate currently calls `setAnalyticsConsent(false)` on mount with a
`TODO(plan-01)` flag — `api.onboarding.getConsents` doesn't exist on this
branch yet (plan-01 ships it). The wrapper is idempotent, so swapping the
constant for `useQuery(api.onboarding.getConsents)?.analytics?.granted ?? false`
in plan-01/05 is a one-line change.

## Files Created/Modified

### Created
- `lib/analytics.ts` — `AnalyticsEvent` discriminated union, `NoHealthKitFields`
  distributive conditional, `capture`, `setPostHogClient`,
  `setAnalyticsConsent`, `isAnalyticsConsentGranted`, `resetAnalytics`,
  `identifyAnalytics`, `initPostHog`, `startReplayForRoute`, `stopReplay`.
- `lib/analytics.test-types.ts` — three `@ts-expect-error` assertions for
  `weightKg`, `tdee`, and `bmi` (across both bounded-prop and union-prop
  events). Compile-time only.
- `providers/posthog-provider.tsx` — wraps `initPostHog` in
  `InteractionManager.runAfterInteractions`; renders children immediately so
  paint isn't blocked.
- `hooks/use-reduce-motion.ts` — `AccessibilityInfo.isReduceMotionEnabled` +
  change subscription.
- `hooks/use-rage-quit-tracking.ts` — `AppState` listener; fires
  `rage_quit` only when `mount → background` happens in <3000 ms.
- `convex/analytics.ts` — `internalAction` `captureServer({ distinctId,
  eventName, properties })`. EU host, `disableGeoip: true`, `flushAt: 1`,
  `flushInterval: 0`, shutdown bounded by 2s timeout, runtime forbidden-key
  scan. Skips silently when `POSTHOG_API_KEY` is unset.
- `docs/perf/baseline.md` — cold-start + bundle baseline template, privacy
  posture summary, env-var enumeration. Numbers marked `_TODO_` until a dev
  build is in front of an iPhone 12.

### Modified
- `app/_layout.tsx` — added `<PostHogProvider>` between
  `<ConvexSyncProvider>` and `<RootNavigator />`; added a `usePathname`
  effect that calls `startReplayForRoute`; added an
  `(isAuthenticated, userId)` effect that calls `identifyAnalytics` on
  sign-in and `resetAnalytics` on sign-out (only fires on transitions, never
  on re-renders).
- `providers/convex-sync-provider.tsx` — imports `setAnalyticsConsent` from
  `lib/analytics`; calls it with `false` on mount with a `TODO(plan-01)` for
  the consent-query swap site.

### Dependencies
- `posthog-react-native@^4.42.4` (added)
- `posthog-node@^5.29.5` (added)

### Env vars (declared, no values committed)
- `EXPO_PUBLIC_POSTHOG_API_KEY` — Expo / RN client.
- `POSTHOG_API_KEY` — Convex env.
- `POSTHOG_HOST` — Convex env, optional, defaults to `https://eu.i.posthog.com`.

## Tests

- **`npx tsc --noEmit`** → clean (exit 0).
- **`npx tsc --noEmit -p convex/tsconfig.json`** → clean (exit 0). First run
  briefly surfaced a stale `_generated/api.d.ts` referencing
  `onboardingInternal` (a sibling sub-plan committed `convex/onboarding.ts` /
  `convex/onboardingInternal.ts` mid-session); the codegen caught up by the
  next run and the error cleared. None of the residual errors are in
  `convex/analytics.ts`.
- **`pnpm lint`** → 3 errors + 37 warnings, **all pre-existing** in
  `components/nutrition/today-tab.tsx` (matches the baseline recorded in
  `plan-00-log.md`). Zero new lint problems introduced by this phase.
- **Negative-test gate (Phase-3 acceptance):** removed the `@ts-expect-error`
  guarding the `weightKg` call; `npx tsc --noEmit` surfaced
  `lib/analytics.test-types.ts(29,36): error TS2322: Type '{ versionHash:
  string; purposes: string[]; weightKg: number; }' is not assignable to type
  'never'.` Restored the directive; tsc clean again. The firewall is live.
- **`pnpm convex:dev`** not started (long-running). The Convex codegen
  picked up `convex/analytics.ts` between typecheck runs (the generated
  `_generated/api.d.ts` now lists `analytics: typeof analytics`).

### Manual smokes — deferred (require a dev build)
- Pre-consent buffering → flush on grant.
- Session-replay start/stop on `/onboarding/goal` ↔ `/onboarding/healthkit`.
- Rage-quit `mount → background` within 3s.
- Cold-start before/after measurement on iPhone 12 (`docs/perf/baseline.md`
  has the table waiting).
- Bundle-size delta via `expo export` (table waiting).

These can't be exercised from the static-check tier; they're listed as
acceptance items for the dev-build smoke pass and `plan-10`'s perf audit.

## Notes for downstream phases

- **plan-04 / plan-05 / plan-06 / plan-08 / plan-09:** import `capture` from
  `@/lib/analytics`. The `AnalyticsEvent` union covers every event listed in
  the master plan. The firewall will refuse any `props` shape containing
  HealthKit fields; if you genuinely need a new event, extend the union in
  `lib/analytics.ts` rather than reaching for `as`.
- **plan-07 (server-side aha events):** call
  `ctx.runAction(internal.analytics.captureServer, { distinctId, eventName,
  properties })` from inside the aha action. `distinctId` is the Convex
  `userId` (matches what `app/_layout.tsx` passes to `identifyAnalytics`).
- **plan-01 (consent table):** swap the `TODO(plan-01)` line in
  `providers/convex-sync-provider.tsx`:
  ```ts
  const consents = useQuery(api.onboarding.getConsents);
  useEffect(() => {
    setAnalyticsConsent(consents?.analytics?.granted ?? false);
  }, [consents]);
  ```
  No other consumer changes required — the wrapper's gate is idempotent.
- **plan-10 perf gate:** populate the `_TODO_` rows in
  `docs/perf/baseline.md` and verify ≤ +400 ms cold-start delta and
  ≤ 350 KB gzipped bundle delta. If bundle is over budget, dynamic-import
  `posthog-react-native` from `initPostHog` (the constructor already lives
  inside an `import("posthog-react-native")`).
- **`api.user.me` returns `Id<"users">`** — the identify effect treats this
  as a string (`typeof === "string"`); branded `Id` collapses to `"string"`
  at runtime. If a future refactor changes `me` to return an object, update
  the guard.

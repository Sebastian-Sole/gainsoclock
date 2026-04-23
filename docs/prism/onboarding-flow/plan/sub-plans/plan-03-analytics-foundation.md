# Sub-Plan 03: Analytics Foundation

## Dependencies
- **Requires:** plan-00 (reactive onboarding-status hook; model abstraction; spotlight tour deleted — PostHog provider mounts in the space the deleted `OnboardingProvider` used to occupy).
- **Blocks:** plan-04 (auth screens emit `auth_method_selected`, `auth_succeeded`, `skipped_to_app`), plan-05 (intake screens emit `goal_set`/`experience_set`/`days_set`/`consent_granted`/`intake_*`), plan-06 (HealthKit primer emits scope-only events), plan-07 (aha action emits server-side events via `posthog-node`), plan-08 (paywall events + `revenuecat_ui_unavailable`), plan-09 (`activation_gate_*` events).

## Objective
Ship the funnel-first analytics layer that every other phase emits into. This phase installs `posthog-react-native` + `posthog-node`, wraps the SDK in a single `lib/analytics.ts` that enforces a TypeScript literal-union event schema and a type-level-plus-runtime HealthKit-field firewall, wires session-replay to a route allowlist that excludes every screen with body-stats on it, adds a rage-quit hook, mounts the PostHog provider deferred via `InteractionManager` to stay under the +400ms cold-start budget, and gates all forwarding behind the `analytics` consent row from `userConsents`. Nothing personal, nothing derived, nothing special-category leaves the device before S6. No product surface — pure instrumentation.

## Context

### Stack facts
- **Package manager:** pnpm.
- **Runtime:** Expo SDK 54, React Native 0.81, React 19, React Compiler on. PostHog RN SDK is React-provider-based.
- **Router:** Expo Router 6. Session-replay start/stop is driven by Router's transition events (`usePathname()` or the router event bus).
- **Backend:** Convex. `posthog-node` runs inside Convex actions with `"use node"` directive.
- **Path alias:** `@/*`.
- **Persistence:** PostHog RN uses AsyncStorage for its own queue; do not introduce a second persistence layer.

### Coding conventions that apply here
- No `any`. The type-level firewall is load-bearing — if a `props` object were typed `any`, the firewall becomes a no-op.
- No `enum`. `AnalyticsEvent` is a discriminated literal union.
- `getAuthUserId` on every Convex public handler. The server analytics wrapper (`convex/analytics.ts`) uses the internal action pattern so it can be called from within other server actions without re-authenticating.
- Wrapper-only imports: `posthog-react-native` is imported ONLY from `lib/analytics.ts` and `providers/posthog-provider.tsx`. Components call `capture({ name, props })` — not PostHog directly.
- Every interactive element gets `accessibilityLabel` + `accessibilityRole`. Instrumentation should not interfere with a11y tree (session replay masks inputs; no visual overlay).

### Gate decisions + themes that apply
- **Theme A (type firewall) / Security CR1 / HealthKit-Privacy CR1:** the firewall must be a distributive conditional. The inert `keyof T extends ForbiddenKeys` version must never ship again. A type-only negative-test file confirms a ts(2322) at compile time.
- **Theme B / HealthKit-Privacy CR2 / Performance #3:** session-replay route allowlist mechanism via `posthog.startSessionRecording()` / `stopSessionRecording()` at Expo Router transitions. Replay OFF on S5/S5a/S5b/S7/S8/S11/auth; ON for S1/S2/S3/S4/S6-chrome/S9/S10. `maskAllInputs: true` globally.
- **HealthKit-Privacy C1:** `analytics` consent row required before PostHog starts capturing. `intake_started` buffered in-memory from S1, flushed only if granted at S6.
- **Performance #5:** PostHog init deferred via `InteractionManager.runAfterInteractions`. Cold-start budget ≤ +400ms over baseline, measured on iPhone 12 and documented in `docs/perf/baseline.md`.
- **Performance #3:** bundle delta ≤ 350KB gzipped. Verify via `expo export` size comparison.
- **Offline-Sync #8:** PostHog RN disk-persists + flushes on reconnect. Canary Maestro uses 24h window.
- **Security #7:** `posthog-node` wrapped in `Promise.race([client.shutdown(), timeout(2000)])`; assert `OPENAI_API_KEY` at action entry (the analytics action doesn't call OpenAI, but the same discipline applies — never log keys).
- **Mobile-A11y #6:** the shared `hooks/use-reduce-motion.ts` hook is part of this phase so every animated component built in plans 05/07/08 consumes it from day 1.

### Files this sub-plan touches
- **New:**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/analytics.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/lib/analytics.test-types.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/providers/posthog-provider.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-rage-quit-tracking.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-reduce-motion.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/convex/analytics.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/docs/perf/baseline.md`
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/app/_layout.tsx` — mount PostHog provider deferred via `InteractionManager.runAfterInteractions`, after Convex auth + `useAuthGuard` + NetworkProvider.
  - `/Users/sebastiansole/Documents/gainsoclock/providers/convex-sync-provider.tsx` — subscribe to `userConsents.analytics` changes; toggle PostHog capture gate.
- **Dependencies:** `pnpm add posthog-react-native posthog-node`. Expo peers (if any missing) installed via `expo install`.

### Data contracts

**`lib/analytics.ts`** — event schema (discriminated literal union, covers every event emitted across phases):

```ts
export type AnalyticsEvent =
  | { name: "intake_started"; props: Record<string, never> }
  | { name: "auth_method_selected"; props: { method: "apple" | "email" } }
  | { name: "auth_succeeded"; props: { method: "apple" | "email" } }
  | { name: "skipped_to_app"; props: { reason: "experienced_lifter" } }
  | { name: "intake_resumed"; props: Record<string, never> }
  | { name: "intake_restarted"; props: Record<string, never> }
  | { name: "goal_set"; props: { goals: string[]; primaryGoal: string } }
  | { name: "experience_set"; props: { experience: "beginner" | "returning" | "experienced" } }
  | { name: "days_set"; props: { count: number; weekdays: number[] } }
  | { name: "healthkit_primer_shown"; props: Record<string, never> }
  | { name: "healthkit_granted"; props: { grantedScopes: string[] } }
  | { name: "healthkit_denied"; props: Record<string, never> }
  | { name: "healthkit_reask_shown"; props: Record<string, never> }
  | { name: "healthkit_reask_granted"; props: Record<string, never> }
  | { name: "healthkit_reask_dismissed"; props: Record<string, never> }
  | { name: "manual_stats_complete"; props: { dataSource: "healthkit" | "manual" | "mixed" } }
  | { name: "consent_granted"; props: { versionHash: string; purposes: string[] } }
  | { name: "plan_generation_started"; props: Record<string, never> }
  | { name: "plan_first_byte"; props: { latencyMs: number } }
  | { name: "plan_visible"; props: { latencyMs: number } }
  | { name: "plan_continue_tapped"; props: Record<string, never> }
  | { name: "plan_generation_failed"; props: { reason: string } }
  | { name: "plan_fallback_shown"; props: Record<string, never> }
  | { name: "paywall_interstitial_shown"; props: { trialEligible: boolean } }
  | { name: "paywall_presented"; props: { placementId: string } }
  | { name: "revenuecat_ui_unavailable"; props: Record<string, never> }
  | { name: "trial_started"; props: { source: "rc_intro" | "app_local" | "rc_temp" } }
  | { name: "trial_confirmation_shown"; props: Record<string, never> }
  | { name: "paid_converted"; props: { productId: string } }
  | { name: "reminder_email_sent"; props: { hoursBeforeCharge: number } }
  | { name: "rage_quit"; props: { screen: string; msSinceMount: number } }
  | { name: "screen_render_ms"; props: { screen: string; ms: number } }
  | { name: `activation_gate_${string}`; props: Record<string, never> };
```

**HealthKit firewall — distributive conditional (Security CR1):**

```ts
type ForbiddenKeys =
  | "weightKg" | "heightCm" | "ageYears" | "biologicalSex" | "bodyFatPercent"
  // derived metrics:
  | "activityLevel" | "tdee" | "bmr" | "bmi" | "caloriesBurned"
  | "workoutDurationSec" | "restingHeartRate" | "activeCalories";

// Extract<keyof T, ForbiddenKeys> is the INTERSECTION of T's keys with the forbidden set.
// If empty, T passes through; otherwise we substitute `never` so the caller sees ts(2322).
export type NoHealthKitFields<T> =
  Extract<keyof T, ForbiddenKeys> extends never ? T : never;

export function capture<E extends AnalyticsEvent>(
  event: E & { props: NoHealthKitFields<E["props"]> }
): void {
  // 1) runtime key-scan defense-in-depth
  // 2) analytics consent gate: drop if userConsents.analytics is not granted
  // 3) if captureBuffer active (pre-S6), buffer to in-memory queue
  // 4) if mode is "buffered" and event is "intake_started", enqueue even pre-consent (per HK-Privacy C1)
  // 5) forward to posthog.capture(name, props) on flush
}
```

`lib/analytics.test-types.ts` — type-only negative test:
```ts
import { capture } from "./analytics";
// Expected: @ts-expect-error — ForbiddenKeys contains weightKg
capture({ name: "consent_granted", props: { versionHash: "abc", purposes: [], weightKg: 82 } });
```
Phase 3 exit criterion: `npx tsc --noEmit` surfaces the error at the `capture(...)` line. If the expect-error is missing, the firewall is inert.

**`providers/posthog-provider.tsx`** — deferred init:
```ts
export function PostHogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    InteractionManager.runAfterInteractions(async () => {
      await initPostHog({
        apiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
        host: "https://eu.i.posthog.com",
        captureNativeAppLifecycleEvents: false,
        captureScreens: false,
        enableSessionRecording: true,   // globally ON; per-route start/stop gates it
        sessionRecordingConfig: {
          maskAllInputs: true,
          recordVideo: false,
          maxSessionBufferSizeBytes: 5_000_000,
          sessionTimeoutSeconds: 900,
        },
        disableGeoip: true,
      });
      setReady(true);
    });
  }, []);
  // Children render regardless of ready — capture() buffers until init completes.
  return <>{children}</>;
}
```

**Session-replay gating** — a hook in `lib/analytics.ts`:
```ts
const REPLAY_ALLOWLIST = new Set([
  "/(auth)/_sign-up-public",   // per-route notional IDs; real IDs pulled from pathname
  "/onboarding/goal", "/onboarding/experience", "/onboarding/days",
  "/onboarding/consent",       // chrome-only; content values masked
  "/onboarding/paywall", "/(tabs)",
]);
// everything else — S5 primer, S5a, S5b, S7, S8, S11, all (auth)/* — replay OFF.
```
Register a `useEffect` listener on `usePathname()` that calls `posthog.startSessionRecording()` or `stopSessionRecording()` accordingly. Default is `stopSessionRecording()` (opt-out only; never opt-in by default).

**Consent gate:** `capture()` reads `useSubscriptionToAnalyticsConsent()` — a thin wrapper over `useQuery(api.onboarding.getConsents)` that exposes `analyticsGranted: boolean`. If false:
- Events `intake_started`, `intake_resumed`, `intake_restarted`, `skipped_to_app`, `consent_granted` are **buffered** in a module-level in-memory queue (max 50 events).
- Everything else is dropped.
- On `consent_granted` event firing with analytics granted, flush the buffer to PostHog.
- On consent revocation (future event via Settings in plan-08), call `posthog.reset()` + clear buffer.

**`posthog-node` wrapper (`convex/analytics.ts`):**
```ts
"use node";
import { PostHog } from "posthog-node";
export async function captureServer(event: AnalyticsEvent, distinctId: string): Promise<void> {
  const client = new PostHog(process.env.POSTHOG_API_KEY!, {
    host: "https://eu.i.posthog.com",
    flushAt: 1, flushInterval: 0,
  });
  try {
    client.captureImmediate({ distinctId, event: event.name, properties: event.props });
    await Promise.race([client.shutdown(), timeout(2000)]);
  } catch (e) {
    // analytics failures never block the user-facing action
    console.warn("posthog-node failed", e);
  }
}
```

**`hooks/use-reduce-motion.ts`:**
```ts
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => mounted && setEnabled(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", v => mounted && setEnabled(v));
    return () => { mounted = false; sub.remove(); };
  }, []);
  return enabled;
}
```

**`hooks/use-rage-quit-tracking.ts`:**
```ts
export function useRageQuitTracking(screen: string): void {
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        const dt = Date.now() - mountedAt.current;
        if (dt < 3000) {
          capture({ name: "rage_quit", props: { screen, msSinceMount: dt } });
        }
      }
    });
    return () => sub.remove();
  }, [screen]);
}
```

### Gotchas (from reviews, pulled inline)

- **Security CR1 / HealthKit-Privacy CR1:** the firewall must be `Extract<keyof T, ForbiddenKeys> extends never ? T : never`. The earlier inert version (`keyof T extends ForbiddenKeys ? never : T`) does NOT distribute over union keys. Test it with a props type that has one forbidden key alongside ten allowed keys — it must fail.
- **Performance #3:** bundle audit in plan-10 will gate on ≤350KB gzipped delta. If PostHog RN (currently ~250–300KB) pushes total delta over budget, consider deferring session-replay module to a dynamic import.
- **Performance #5:** DO NOT mount the PostHog provider synchronously. Use `InteractionManager.runAfterInteractions` inside a `useEffect`. First meaningful paint happens before PostHog init.
- **HealthKit-Privacy C1:** the `analytics` consent row is required before capture forwards. Pre-S6 in-memory buffering covers the intake funnel — do not persist this buffer to AsyncStorage (would be tracking-before-consent).
- **Offline-Sync #8:** PostHog RN already persists to AsyncStorage (its own queue). Don't duplicate.
- **Security Obs #1:** `convex/analytics.ts` handlers open with `getAuthUserId`; never accept `userId` as a public arg.
- **Events fire forward-only (pre-mortem):** instrument on screen **mount** / action **initiation**, not unmount. `intake_started` on S1 mount, not S1 unmount. This is a review-derived rule; if a reviewer asks for unmount events, decline.

## Implementation

1. **Install dependencies.**
   - `pnpm add posthog-react-native posthog-node`
   - Run `expo install` for any Expo peer warnings.
   - **Test:** `pnpm lint`; `npx tsc --noEmit`.

2. **Capture cold-start baseline.**
   - **File:** `docs/perf/baseline.md`
   - **What:** before mounting PostHog, measure cold-start → first paint on iPhone 12 dev build. Record in the doc. Three runs, median.
   - **Approach:** `console.time("cold-start")` in `app/_layout.tsx` (`__DEV__`-gated); `console.timeEnd` after first `useEffect` in the root. Acceptable to use Flipper or Xcode Instruments if preferred.
   - **Test:** `docs/perf/baseline.md` has a "before" row with a timestamp and device.

3. **Create `hooks/use-reduce-motion.ts`.**
   - **What:** per Data contract.
   - **Test:** `npx tsc --noEmit`.

4. **Create `lib/analytics.ts`.**
   - **What:**
     - `AnalyticsEvent` union per Data contract.
     - `ForbiddenKeys` + `NoHealthKitFields` per Data contract.
     - `capture()` with (a) runtime key-scan (throws in `__DEV__`, drop+warn in prod), (b) consent gate, (c) pre-consent buffer, (d) forward to `posthog.capture`.
     - `initPostHog({ ... })` helper used by the provider.
     - `startReplayForRoute(pathname: string)` / `stopReplay()` — called from the route hook.
   - **Approach:** module-level PostHog client reference, lazy-initialised by provider. Pure functions where possible.
   - **Test:** `npx tsc --noEmit`.

5. **Create `lib/analytics.test-types.ts`.**
   - **What:** type-only negative test per Data contract.
   - **Approach:** use `@ts-expect-error` on the forbidden call. The file is imported nowhere; `tsc` still type-checks it.
   - **Test:** `npx tsc --noEmit` compiles (the `@ts-expect-error` consumes the error). Remove the expect-error line temporarily to confirm it fires ts(2322), then put it back — this is the Phase 3 exit gate.

6. **Create `providers/posthog-provider.tsx`.**
   - **What:** per Data contract.
   - **Approach:** children render immediately; PostHog init happens after interactions. No visible loading state.
   - **Test:** `npx tsc --noEmit`.

7. **Create `hooks/use-rage-quit-tracking.ts`.**
   - **What:** per Data contract.
   - **Approach:** `AppState` listener + `useRef` for mount time. Remove listener on unmount.
   - **Test:** `npx tsc --noEmit`.

8. **Create `convex/analytics.ts`.**
   - **What:** `captureServer` internal action per Data contract. Do NOT expose as a public action — plan-07 calls it from other actions.
   - **Approach:** `"use node"`; `PostHog` from `posthog-node`.
   - **Test:** `pnpm convex:dev`.

9. **Mount PostHog + session replay gating in `app/_layout.tsx`.**
   - **What:**
     - Wrap tree in `<PostHogProvider>` AFTER Convex auth provider + `useAuthGuard` resolution + `NetworkProvider` (mount order per §3.6 of master plan).
     - Add a `useEffect` on `usePathname()` that calls `startReplayForRoute` / `stopReplay` per the allowlist.
     - Call `posthog.reset()` on sign-out (wire into `stores/auth-cache-store.clear()` or the auth provider's sign-out handler).
     - Call `posthog.identify(userId)` on sign-in; relies on PostHog's auto-merge of anonymous→authenticated `distinct_id`.
   - **Approach:** incremental addition; do not refactor existing provider tree.
   - **Test:** `npx tsc --noEmit`; cold-boot the app, watch PostHog dashboard for a test event fired from a dev button. Measure post-mount cold-start time; verify delta ≤ +400ms over the baseline captured in step 2. Append an "after" row to `docs/perf/baseline.md`.

10. **Wire consent gate.**
    - **File:** `providers/convex-sync-provider.tsx` or the PostHog provider itself.
    - **What:** subscribe to `useQuery(api.onboarding.getConsents)`. When `analytics.granted` flips true, call `posthog.optIn()` (PostHog RN exposes `optIn`/`optOut`) AND flush the in-memory buffer. When it flips false, call `posthog.optOut()` and clear the buffer.
    - **Test:** manual — in a dev build, use the Convex dashboard to toggle an `analytics` consent row for a test user; confirm PostHog starts/stops capturing.

11. **Document EU host + opt-out in privacy policy doc.**
    - **What:** append a note to `docs/perf/baseline.md` (or a new `docs/privacy-analytics.md`) confirming PostHog host is `eu.i.posthog.com`, IP capture is off, session-replay masks inputs by default, and opt-out is wired to the consent gate.
    - **Test:** content review.

12. **Verify bundle delta.**
    - **What:** run `npx expo export --platform ios --dump-sourcemap` before and after the PostHog install (the "before" run is from step 2 via `git stash`). Compare gzipped sizes; record in `docs/perf/baseline.md`.
    - **Test:** delta ≤ 350KB gzipped. If over, open an issue and defer session-replay to plan-10.

### Test discipline
- After step 4: `npx tsc --noEmit`.
- After step 5: confirm the negative test fires when `@ts-expect-error` removed.
- After step 9: cold-boot measurement.
- After step 10: manual consent-toggle smoke.
- Step 12: bundle measurement.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `lib/analytics.ts` exports `AnalyticsEvent`, `capture`, `initPostHog`, `startReplayForRoute`, `stopReplay`.
- [ ] Code: `NoHealthKitFields` uses `Extract<keyof T, ForbiddenKeys> extends never ? T : never`. Grep for `keyof T extends ForbiddenKeys` returns zero hits.
- [ ] Code: `ForbiddenKeys` includes all derived metrics (`activityLevel`, `tdee`, `bmr`, `bmi`, `caloriesBurned`, `workoutDurationSec`, `restingHeartRate`, `activeCalories`).
- [ ] Code: `lib/analytics.test-types.ts` — removing the `@ts-expect-error` reveals ts(2322). Do this check as part of acceptance and restore the annotation.
- [ ] Code: `capture()` runtime key-scan throws in `__DEV__`; drops + warns in prod.
- [ ] Code: `capture()` buffers `intake_started`/`intake_resumed`/`intake_restarted`/`consent_granted` pre-S6; drops everything else until analytics consent is granted.
- [ ] Code: `providers/posthog-provider.tsx` defers init via `InteractionManager.runAfterInteractions`.
- [ ] Code: `app/_layout.tsx` mounts the provider AFTER Convex auth provider, `useAuthGuard` resolution, and `NetworkProvider`.
- [ ] Code: `convex/analytics.ts` uses `"use node"`, `captureImmediate`, `flushAt: 1`, `flushInterval: 0`, and `Promise.race([shutdown, timeout(2000)])`.
- [ ] Code: session-replay allowlist matches exactly the routes listed in Data contracts. S5 / S5a / S5b / S7 / S8 / S11 / `(auth)/*` are OFF.
- [ ] Code: `hooks/use-reduce-motion.ts` + `hooks/use-rage-quit-tracking.ts` exist with the signatures above.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Perf: `docs/perf/baseline.md` shows before/after cold-start; delta ≤ +400ms on iPhone 12.
- [ ] Perf: bundle delta ≤ 350KB gzipped (recorded in baseline doc).
- [ ] Manual smoke: a dev button calling `capture({ name: "intake_started", props: {} })` pre-consent stays in the buffer and appears in PostHog only after an `analytics` consent row is inserted.
- [ ] Manual smoke: session replay starts on `/onboarding/goal` entry and stops on `/onboarding/healthkit` entry (verified via PostHog dashboard).
- [ ] Manual smoke: rage-quit — mount a screen, background the app within 3s, return; PostHog shows `rage_quit` with `msSinceMount < 3000`.
- [ ] Env vars declared (for plan-10's enumeration): `EXPO_PUBLIC_POSTHOG_API_KEY` (Expo), `POSTHOG_API_KEY` (Convex). Do NOT commit values.
- [ ] Out-of-scope: paywall/chat events (plans 07/08/09), server-side event emission from aha action (plan-07 consumes this phase's `captureServer`).

## Risks

- **Risk:** the firewall compiles but never actually fails on a forbidden key because of a subtle generic inference bug.
  - **Detect:** the negative-test file must fail when `@ts-expect-error` is removed.
  - **Mitigate:** run the removal check as part of acceptance — don't ship without doing it.
  - **Escalate:** if `NoHealthKitFields<E["props"]>` fails to distribute in practice, switch to an explicit mapped-type check `{ [K in keyof T]: K extends ForbiddenKeys ? never : T[K] }` and ensure the never-elision surfaces at the callsite.

- **Risk:** PostHog init happens eagerly because a child component reads `usePostHog()` during mount.
  - **Detect:** cold-start measurement blows past baseline.
  - **Mitigate:** PostHog provider must tolerate children reading the client before `ready` — `capture()` buffers unconditionally until the client is initialised.
  - **Escalate:** if a third-party component needs eager access, isolate that component behind `InteractionManager`.

- **Risk:** session-replay fires on S5a body-stat screen because the pathname-matching logic has a trailing-slash mismatch.
  - **Detect:** PostHog session-replay viewer shows a session containing S5a.
  - **Mitigate:** normalise pathnames (strip trailing slash, lowercase) before set membership check. Write an explicit unit-ish dev harness that exercises every route string.
  - **Escalate:** if replay leaks body stats even once, treat as a privacy incident: call PostHog delete API on the session, document, file follow-up.

- **Risk:** pre-consent buffer overflows (50 events) and drops `intake_started`.
  - **Detect:** PostHog funnel shows dropped `intake_started`.
  - **Mitigate:** 50 events is generous for a 2-minute flow. Keep the limit as a safety valve; log a warning if reached.
  - **Escalate:** if legitimate usage hits the cap, raise to 200 — but no higher.

- **Risk:** `posthog-node` server shutdown races Convex action completion.
  - **Detect:** events missing in PostHog for server-side emits.
  - **Mitigate:** `Promise.race([shutdown, timeout(2000)])` with `await` ensures the action waits up to 2s. Accept that on heavy load, server events may drop — analytics must never block the user action.
  - **Escalate:** if drops exceed 1% in plan-10 audit, consider an async write-ahead log in Convex that a cron flushes.

- **Risk:** PostHog RN's built-in `captureScreens` conflicts with manual `screen()` calls.
  - **Detect:** duplicate screen events in PostHog.
  - **Mitigate:** `captureScreens: false` in config (per Data contract). Emit `screen()` manually from `_layout.tsx` effect when/if needed.
  - **Escalate:** only emit screen events from `_layout`, never ad-hoc from components.

- **Risk:** Analytics test file (`lib/analytics.test-types.ts`) accidentally gets treated as a real test by a future runner and breaks CI.
  - **Detect:** future CI config change.
  - **Mitigate:** file is pure TypeScript; add a header comment explaining it's compile-time only.
  - **Escalate:** not urgent.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. Remove the `@ts-expect-error` in `lib/analytics.test-types.ts` temporarily; confirm `npx tsc --noEmit` surfaces ts(2322). Restore the annotation.
5. Cold-boot the app on iPhone 12 or simulator with low power mode to approximate A14; record cold-start in `docs/perf/baseline.md`. Delta ≤ +400ms.
6. Bundle delta measured and recorded. Delta ≤ 350KB gzipped.
7. Manual smoke:
   - Pre-consent `capture` calls buffer.
   - Granting analytics (via Convex dashboard) flushes the buffer.
   - Session replay starts/stops per allowlist.
   - Rage-quit event fires within 3s of mount + background.
8. Maestro: not applicable this phase (plan-10 adds the VoiceOver + reduce-motion flows that rely on `useReduceMotion`).
9. Report diffs: new files, modified files, env var list, perf numbers.

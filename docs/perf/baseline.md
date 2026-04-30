# Cold-start & Bundle Baseline (plan-03)

Tracks the analytics-foundation phase's impact on cold-start and bundle size.
Plan-10 will gate ship on these numbers, so they need a real measurement
once a dev build is in front of an iPhone 12 (or low-power-mode simulator
proxy).

## Cold-start (app launch → first paint, ms)

Measured via `console.time("cold-start")` in `app/_layout.tsx` (`__DEV__`-gated).
Three runs, median.

| When | Build | Device | Median (ms) | Notes |
|---|---|---|---|---|
| _TODO before plan-03 lands_ | dev | iPhone 12 (or sim, low-power) | _pending_ | run before merging plan-03; capture from `git stash` baseline |
| _TODO after plan-03 lands_ | dev | iPhone 12 (or sim, low-power) | _pending_ | PostHog provider mounted, `InteractionManager.runAfterInteractions` deferring init |

**Acceptance:** delta ≤ +400ms (Performance #5).

If the delta is over budget, the most likely cause is a child component
calling `usePostHog()` synchronously and forcing eager init. The fix is to
keep `capture()` as the only public surface — it buffers until the SDK is
ready, so consumers never need to subscribe to the client directly.

## Bundle (gzipped, iOS)

Measured via `npx expo export --platform ios` and comparing the gzipped
output of `dist/_expo/static/js/ios/*.hbc.gz`.

| When | Total (KB gz) | Delta (KB gz) |
|---|---|---|
| _TODO before plan-03_ | _pending_ | — |
| _TODO after plan-03_ | _pending_ | _pending_ |

**Acceptance:** delta ≤ 350 KB gzipped (Performance #3).

If over budget, dynamic-import the session-replay module from the provider
(it's the heaviest part of `posthog-react-native`) and accept that replay
becomes opt-in via a feature flag.

## Privacy posture (PostHog config)

- **Region:** EU host (`https://eu.i.posthog.com`).
- **GeoIP:** disabled (`disableGeoip: true`).
- **Session replay:** masks all text inputs, images, and sandboxed system
  views by default; route-allowlisted (see `lib/analytics.ts` →
  `REPLAY_ALLOWLIST`). S5 / S5a / S5b / S7 / S8 / S11 and `(auth)/*` are
  OFF.
- **Consent gate:** PostHog client is `optOut()` until the
  `userConsents.analytics` row flips to granted. Pre-consent events are
  in-memory buffered (max 50) and only the events listed in
  `PRE_CONSENT_BUFFERABLE` qualify; everything else is dropped silently.
- **Server captures (`convex/analytics.ts`):** EU host, `disableGeoip: true`,
  `flushAt: 1`, `flushInterval: 0`, shutdown bounded at 2s — analytics
  failures never block the user-facing action.

## Env vars

- `EXPO_PUBLIC_POSTHOG_API_KEY` — Expo (RN client). Required for capture to
  forward; absent in dev simply disables PostHog.
- `POSTHOG_API_KEY` — Convex env. Required for `convex/analytics.ts` to
  forward; absent simply skips the server emit (warned).
- `POSTHOG_HOST` — Convex env, optional. Defaults to `https://eu.i.posthog.com`.

Do **not** commit values for any of these.

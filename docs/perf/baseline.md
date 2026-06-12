# Cold-start & Bundle Baseline

Tracks cold-start and bundle size going forward from commit `4500535`.
The plan-03 before/after deltas were never captured; this row restarts the
baseline. Future perf-relevant PRs (new heavyweight dep, provider added to
`_layout`) should re-run Step 2 of plan-022 and append a row.

## Cold-start (app launch → first paint, ms)

Measured via `console.time("cold-start")` in `app/_layout.tsx` (`__DEV__`-gated).
Three runs, median. Marker wired in plan-022.

| When | Build | Device | Median (ms) | Notes |
|---|---|---|---|---|
| Current baseline (2026-06-13, commit `4500535`) | dev | iPhone 12 (or sim, low-power) | _operator: run 3× per the procedure above with the plan-022 marker and record the median_ | manual device step required |

**Acceptance (go-forward delta):** ≤ +400ms vs. the row above (Performance #5).

If the delta is over budget, the most likely cause is a child component
calling `usePostHog()` synchronously and forcing eager init. The fix is to
keep `capture()` as the only public surface — it buffers until the SDK is
ready, so consumers never need to subscribe to the client directly.

## Bundle (gzipped, iOS)

Measured via `npx expo export --platform ios`; gzip the `.hbc` output:
`gzip -k9c dist/_expo/static/js/ios/*.hbc | wc -c`.

| When | Commit | Total (KB gz) | Delta (KB gz) |
|---|---|---|---|
| Current baseline (2026-06-13) | `4500535` | 4,042 | — (baseline row) |

**Acceptance (go-forward delta):** ≤ 350 KB gzipped vs. the most recent row (Performance #3).
Note: the raw `.hbc` is 10,960 KB (11.2 MB); gzipped 4,042 KB. If this number is
startling, plan-027 addresses the likely lucide barrel-import cause.

If over budget, dynamic-import the session-replay module from the provider
(it's the heaviest part of `posthog-react-native`) and accept that replay
becomes opt-in via a feature flag.

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

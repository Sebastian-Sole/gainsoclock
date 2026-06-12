# Pre-Ship Measurements (Sub-plan 10)

Source of truth for the numbers the onboarding master-plan committed to.
Every row below is a gate; leave no cell empty at ship time. Fill in during
the verification session — do not fabricate numbers.

Legend: `[ ]` TODO (human action), `[x]` done with value/link.

---

## G2 — Pricing tier matrix (2026 NOK/SEK/DKK/EUR)

Source: App Store Connect → My Apps → Fitbull → Pricing and Availability →
In-App Purchases → (subscription product) → Territory pricing.

| Storefront | Tier ID | `priceString` rendered | Screenshot |
|---|---|---|---|
| NO (NOK) | | | |
| SE (SEK) | | | |
| DK (DKK) | | | |
| EU (EUR, reference) | | | |

- [ ] RC offering matches ASC prices (RC dashboard → Offerings → Current → verify).
- [ ] Paywall rendered on each storefront via `xcrun simctl` locale change; screenshots attached.

---

## G8 — Methodology citation DOIs

Human-click each link on `app/methodology.tsx` (release build). Broken DOI
→ replace with current canonical URL, update the component, re-verify.

| Citation | Expected target | Status | Replacement (if any) |
|---|---|---|---|
| Schoenfeld (2010+) progressive overload | doi.org/10.1519/JSC.0b013e3181e840f3 | [ ] | |
| Borg RPE (1970) | doi.org/10.3109/02841557009012665 | [ ] | |
| DeLorme (1948) | doi.org/10.2106/00004623-194830030-00014 | [ ] | |
| Mifflin–St Jeor BMR (1990) | doi.org/10.1093/ajcn/51.2.241 | [ ] | |

---

## Cold-start delta (Performance #5)

Budget: ≤ +400ms vs plan-03 baseline on iPhone 12.

| Run | Pre-onboarding (baseline) | Post-onboarding | Delta |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| Mean | | | |

Method: three cold boots per build (simctl `erase` + `boot` between runs),
first-meaningful-paint recorded via `console.time` seam in `app/_layout.tsx`.

---

## Bundle delta (Performance #3)

Budget: ≤ 350KB gzipped vs plan-03 baseline.

```
npx expo export --platform ios --dump-sourcemap
# baseline snapshot: docs/perf/baseline.md
```

| Artifact | Baseline (bytes gz) | Current (bytes gz) | Delta |
|---|---|---|---|
| `_expo/static/js/ios/*.hbc` combined | | | |

---

## Latency budget (Theme H / Performance #1)

Event: `plan_first_byte` — from S7 analysis submit to first byte of the aha
streaming response.

| Network | Percentile | Budget | Measured | n |
|---|---|---|---|---|
| Oslo LTE ≈ WiFi throttle 15 Mbps, 80ms RTT | p50 | ≤ 3.5s | | ≥ 10 |
| Network Link Conditioner — "Slow 3G" | p95 | ≤ 8s | | ≥ 5 |
| Forced 14s stall (dev seam) | p99 | ≤ 14s hard-kill | | 1 |

Dev seam for p99: set `CONVEX_DEBUG_AHA_STALL_MS=14000` on the local Convex
dev instance and drive S7 → S8. The safety-net (plan-07) must terminate the
stream at or before 14s and render the retry affordance.

---

## useQuery concurrency audit (Performance #6)

Budget: ≤ 3 concurrent `useQuery` hooks active per route. Count via React
DevTools → "Components" tab while on the route.

| Route | Count | Notes |
|---|---|---|
| `app/onboarding/welcome` | | |
| `app/onboarding/demo-chat` | | |
| `app/onboarding/demo-meals` | | |
| `app/onboarding/demo-workouts` | | |
| `app/onboarding/founder-note` | | |
| `app/onboarding/healthkit` | | |
| `app/onboarding/paywall` | | |
| `app/(tabs)/index` (home) | | |
| `app/(tabs)/chat` | | |
| `app/(tabs)/plan` | | |
| `app/(tabs)/stats` | | |
| `app/settings/index` | | |
| `app/settings/notifications` | | |

---

## Per-screen render budgets (Performance #9)

| Screen | Budget | Measured |
|---|---|---|
| S2 goal mount | ≤ 150ms | |
| S3 experience mount | ≤ 150ms | |
| S4 days mount | ≤ 150ms | |
| S5 primer mount | ≤ 400ms | |
| S8 aha first pixel post plan_first_byte | ≤ 500ms | |
| Cold-start → sign-up interactive | ≤ 2.2s | |
| S7 narrated avg fps | ≥ 55 fps | |
| Aha carousel avg fps | ≥ 55 fps | |
| Worst frame (either) | ≤ 50ms | |

Capture: Xcode Instruments → Time Profiler + Core Animation (fps).

---

## React Compiler healthcheck

```
npx react-compiler-healthcheck \
  --src "app/onboarding/**/*.{ts,tsx}" \
  --src "components/onboarding/**/*.{ts,tsx}" \
  --src "components/paywall/**/*.{ts,tsx}" \
  --src "components/home/**/*.{ts,tsx}"
```

- [ ] 0 bails across all four globs.
- [ ] CI gate in place: `.github/workflows/react-compiler-healthcheck.yml`.
- [ ] Last green run: <link>

---

## Contrast audit (Mobile-A11y #11)

Every surface introduced in plans 00–09, light + dark. Minimum WCAG 2.1 AA:
4.5:1 text, 3:1 non-text + ≥ 18pt bold.

| Surface | Light | Dark | Tool |
|---|---|---|---|
| Auth sign-in / sign-up | | | |
| S2 goal | | | |
| S3 experience | | | |
| S4 days | | | |
| S5 primer | | | |
| S5a prefill | | | |
| S5b–S8 (deleted intake screens, removed in onboarding rebuild) | n/a | n/a | — |
| Paywall (`app/onboarding/paywall`) | | | |
| Post-paywall activation checklist | | | |
| Settings (Delete account, Restore purchases) | | | |

Tool: iOS Accessibility Inspector → Audit → Contrast (Xcode →
Developer Tools). Paste min/max ratios per surface.

---

## VoiceOver review (Mobile-A11y #12 — BLOCKING)

`.maestro/onboarding/07-voiceover-happy.yaml` executes the click path, but
the gate is the human walk with Screen Curtain on (triple-tap 3 fingers
after VO on). Every interactive element must be announced with a label AND
role; every screen transition must announce the new screen.

- [ ] Screen Curtain walk completed from sign-up → home without sighted assistance.
- [ ] Zero trapped states.
- [ ] Every input has a Label that is also the VO announcement (no placeholder-only labels).
- [ ] Progress dots announce "step X of Y".
- [ ] Aha carousel exposes each tile as a focusable group.
- [ ] Paywall close button focusable and labelled.

---

## Env-var enumeration (Convex-Realtime C10 / Theme K)

Screenshot of production Convex dashboard (values redacted) attached to the
PR and linked here: <link>.

| Var | Scope | Present | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | Convex | | |
| `OPENAI_AHA_MODEL` | Convex | | optional |
| `OPENAI_AHA_FALLBACK_MODEL` | Convex | | optional |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | Convex | | |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` | Convex | | 7d rotation |
| `REVENUECAT_REST_API_KEY` | Convex | | |
| `POSTHOG_API_KEY` | Convex | | server |
| `EMAIL_SERVICE_API_KEY` | Convex | | Resend |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Expo | | |
| `EXPO_PUBLIC_CONVEX_URL` | Expo | | |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Expo | | |

`ENTITLEMENT_ID = "fitbull_pro"` is a code constant, not an env var.

---

## Maestro run log

Target: `maestro test .maestro/onboarding/` fully green, including
`07-voiceover-happy.yaml` and `99-canary.yaml`.

| Flow | Run | Duration | Notes |
|---|---|---|---|
| 01-signup-siwa | | | sim-skip unless real device |
| 02-healthkit-denied | | | |
| 03-intake-happy | | | |
| 04-intake-healthkit-grant | | | sim-skip unless permission pre-granted |
| 05-aha-paywall | | | |
| 06-activation-checklist | | | |
| 07-voiceover-happy | | | BLOCKING |
| 08-reduce-motion | | | |
| 09-skeptic-skip | | | |
| 99-canary | | | weekly CI |

---

## Session-replay watch plan (first 50 TestFlight users)

Screens in replay ALLOWLIST per plan-03: everything except
`S5`, `S5a`, `S5b`, `S7`, `S8`, `S11`, `auth` (those are denylisted — body
stats + email PII).

| # | PostHog session URL | Observations | Follow-up |
|---|---|---|---|
| 1 | | | |
| … | | | |
| 50 | | | |

Scale events only after this review passes (no body-stat leaks, no trapped
states, no crashes).

# Performance Review v2 — Onboarding Overhaul Master Plan

**Reviewer persona:** Performance (response times, rendering, bundle size, data-fetching efficiency, scalability on Nordic LTE / A14 devices)
**Plan reviewed:** `docs/prism/onboarding-flow/plan/master-plan.md` (revised)
**Date:** 2026-04-21
**Supersedes:** `docs/prism/onboarding-flow/reviews/performance.md` v1

A plan that survives my review will survive a Tromsø iPhone 12 on a 3-bar LTE connection. V1 raised 9 blocking items and 1 advisory. I re-read the revised plan, §2 S7/S8, §3.1, §3.3, §3.5, §3.6, §3.8, Phase 3/5/6/7/9/10, and the changelog. Every blocking item has a concrete, numeric, verifiable landing in the plan body. Below, item-by-item verification, then a short list of second-order issues that surfaced on close re-read.

---

## Verification of v1 blocking items

### 1. Three-phase latency budget (§1)

**Verified.** §2 S7 lines 165–171 land `p50 ≤ 3.5s`, `p95 ≤ 8s`, `p99 ≤ 14s` on Oslo LTE / iPhone 12, hard action kill at 14s, p50-extension fourth line *"Refining for your training days…"*, p95 retry affordance while server continues. Phase 7 exit (line 792) and Phase 10 risk row (line 862) repeat the numbers. The `plan_first_byte` / `plan_visible` split is instrumented as distinct events (line 176). Safety-net session at p99 is wired to `lib/onboarding-fallback-session.ts`. This is the single most important change from v1 — honest budget, no 6s guillotine.

### 2. React Compiler health check on `aha.tsx` (§2)

**Verified.** §2 S8 line 194 enumerates the three pitfalls: stable keys (`exercise.exerciseId`), `useAnimatedStyle` correctness ("never read `.value` during render"), `useSharedValue` above conditionals. Phase 7 deliverable line 791 and exit criterion line 821 run `npx react-compiler-healthcheck` against `components/onboarding/*` as a ship gate. Risk row line 884 confirms the chain. Caveat: plan references `components/onboarding/*` but S8 is in `app/onboarding/aha.tsx`; the healthcheck path should include `app/onboarding/**/*.tsx` too. See residual item R1.

### 3. Session replay disabled on animation-sensitive screens (§3)

**Verified.** §3.3 lines 456–458 lock the allowlist: ON for S1/S2/S3/S4/S6-chrome/S9/S10; OFF for S5/S5a/S5b/**S7/S8**/S11/auth. Mechanism `posthog.startSessionRecording` / `stopSessionRecording` on Expo Router transitions. `maskAllInputs: true` globally, `recordVideo: false`, buffer cap `5_000_000` bytes, session timeout 900s. Bundle budget ≤ 350KB gzipped (line 471), failing Phase 3 if exceeded. Deferred init via `InteractionManager.runAfterInteractions` after `useAuthGuard` resolves (line 465).

### 4. AsyncStorage debounce for intake draft (§4)

**Verified.** §3.8 line 667 specifies persist-on-blur + 300ms debounce, NOT per-keystroke. Triggers enumerated: screen-blur, "Next" tap, AppState background listener. Art. 9 slice stays in-memory (Zustand without `persist`), so even if debounce regresses, the weight/height/body-fat fields bypass AsyncStorage entirely — defense in depth. Risk row line 886 confirms.

### 5. Cold-start budget + deferred init order (§5)

**Verified.** §3.6 lines 646–653 specify mount order: (1) Convex auth, (2) `useAuthGuard` + route resolution (first paint), (3) `NetworkProvider`, (4) deferred via `InteractionManager.runAfterInteractions` — PostHog init, `configurePurchases()`, HealthKit module import, session replay start. Budget ≤ +400ms on iPhone 12; baseline captured in `docs/perf/baseline.md`. Phase 3 exit criterion line 749 enforces the delta. Phase 10 line 840 pins cold-start → sign-up interactive ≤ 2.2s absolute.

### 6. Home aggregated query replacing 5 concurrent useQuery (§6)

**Verified.** §2 S10 line 238: *"checklist derives from one `api.home.getActivationState` query that returns all 5 booleans server-side — NOT 5 separate `useQuery` hooks"*. Phase 10 exit criterion: ≤ 3 concurrent `useQuery` per screen. Phase 9 deliverable line 806 commits `convex/home.ts` as a new module owning the aggregated query. Risk row line 887 confirms.

### 7. Aha idempotency across backgrounding (§8)

**Verified.** §3.5 line 526 is the load-bearing paragraph: action opens with `getAuthUserId`, then lookup by `(userId, generationId)`; if status `streaming` AND `updatedAt > now - 60s` → return row unchanged (no re-fire, no double-spend); if older → mark failed; if `complete` → return existing. Client-side `rekickAha` mutation for foreground recovery (line 523). Schema has `by_user_generationId` index (line 302). Risk row line 873 confirms. This is cleaner than I sketched in v1 — the 60s staleness rule gives a clear re-kick boundary.

### 8. Per-screen render-time budgets (§9)

**Verified.** Phase 10 line 840: S2/S3/S4 mount ≤ 150ms; S5 primer ≤ 400ms; S8 aha first pixel ≤ 500ms after `plan_first_byte`; cold-start → sign-up interactive ≤ 2.2s; narrated analysis ≥ 55fps. §2 S8 line 195 repeats the S8 budget in context.

### 9. Image asset format + dimensions (§7)

**Verified.** §2 S2 line 79: WebP, ≤ 40KB each, bundled under `assets/onboarding/`, never fetched, `expo-image` with `contentFit="cover"` + blurhash placeholder, decoded dimensions within 2× of rendered. Phase 5 line 763 enforces in rollout. Narrated-analysis illustration is not explicitly called out but the screen uses Reanimated text only, not illustrations — non-issue.

### 10. HealthKit sample query limits (advisory)

**Verified.** §2 S5a line 126 + Phase 6 line 776: `lib/healthkit.ts` uses `limit: 1` + `sortDescriptors: [endDate DESC]`. Exit target: prefill ≤ 300ms on dev device seeded with 2+ years of samples.

---

## Residual items (non-blocking, worth a quick fix)

**R1. Healthcheck glob.** §2 S8 line 194 and Phase 7 line 791 both point `react-compiler-healthcheck` at `components/onboarding/*.tsx`, but the aha screen lives at `app/onboarding/aha.tsx` and the analysis screen at `app/onboarding/analysis.tsx` — i.e. under `app/`, not `components/`. Expand the glob to `{app,components}/onboarding/**/*.tsx` so the gate actually covers the two frame-sensitive screens it's designed to protect.

**R2. `useOnboardingStatus` cache freshness race.** §3.6 line 646 says the hook "batches with auth-cache-store read — returns immediately from cache, subscribes in background." Good for cold-start, but on a consent-withdrawal server flip, the cached `complete` value will flash briefly before the subscription replaces it. Plan line 643 does update cache on every re-confirmation, but the render-time ordering isn't specified. Suggest: hook returns `{ status, fromCache: boolean }` so consumers can choose to show a subtle loading indicator when `fromCache` is true and the network is online. Not blocking — the current design is correct for the normal-path cold-start it's optimising for.

**R3. Cold-start baseline methodology.** Line 653 says "Measured Phase 3 + Phase 10" and line 748 commits `docs/perf/baseline.md`. The *methodology* (Xcode Instruments Time Profiler? `appLaunchTime` from `react-native-performance`? React Native Performance Monitor?) isn't specified. Pick one and pin it in Phase 3 so the +400ms delta is apples-to-apples.

**R4. Convex `api.home.getActivationState` derivation cost.** Aggregating 5 booleans server-side is the right move, but if any derivation walks a large table (e.g. "has logged at least one workout" on a power user's history), that query grows. Recommend adding an index check in Phase 9 exit: `workoutLogs` queried by `(userId, createdAt)` with `first()` not `collect()`.

---

## Verdict

**APPROVED**

All 9 v1 blocking items are addressed with specific, measurable, testable landings in the plan body. The advisory (#10, HealthKit limits) is also closed. The three-phase latency budget (item #1) and the `generationId` idempotency rule (item #7) are the two changes that meaningfully de-risk the phase where the pre-mortem bled out. The deferred-init mount order, 350KB bundle cap, and per-screen render budgets give the team concrete fail-signals in CI and dogfood.

Residual items R1–R4 are nice-to-have tightenings, not blocking. R1 (healthcheck glob) is the only one I'd strongly recommend landing before Phase 7 ships, and it's a one-character change in Phase 7 deliverable text.

Ship it. The performance story is honest now.

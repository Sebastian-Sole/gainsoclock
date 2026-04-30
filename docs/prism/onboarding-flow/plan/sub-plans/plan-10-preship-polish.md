# Sub-Plan 10: Pre-Ship Polish & Verification

## Dependencies
- **Requires:**
  - plan-00 — unblockers live
  - plan-01 — schema shipped
  - plan-02 — subscription state machine shipped
  - plan-03 — analytics foundation shipped
  - plan-04 — auth UI shipped
  - plan-05 — intake screens shipped
  - plan-06 — HealthKit primer shipped
  - plan-07 — AI aha shipped
  - plan-08 — paywall interstitial + trial + Settings privacy/delete shipped
- **Blocks:** nothing. Final phase before TestFlight + App Store submission.
- **Note:** plan-09 (Mural activation checklist) was cancelled post-implementation; no dependency on it.

## Objective
Close the remaining open questions (G2 pricing matrix, G8 citation DOIs), run the measurement gates that the earlier phases committed to (cold-start, bundle delta, p50/p95/p99 latency, ≤3 concurrent `useQuery`), exercise the nine Maestro flows that cover the ship-critical paths including the blocking VoiceOver gate, verify the React Compiler healthcheck on `app/onboarding/*` as a CI gate, confirm the full environment-variable enumeration is live in production Convex, draft Apple review notes in case the reviewer asks 3.1.2 / 5.1.3 / 4.2 / 5.1.1(v) questions, and spin up the Canary Walker so the first week of production is observed from CI, not from incident channels. No new product scope — every item here is a pre-existing commitment from the master plan.

## Context

### Stack facts
- **Maestro:** `.maestro/` dir; runs against booted iOS simulator with dev client installed. Project convention lives in `.claude/skills/maestro-e2e/SKILL.md`. Preflight: Maestro CLI + IDB installed, simulator booted with the dev client.
- **React Compiler:** `react-compiler-healthcheck` from `react-compiler-healthcheck` npm package (already pinned if present; else `pnpm add -D react-compiler-healthcheck`). Gates on compilation success for every file passed.
- **CI:** GitHub Actions or similar. Canary Walker runs weekly.
- **Network Link Conditioner:** on macOS; use "Slow 3G" profile for p95 measurement, or "100% Loss" to force offline.

### Coding conventions that apply here
- No new source code beyond Maestro flows, docs, and CI workflow files.
- Maestro flows under `.maestro/onboarding/`.
- Do not skip hooks (`--no-verify`) to land polish changes.

### Gate decisions carried into this phase
- **G2:** 2026 NOK/SEK/DKK/EUR tier matrix from App Store Connect.
- **G8:** citation DOIs verified human-click on the methodology page.
- **Performance #5:** cold-start delta ≤ +400ms on iPhone 12.
- **Performance #3:** bundle delta ≤ 350KB gzipped.
- **Performance #9:** per-screen render budgets. S2/S3/S4 mount ≤ 150ms; S5 ≤ 400ms; S8 first pixel ≤ 500ms post first-byte; cold-start → sign-up interactive ≤ 2.2s; ≥ 55fps animations.
- **Theme H latency:** p50 ≤ 3.5s, p95 ≤ 8s, p99 ≤ 14s for `plan_first_byte`.
- **Performance #6:** ≤ 3 concurrent `useQuery` per screen.
- **Mobile-A11y #11:** contrast audit light + dark.
- **Mobile-A11y #12:** `.maestro/onboarding/07-voiceover-happy.yaml` is a BLOCKING ship gate.
- **Convex-Realtime C10 / Theme K:** env-var enumeration table.
- **Offline-Sync #8:** canary Maestro uses 24h window invariants, not 5-minute.
- **Privacy Nutrition Label:** declared correctly (Health & Fitness linked-to-user, NOT tracking).
- **Session-replay human review:** first 50 real TestFlight users before scaling events.

### Files this sub-plan touches
- **New (Maestro):**
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/01-signup-siwa.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/02-healthkit-denied.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/03-intake-happy.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/04-intake-healthkit-grant.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/05-aha-paywall.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/06-activation-checklist.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/07-voiceover-happy.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/08-reduce-motion.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/09-skeptic-skip.yaml`
  - `/Users/sebastiansole/Documents/gainsoclock/.maestro/onboarding/99-canary.yaml`
- **New (CI / docs):**
  - `/Users/sebastiansole/Documents/gainsoclock/.github/workflows/react-compiler-healthcheck.yml` (or equivalent; add gate)
  - `/Users/sebastiansole/Documents/gainsoclock/.github/workflows/canary-walker.yml`
  - `/Users/sebastiansole/Documents/gainsoclock/docs/perf/preship-measurements.md` — final numbers for G2/G8 + latency + cold-start + bundle + compiler healthcheck
  - `/Users/sebastiansole/Documents/gainsoclock/docs/apple-review-notes.md` — draft responses for 3.1.2 / 5.1.3 / 4.2 / 5.1.1(v)
  - `/Users/sebastiansole/Documents/gainsoclock/docs/privacy-nutrition-label.md` — final declared categories for ASC
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/app/methodology.tsx` — verified citations; fix any broken DOIs
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/paywall.tsx` — 2026 storefront copy (NOK/SEK/DKK/EUR) verified via `priceString`

### Data contracts

**Maestro flow naming** — numbered stable set (see file list above). Each flow:
- Named after the phase/feature it exercises.
- Declares a testID-based path through the UI.
- Uses a fresh simulator state per run via `appId:` reset.
- Canary (`99-canary.yaml`) runs invariants over a 24h window (Offline-Sync #8) — e.g. check that `intake_started → consent_granted → plan_visible → trial_started` events appeared in PostHog for the canary user within tolerances.

**Env-var enumeration (Phase 10 pre-ship checklist, Convex-Realtime C10 / Theme K):**

| Var | Scope | Source | Phase |
|---|---|---|---|
| `OPENAI_API_KEY` | Convex env | existing | — |
| `OPENAI_AHA_MODEL` (optional) | Convex env | new | 7 |
| `OPENAI_AHA_FALLBACK_MODEL` (optional) | Convex env | new | 7 |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | Convex env | existing | 2 |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` | Convex env | new (7d rotation) | 2 |
| `REVENUECAT_REST_API_KEY` | Convex env | new | 2 |
| `POSTHOG_API_KEY` (server) | Convex env | new | 3 |
| `EMAIL_SERVICE_API_KEY` (Resend) | Convex env | new | 2 |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Expo env | new | 3 |
| `EXPO_PUBLIC_CONVEX_URL` | Expo env | existing | — |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Expo env | existing | — |

`ENTITLEMENT_ID = "fitbull_pro"` is a code constant (plan-00), not an env var.

**Per-screen render-time budgets (Performance #9):**

| Screen | Mount budget | Notes |
|---|---|---|
| S2 goal / S3 experience / S4 days | ≤ 150ms | WebP decoding happens async; paint immediately |
| S5 primer | ≤ 400ms | Includes 3 HealthKit-auth-status checks |
| S8 aha first pixel | ≤ 500ms post `plan_first_byte` | Skeleton → card transition |
| Cold-start → sign-up interactive | ≤ 2.2s | iPhone 12, A14 |
| Animations (S7 narrated, aha carousel) | ≥ 55fps avg, no frame > 50ms | Instruments capture |

**Latency budgets (Theme H / Performance #1):**

| Network | p50 plan_first_byte | p95 plan_first_byte | p99 plan_first_byte |
|---|---|---|---|
| Oslo LTE / iPhone 12 | ≤ 3.5s | — | — |
| Slow 3G (Network Link Conditioner) | — | ≤ 8s | — |
| Worst-case with retry | — | — | ≤ 14s hard-kill |

**Privacy Nutrition Label (`docs/privacy-nutrition-label.md`):**
- Health & Fitness — Linked to You — App Functionality (body stats, Art. 9 data).
- Identifiers — Linked to You — Analytics (PostHog `distinct_id` + userId; no IDFV).
- User Content — Linked to You — App Functionality (chat, workouts, aha).
- Contact Info — Email — Linked to You — App Functionality (email sign-up path; SIWA relay emails per Apple dev team).
- NOT Tracking. NOT Advertising.

**Apple review notes (`docs/apple-review-notes.md`):**
- 3.1.2 (subscription disclosure): reference `app/onboarding/paywall.tsx` interstitial — copy visible above fold with trial length, price, period, cancel path.
- 5.1.3 (health data): HealthKit usage strings in `app.json`; data stays on device + Convex EU; sub-processors named on methodology.
- 4.2 (minimum functionality): core value — personalised plan + coach + workout logging — available without purchase via the aha + Mural.
- 5.1.1(v) (account deletion): reachable from Settings → Delete account → full cascade including PostHog + HealthKit externalUUID cleanup.

## Implementation

1. **G2 pricing matrix.**
   - **What:** Sebastian pulls 2026 NOK/SEK/DKK/EUR tier matrix from App Store Connect. Update RC offerings to match. Verify the Storefront-locale paywall renders correct `priceString` on Norwegian / Swedish / Danish / Euro simulator (simulator locale change via `xcrun simctl`).
   - **Approach:** this is a manual ASC + RC dashboard task; no code change if RC offerings already exist. Document final tier numbers in `docs/perf/preship-measurements.md`.
   - **Test:** open paywall on NOK/SEK/DKK/EUR storefronts; screenshot.

2. **G8 citation DOIs.**
   - **What:** human-click-through each citation on `app/methodology.tsx`:
     - Schoenfeld progressive overload (2010 or later).
     - Borg RPE 1970.
     - DeLorme 1948.
     - Mifflin-St Jeor BMR-only (1990).
   - **Approach:** open each DOI; if 404 or redirect broken, replace with the current canonical URL.
   - **Test:** record status per citation in `docs/perf/preship-measurements.md`.

3. **Cold-start measurement.**
   - **What:** on iPhone 12 (simulator approximation via "iPhone 12 + low power mode" if real device unavailable): three cold-boot runs, record first-meaningful-paint. Delta vs plan-03 baseline must be ≤ +400ms.
   - **Approach:** `console.time`-based measurement already added in plan-03; if not, use Xcode Instruments Time Profiler.
   - **Test:** record in `docs/perf/preship-measurements.md`.

4. **Bundle delta.**
   - **What:** `npx expo export --platform ios --dump-sourcemap`; measure gzip size; compare to plan-03 baseline. Delta ≤ 350KB.
   - **Test:** record.

5. **Latency measurement p50/p95/p99.**
   - **What:** exercise S6 → S7 → S8 on:
     - Oslo LTE equivalent (WiFi → ~15Mbps throttle, 80ms RTT): p50 measurement (n ≥ 10 runs).
     - Slow 3G via Network Link Conditioner: p95 (n ≥ 5 runs).
     - Force 14s stall in the action (dev seam): verify p99 hard-kill → safety-net.
   - **Test:** record percentiles.

6. **≤3 concurrent `useQuery` audit.**
   - **What:** for every route under `app/onboarding/*` + `app/(tabs)/*` + `app/settings/*`, count active `useQuery` hooks via React DevTools.
   - **Approach:** walk each screen; note the count. Budget: ≤ 3.
   - **Test:** record per screen.

7. **React Compiler healthcheck gate.**
   - **What:** `npx react-compiler-healthcheck app/onboarding/**` + `components/onboarding/**` + `components/paywall/**` + `components/home/**`. Any bail is a blocker.
   - **CI:** add `.github/workflows/react-compiler-healthcheck.yml` that runs on PR against these directories.
   - **Test:** CI green.

8. **Privacy Nutrition Label.**
   - **What:** declare per Data contract in ASC. Create `docs/privacy-nutrition-label.md` mirroring the declarations.
   - **Test:** ASC screenshot appended to the doc.

9. **Apple review notes draft.**
   - **What:** `docs/apple-review-notes.md` with draft 3.1.2 / 5.1.3 / 4.2 / 5.1.1(v) responses.
   - **Test:** review.

10. **Env var enumeration verification.**
    - **What:** list all env vars per table; verify each is present in production Convex dashboard. Verify dual tokens are staggered (plan-02's rotation runbook).
    - **Test:** screenshot of Convex env dashboard (redacted values) attached to PR.

11. **Maestro flows (9 + canary).**
    - **What:** author flows listed in File paths. Each flow:
      - Uses stable `testID` attributes seeded by prior phases.
      - Asserts analytics event emission via PostHog's REST query API (flow ends with a check).
    - **Preflight per `.claude/skills/maestro-e2e/SKILL.md`:** Maestro CLI + IDB installed; simulator booted with dev client.
    - **Blocking gate:** `07-voiceover-happy.yaml` must pass with VoiceOver enabled. Eyes-closed walk through sign-up → aha → paywall. Any trapped state fails the gate.
    - **Test:** `maestro test .maestro/onboarding/` green.

12. **Canary Walker CI.**
    - **What:** `.github/workflows/canary-walker.yml` runs `99-canary.yaml` on a weekly schedule. On divergence (expected events missing or latencies outside budget), opens a GitHub issue automatically.
    - **Test:** trigger once manually; confirm green; confirm issue-on-divergence path.

13. **Session-replay human review.**
    - **What:** after TestFlight ship, watch the first 50 real users' sessions in PostHog (non-denylist screens only — S5/S5a/S5b/S7/S8/S11/auth are OFF per plan-03).
    - **Approach:** for each session, verify no body stats leak, no crashes, no trapped states.
    - **Test:** spreadsheet of observations; file follow-up issues for anything surprising.

14. **Assemble `docs/perf/preship-measurements.md`.**
    - **What:** single doc with all numbers: G2 matrix, G8 citations (pass/fail per DOI), cold-start before/after, bundle delta, latency p50/p95/p99, useQuery count per screen, compiler healthcheck status, Maestro run log, env-var dashboard screenshot, Privacy Label screenshot.
    - **Test:** doc is readable and all rows are populated.

### Test discipline
- Every step produces an artifact (measurement number, screenshot, CI log, or doc section).
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev` + `maestro test .maestro/onboarding/` — all green.

## Acceptance Criteria

- [ ] G2: 2026 NOK/SEK/DKK/EUR tier matrix confirmed + RC offerings match; screenshots in `docs/perf/preship-measurements.md`.
- [ ] G8: every methodology-page citation resolves; broken DOIs replaced; per-citation status in the doc.
- [ ] Cold-start delta ≤ +400ms recorded.
- [ ] Bundle delta ≤ 350KB recorded.
- [ ] Latency p50 ≤ 3.5s, p95 ≤ 8s, p99 ≤ 14s recorded.
- [ ] `useQuery` concurrency ≤ 3 verified for every screen under `app/onboarding`, `app/(tabs)`, `app/settings`.
- [ ] React Compiler healthcheck green for `app/onboarding/**`, `components/onboarding/**`, `components/paywall/**`, `components/home/**`; CI gate in place.
- [ ] Privacy Nutrition Label declared + documented.
- [ ] Apple review notes drafted for 3.1.2, 5.1.3, 4.2, 5.1.1(v).
- [ ] All env vars from the enumeration table present in production Convex dashboard; screenshot attached.
- [ ] Maestro flows 01–09 + 99-canary exist in `.maestro/onboarding/` and pass on CI (iOS simulator).
- [ ] VoiceOver Maestro `07-voiceover-happy.yaml` passes as the blocking ship gate.
- [ ] Canary Walker CI workflow scheduled weekly; green on first trigger; issue-on-divergence wired.
- [ ] Session-replay watch plan in place (first 50 real users).
- [ ] Contrast audit complete for every new surface in light + dark (results noted in the preship-measurements doc).
- [ ] `docs/perf/preship-measurements.md` complete with every row populated.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Out-of-scope: new product features; V1.1 items (custom native paywall, full Nordic translation, Art. 20 export, Android, web, iPad layout).

## Risks

- **Risk:** G2 tier matrix hasn't shipped yet from Apple and prices are stale.
  - **Detect:** ASC check.
  - **Mitigate:** Sebastian owns the ASC verification. If Apple hasn't updated the 2026 matrix by ship date, fall back to the most recent published matrix and note in `docs/perf/preship-measurements.md`.
  - **Escalate:** if a price surprises a user on storefront, fix via RC dashboard (no app update needed).

- **Risk:** a citation DOI resolves to a retracted paper.
  - **Detect:** human click.
  - **Mitigate:** replace with the current canonical citation; update `app/methodology.tsx`.
  - **Escalate:** if no replacement exists, remove the claim from the methodology page.

- **Risk:** VoiceOver flow fails on a race condition that's not reproducible without VO on.
  - **Detect:** `07-voiceover-happy.yaml` fails intermittently.
  - **Mitigate:** strengthen focus-management calls (`setAccessibilityFocus`) with a 100ms delay after mount; retry Maestro with `waitForAnimationToEnd`.
  - **Escalate:** if the fail is a trapped state (not a timing issue), blocks ship.

- **Risk:** cold-start delta blows budget because plan-03 measurement was on a faster machine.
  - **Detect:** iPhone 12 real-device run.
  - **Mitigate:** further defer non-essential provider mounts (e.g. delay RevenueCat `configure()` by an additional tick). Session replay init can also be deferred.
  - **Escalate:** if still over, land a V1.0.1 optimisation PR before widening rollout.

- **Risk:** Canary Walker issues spam when PostHog has normal ingest variance.
  - **Detect:** first run of the canary.
  - **Mitigate:** tolerance band around the 24h window (±10%); alert on sustained divergence not single-run noise.
  - **Escalate:** tune thresholds.

- **Risk:** session-replay watch reveals a body-stat leak on a screen that should be denylisted.
  - **Detect:** human review.
  - **Mitigate:** immediate hotfix: add route to `REPLAY_ALLOWLIST` denylist; call PostHog delete API on the offending session; document as a privacy incident.
  - **Escalate:** plan-03 owner + Sebastian.

- **Risk:** Apple rejects on 5.1.1(v) despite the delete-account path, because the first-layer entry is subtle.
  - **Detect:** review feedback.
  - **Mitigate:** move "Delete account" entry to top of Settings list (before Privacy even) if ambiguous. Add a Apple review note explicitly pointing at the path.
  - **Escalate:** hotfix.

- **Risk:** React Compiler healthcheck CI gate blocks on a legitimate Reanimated worklet pattern.
  - **Detect:** CI fail on unrelated PR.
  - **Mitigate:** if the pattern is truly compiler-safe but healthcheck confused, add a narrow `@react-compiler-ignore` comment WITH justification in the PR description. Do not blanket-disable the gate.
  - **Escalate:** plan-07 owner.

- **Risk:** 2 TestFlight users' migrated rows (plan-02) drift because the one-shot migration predated a webhook event landing.
  - **Detect:** plan-02's `migrateSubscriptionsV2` logged old state; compare to current.
  - **Mitigate:** webhook is the authoritative source going forward. Rerun migration if rows look stale.
  - **Escalate:** plan-02 owner.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. `npx react-compiler-healthcheck app/onboarding/** components/onboarding/** components/paywall/** components/home/**` — green.
5. `maestro test .maestro/onboarding/` — all 9 flows + canary green.
6. `.maestro/onboarding/07-voiceover-happy.yaml` — green (blocking ship gate).
7. Measurements in `docs/perf/preship-measurements.md`:
   - Cold-start delta ≤ +400ms.
   - Bundle delta ≤ 350KB gzipped.
   - p50 ≤ 3.5s, p95 ≤ 8s, p99 ≤ 14s.
   - `useQuery` count ≤ 3 per screen.
   - Per-screen render budgets met.
8. `docs/apple-review-notes.md` + `docs/privacy-nutrition-label.md` complete.
9. Convex env dashboard screenshot (redacted) in preship doc confirming env-var enumeration.
10. Canary Walker CI workflow committed and first run green.
11. Session-replay watch plan documented (first 50 users).
12. Report diffs + measurement numbers.

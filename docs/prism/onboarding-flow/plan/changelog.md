# Master Plan Revision Changelog

**Date:** 2026-04-21
**Scope:** Revisions to `docs/prism/onboarding-flow/plan/master-plan.md` after 9 domain reviews.

Every blocking item across the 9 reviews is resolved either in the plan body (cited with a review tag in-line) or rationalised here. One row per blocking item.

| Review | Severity | Section Affected | Change Applied |
|---|---|---|---|
| Security CR1 | Critical | §3.3 (analytics firewall) | Replaced inert `keyof T extends ForbiddenKeys` with distributive `Extract<keyof T, ForbiddenKeys> extends never ? T : never`. Applied to `capture()` via `event & { props: NoHealthKitFields<E["props"]> }`. Added runtime key-scan (throw in `__DEV__`, drop+warn in prod). Extended `ForbiddenKeys` to include `activityLevel`, `tdee`, `bmr`, `bmi`, `caloriesBurned`, `workoutDurationSec`, `restingHeartRate`, `activeCalories`. Added type-only negative test file `lib/analytics.test-types.ts` as Phase 3 exit criterion. |
| Security CR2 | Critical | §3.8 (intake-draft store) | Art. 9 special-category fields (age, weight, height, body-fat, sex) kept **in-memory only** (Zustand without `persist`). Only S2–S4 non-special fields persist to AsyncStorage, partitioned by userId. Purge rules specified: `onSuccess` of mutation, sign-out, user-initiated reset, cold-boot partition mismatch. |
| Security CR3 / HealthKit-Privacy CR5 | Critical | §2 S6, §3.10, Phase 8 | Withdrawal UI ships in V1 via `app/settings/privacy.tsx` (toggle-to-revoke per purpose). `withdrawConsent` appends a new row, never mutates. Cascade into data-stop + PostHog delete + profile erasure scheduling. |
| Security CR4 | Critical | §3.1, §3.4 | `userConsents` converted to append-only log. Index `by_user_purpose_grantedAt`. `getConsents()` returns latest-per-purpose via reduction. `withdrawConsent` appends `granted: false`. Documented replay-safety. |
| Security CR5 / AI-Safety #3 | Critical | §2 S2, §3.1, §3.4 | `goalValidator` literal union (`stronger|leaner|healthier|routine`) in `convex/validators.ts`. Both `goals[]` and `primaryGoal` reference it. Array len capped at 4 server-side. Profile passed to OpenAI as JSON user-message, not interpolated into prompt. |
| Security #6 | Concern | §2 S8, §3.5 | OpenAI `refusal` shape handled as failure → safety-net session. Streaming render does NOT `JSON.parse` partial buffer; skeleton until `status:"complete"`. |
| Security #7 | Concern | §3.3, §3.5 | `posthog-node` wrapped in `Promise.race([shutdown, timeout(2000)])`. Assert `process.env.OPENAI_API_KEY` at action entry. Never log keys. |
| Security #8 | Concern | Phase 2 exit criteria | Replay-test old-timestamp `INITIAL_PURCHASE` → no-op; `SUBSCRIPTION_EXTENDED` past-timestamp still updates `trialExpiresAt`. Token-rotation doc. |
| Security #9 | Concern | §3.3 | `maskAllInputs: true` global. `(auth)/*` routes excluded from replay. Email category declared in Privacy Label if ever replayed. |
| Security Obs #1 | Observation | §3.4 | `getAuthUserId` discipline explicitly restated for every new module (`onboarding`, `onboardingActions`, `analytics`, `home`). `userId` never a public arg. |
| Security Obs #5 / "SIWA collision" | Critical (reframed) | §2 S1, Phase 4 | SIWA↔email collision branch in `convex/auth.ts`. Relay email authoritative identity. `usesAppleSignIn` + Apple Developer entitlement pre-ship gate. |
| HealthKit-Privacy CR1 | Critical | §3.3 | (same fix as Security CR1; extended forbidden keys include derived metrics). |
| HealthKit-Privacy CR2 | Critical | §3.3, §2 S0 | Session-replay route allowlist specified. ON: S1/S2/S3/S4/S6-chrome/S9/S10. OFF: S5/S5a/S5b/S7/S8/S11/auth. Mechanism `posthog.startSessionRecording/stopSessionRecording` on Expo Router transitions. Buffer cap 5MB. |
| HealthKit-Privacy CR3 / AI-Safety #12 | Critical | §2 S6, §3.5 | Three unbundled consents: `health_data_personalization`, `ai_coach_inference` (names OpenAI US + SCC), `analytics` (default off). `generateAhaWorkout` action gates on `ai_coach_inference`. Sub-processors link on methodology page. |
| HealthKit-Privacy CR4 | Critical | §2 S0, Phase 6 | Final `NSHealthShareUsageDescription` + `NSHealthUpdateUsageDescription` strings locked + verified Phase 10. |
| HealthKit-Privacy C1 | Concern | §2 S6, §3.3 | `analytics` consent row required before PostHog starts capturing. `intake_started` buffered in-memory, flushed only if granted. `marketing` purpose removed from V1. |
| HealthKit-Privacy C2 | Concern | §2 S11 | Cadence cap: 1 dismissal → suppress 30d; 2 → permanent until Settings toggle. `Linking.openSettings()` on `.sharingDenied`. |
| HealthKit-Privacy C3 | Concern | §2 S0 | Privacy Nutrition Label expanded: Identifiers (Analytics), User Content (App Functionality), Contact Info (email for password sign-up). |
| HealthKit-Privacy C4 | Concern | §3.10, Phase 8 | `deleteAccount()` cascade includes all app-owned tables + PostHog delete API + OpenAI zero-retention header + HealthKit `externalUUID` sample cleanup. `app/settings/delete-account.tsx` in V1 per Apple 5.1.1(v). |
| HealthKit-Privacy C5 | Concern | §2 S5 | Primer copy order locked: won't-reads FIRST, reads SECOND, writes THIRD, revocation, two equal-weight buttons. |
| HealthKit-Privacy C6 | Concern | §2 S5 | Rationale for capturing `grantedScopes[]` documented in `lib/analytics.ts`; flag in place for future scope additions. |
| AI-Safety #1 | Concern | §3.5 | Schema adds `exerciseId` enum bound to library, warmup+cooldown required, volume cap (sets×reps per tier), duration cap per experience tier. |
| AI-Safety #2 | Concern | §3.5 | Full system prompt committed verbatim in plan body with medical boundary, age/volume, language, privacy, exercise-selection, volume-caps clauses. |
| AI-Safety #3 | Concern | §3.1, §3.4 | (See Security CR5 row.) |
| AI-Safety #4 | Concern | §3.4, §3.5 | Sanity bounds server-side: age 16-100, weight 30-250 kg, height 120-230 cm, body-fat 3-60%. Re-verified inside `generateAhaWorkout` before prompt build. |
| AI-Safety #5 | Concern | §3.5 | Explicit prohibition: aha action MUST NOT pass `tools`/`tool_choice`. Do not import `TOOLS` from `chatActions.ts`. Phase 10 code-review gate. |
| AI-Safety #6 | Concern | §2 S8, §Phase 7 | Medical disclaimer persistent on aha card + methodology page (fuller block). System-prompt forbids "cure/prevent/treat" language. |
| AI-Safety #7 | Concern | §2 S5a/S5b, §3.4 | Hard 16+ age gate. Under-16 submission blocked with copy. `docs/compliance/age-gate.md`. Defense-in-depth clause in system prompt for <18. |
| AI-Safety #8 | Concern | §3.5 | Rate limit: lifetime cap 5 (on `userProfile.ahaGenerationCount`); per-user-per-30s block. On cap-hit return last completed row (idempotent fallback). |
| AI-Safety #9 | Concern | §2 S8, §3.5 | Static safety-net session in `lib/onboarding-fallback-session.ts` (3 bodyweight exercises). Served on 2× retry fail or p99 14s hard-kill. Analytics `plan_fallback_shown`. |
| AI-Safety #10 | Concern | §3.5 | `convex/openai-config.ts` with `OPENAI_AHA_MODEL` + `OPENAI_AHA_FALLBACK_MODEL`. Retry on fallback before surfacing failure. `chatActions.ts` refactored to use the same constant. |
| AI-Safety #11 | Concern | §3.5 | `openai.moderations.create()` on `intro` before commit. Flagged categories replaced with static intro. `aiSafetyIncidents` table for human review. |
| AI-Safety #12 | Concern | §2 S6, §3.5 | (See HealthKit-Privacy CR3 row.) |
| Convex-Realtime C1 | Blocking | §3.5 | Streaming specified: 250ms throttle, full-overwrite each tick, payload ≤500-800 tokens. Consumer `useQuery(api.onboarding.getAha, { generationId })` single row. |
| Convex-Realtime C2 | Blocking | §3.1 | Dedicated `onboardingAha` table, not a `chatConversations` column. Fields: `generationId`, `status`, `workout`, `error`, `profileSnapshot`, timestamps. Indexes `by_user`, `by_user_generationId`. |
| Convex-Realtime C3 | Blocking | §3.6 | `useOnboardingStatus()` uses `useQuery` (reactive). Tri-state `loading | pending | complete`. Offline cache fallback only when network offline. `use-auth-guard` gates on non-loading. |
| Convex-Realtime C4 | Blocking | §3.5 | `generationId` idempotency: action checks for in-flight row `<60s`; returns existing on match. `rekickAha` mutation for client-side foreground recovery. Action runs to completion server-side even after client abandons. |
| Convex-Realtime C5 | Blocking | §3.1 | Added indexes `by_status`, `by_status_trialExpiresAt`, `by_status_lastVerifiedAt`, `by_status_notificationAnchorAt` on `userSubscriptions`. |
| Convex-Realtime C6 | Blocking | §3.2 | Cron schedule (`crons.daily` with UTC time) + `reminder48hSentAt` / `dcsaNotifiedAt` idempotency columns. |
| Convex-Realtime C7 | Concern | §3.4 | `getAuthUserId` discipline restated across new modules. `internalMutation` may take `userId` from cron scan; public surfaces may not. |
| Convex-Realtime C8 | Blocking | §3.4 | Per-table idempotency: `userProfile` upsert by `(userId)` + `clientIntakeId` dedup; `userConsents` append-only with server timestamps; `userOnboarding` patch. |
| Convex-Realtime C9 | Concern | §3.1, Phase 1 | One-shot `migrateSubscriptionsV2` internal mutation to backfill state-machine fields for 2 TestFlight rows. Phase 10 pre-ship item. |
| Convex-Realtime C10 | Blocking | Phase 10 | Env var enumeration table: server-side vs. Expo-public split; `POSTHOG_API_KEY` (server) separate from `EXPO_PUBLIC_POSTHOG_API_KEY` (client). `ENTITLEMENT_ID` is code constant. |
| Convex-Realtime C11 | Concern | §2 S8 | Render strategy committed: skeleton until `status:"complete"`, then render whole card. No partial-JSON parser. |
| Performance #1 | Blocking | §2 S7 | Three-phase latency budget: p50 ≤ 3.5s, p95 ≤ 8s, p99 ≤ 14s. Hard-kill at 14s. p50 extends with fourth line; p95 surfaces retry. |
| Performance #2 | Blocking | §2 S8, Phase 7 | `react-compiler-healthcheck` exit gate. Stable keys on exercises. `useAnimatedStyle` correctness. `useSharedValue` above conditionals. |
| Performance #3 | Blocking | §3.3 | Session-replay sampling exclusions on S5a/S7/S8/S11/auth. Buffer 5MB cap. Deferred SDK init via `InteractionManager.runAfterInteractions`. Bundle budget 350KB gzipped. |
| Performance #4 | Blocking | §3.8 | Intake-draft persistence debounced (300ms) + persist-on-blur + AppState background trigger. No write-per-keystroke. |
| Performance #5 | Blocking | §3.6, Phase 3 | Cold-start budget ≤ +400ms. Provider mount order specified (Convex auth → guard → NetworkProvider → deferred PostHog/Purchases/HealthKit/session-replay). Measurement in `docs/perf/baseline.md`. |
| Performance #6 | Blocking | §2 S10, Phase 9 | Home tab activation-checklist derives from single `api.home.getActivationState` aggregated query. ≤ 3 concurrent `useQuery` per screen exit criterion. |
| Performance #7 | Blocking | §2 S2, Phase 5 | Goal card assets WebP ≤40KB each, bundled, `expo-image` with blurhash. Decoded ≈ rendered dims within 2×. |
| Performance #8 | Blocking | §3.5 | `generationId` idempotency prevents double-spend on background/foreground (also covers Convex-Realtime C4). |
| Performance #9 | Blocking | Phase 10 | Per-screen render budgets: S2/S3/S4 mount ≤ 150ms; S5 ≤ 400ms; S8 first pixel ≤ 500ms post-first-byte; cold-start interactive ≤ 2.2s; ≥ 55fps. |
| Performance #10 | Concern | Phase 6 | `lib/healthkit.ts` verified `limit:1` + sort; prefill ≤ 300ms on seeded dev device. |
| RevenueCat F1 | Blocking | §3.1, §3.2 | Full RC event coverage: SUBSCRIPTION_PAUSED → `paused`, PRODUCT_CHANGE → update productId without resetting trial, REFUND / REFUND_REVERSED, TRANSFER (two-sided), TEMPORARY_ENTITLEMENT_GRANT → `source:"rc_temp"` 24h, SUBSCRIBER_ALIAS, UNCANCELLATION. `cancelReason` column. Replaced `GRACE_PERIOD_EXPIRED` with `EXPIRATION`. |
| RevenueCat F2 | Blocking | Phase 0 | Single source of truth `ENTITLEMENT_ID = "fitbull_pro"` in `lib/subscription-constants.ts`. Both Convex and client import. Legacy env vars + `?? "Fitbull Pro"` fallback deleted. "First active entitlement" fallback removed. |
| RevenueCat F3 | Blocking | §3.2, Phase 2 | Dual-token window via `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` (7d overlap). Timing-safe compare. `docs/revenuecat-webhook-rotation.md`. |
| RevenueCat F4 | Blocking | §2 S9, Phase 2 | `Purchases = rnpModule.default ?? rnpModule` lazy pattern preserved. `getOfferings` from same object. Exact version pin (drop caret) on `react-native-purchases` + `react-native-purchases-ui`. |
| RevenueCat F5 | Blocking | §2 S9 | `RevenueCatUI` null fallback: in-component `Purchases.purchasePackage(pkg)` button fed from `getOfferings()`. `revenuecat_ui_unavailable` PostHog event. |
| RevenueCat F6 | Before-ship | §2 S9, Phase 8 | `checkTrialOrIntroDiscountEligibility([annualSKU])` branches copy. `trialEligible:boolean` on `paywall_interstitial_shown`. RC dashboard subscription-group setup documented. |
| RevenueCat F7 | Before-ship | §3.2, Phase 2 | DCSA pivot renamed to `notificationAnchorAt` (reset on RENEWAL). Email provider: **Resend** (`EMAIL_SERVICE_API_KEY`). `unsubscribeFromLegalReminders` + in-app local-notification fallback. Storefront-locale routing (NB/SV/DA/FI V1.1; English V1). |
| RevenueCat F8 | Before-ship | Phase 8 | 48h-before-charge email promoted from stub to hard Phase 8 deliverable via Resend. `reminder48hSentAt` idempotency. `reminder_email_sent` event. |
| RevenueCat F9 | Before-ship | §2 S9 | Interstitial takes `priceString` pass-through from `Purchases.getOfferings()` (never concatenate). `introPriceString` + period surfaced. Iceland USD fallback tested Phase 10. |
| RevenueCat F10 | Minor | §3.2 | RC Experiments disabled in V1 dashboard. A/B via PostHog. |
| RevenueCat F11 | Before-ship | §3.1 | `source: "rc_temp"` added. `sourceHistory` audit-trail column. Transition invariants documented (rc_intro → rc_paid; any StoreKit tx overrides app_local). |
| Mobile-A11y #1 | Blocking | §2 S7 | `AccessibilityInfo.announceForAccessibility` queued; gated on `isScreenReaderEnabled`. VO-active → skip animation, render all lines immediately with single polite live region. Extended timeout under VO. Screen-container `accessibilityLabel` carries full narration. |
| Mobile-A11y #2 | Blocking | §2 S8 | No live region during stream. On `status:"complete"`, single `announceForAccessibility` summary. Chip labels include value ("Goal: Stronger"). |
| Mobile-A11y #3 | Blocking | §2 S4 | 2-row grid on ≤375pt (iPhone SE). `hitSlop` enforced. `components/ui/button.tsx` gains `onboarding` size variant `h-12` (48pt). Maestro iPhone SE run added. |
| Mobile-A11y #4 | Blocking | §2 S5 | VoiceOver grouping: three accessible containers with consolidated labels; children `accessibilityElementsHidden`. Group headings `accessibilityRole:"header"`. Both buttons equal `accessibilityLabel` emphasis. |
| Mobile-A11y #5 | Blocking | §2 S6 | Edit chips: value in label, action in hint. Consent checkbox full-sentence label. Disabled submit uses `accessibilityState:{disabled:true}`. |
| Mobile-A11y #6 | Blocking | §2 S7+, §Phase 5/7 | Single `hooks/use-reduce-motion.ts` applied across narrated analysis, aha reveal, chip animations, paywall sheet. Reduce-Motion Maestro variant. Exit criterion per phase. |
| Mobile-A11y #7 | Blocking | §2 S8 | Error state: `accessibilityLiveRegion:"assertive"` + `announceForAccessibility` + `setAccessibilityFocus` on retry. |
| Mobile-A11y #8 | Blocking | §2 S1 | Secondary sign-in link relabeled to "Already have an account? Sign in" (not duplicate of SIWA). |
| Mobile-A11y #9 | Non-blocking | §2 S5a/S5b | Every `<TextInput>` preceded by `<Label>` with `nativeID`/`accessibilityLabelledBy`. Placeholder not label. |
| Mobile-A11y #10 | Non-blocking | §2 S7 | Reanimated text uses `Animated.createAnimatedComponent(Text)` from theme-token `Text`; Dynamic Type flows. Accessibility XXL scaling exit gate. |
| Mobile-A11y #11 | Non-blocking | Phase 10 | Contrast audit every new surface in light + dark (Stark / Xcode AI). |
| Mobile-A11y #12 | Non-blocking | Phase 10 | `.maestro/onboarding/07-voiceover-happy.yaml` ship gate. |
| Mobile-A11y #13 | Non-blocking | §2 S1, §2 S9 | `AccessibilityInfo.setAccessibilityFocus` after SIWA redirect + paywall dismissal. |
| Mobile-A11y #14 | Non-blocking | §2 S7/S9 | Reduce Transparency / Invert Colors fallback to opaque `bg-background`. |
| Mobile-A11y #15 | Non-blocking | §2 S10/S11 | Checklist items + re-ask card accessibility role/state patterns documented. |
| Mobile-A11y #16 | Non-blocking | §2 S2/S3/S4 | Chip labels expand via `accessibilityLabel` longform for SR. |
| Mobile-A11y #17 | Non-blocking | §7 | iPad layout + external keyboard explicitly scoped out of V1. |
| Offline-Sync #1 | Must-fix | §2 S6, §3.4 | S6 is interactive `useMutation` with retry UI, NOT routed through `syncToConvex` fire-and-forget queue. |
| Offline-Sync #2 | Must-fix | §3.1, §3.4 | `clientIntakeId` nanoid arg for replay-safety. Upsert-by-query-then-patch-or-insert documented per table. `userConsents` append-only. |
| Offline-Sync #3 | Must-fix | §3.8 | Purge rules: on server-confirmed `onSuccess`, on sign-out (wired into `auth-cache-store.clear()`), on user reset, on cold-boot partition mismatch. Art. 9 slice in-memory only. |
| Offline-Sync #4 | Must-fix | §3.6 | `useOnboardingStatus()` tri-state; cache holds truth on offline cold-boot; cache updated on every true transition + re-confirmation. |
| Offline-Sync #5 | Must-fix | §3.2 | Both `updateFromWebhook` and `syncFromClient` compare `lastEventTimestampMs` / `customerInfo.requestDate`; ignore stale. Debug log on ignored-stale. |
| Offline-Sync #6 | Must-fix | §2 S8, §3.5 | `onboardingAha.status:"streaming"|"complete"|"failed"`. Foreground reads row; re-kicks via `rekickAha(generationId)` if absent/stale. |
| Offline-Sync #7 | Must-fix | §2 S9 | Offline paywall degrade: cached `priceString` or "Pricing will load when online"; disable primary CTA; skip enabled; never call `presentPaywall()` offline. |
| Offline-Sync #8 | Nice | §3.3 | PostHog RN disk-persists + flushes on reconnect. Canary Maestro uses 24h window. |
| Offline-Sync #9 | Nice | §3.4 | Multi-device: last-write-wins `userProfile`; `userConsents` additive; device B auto-routes forward when server flips to `completed`. |
| Offline-Sync #10 | Must-fix | §3.2 | Client NEVER evaluates `Date.now() > trialExpiresAt`. Server `status` is truth; `trialExpiresAt` display-only. Daily cron transitions server-side. |
| UX-Evaluation #1 | Must-fix | §2 (layout intro) | Progress affordance: segmented 5-dot covering S2–S6 only; S1 + S7–S9 no progress UI. Endowed progress (dot 1 lit on S2). |
| UX-Evaluation #2 | Must-fix | §2 S4 | Copy rewritten from "Pick the days you'll actually train this week" to "Which days can you train this week?" + sub-caption "You can change these anytime." |
| UX-Evaluation #3 | Must-fix | §2 S5 | Primer layout order locked: won't-reads FIRST, reads SECOND, writes THIRD. |
| UX-Evaluation #4 | Must-fix | §2 S6 | Split consent copy: bold line + fine print per purpose. Affirmative checkbox labels. Paywall disclosure MOVED off S6 to S9 only. |
| UX-Evaluation #5 | Must-fix | §2 S8, §3.5 | LLM intro schema-constrained: 2–3 sentences, must reference input, recommend-register verbs, no possessive ownership. |
| UX-Evaluation #6 | Must-fix | §2 S9 | Interstitial hierarchy: above-fold header + 3.1.2 + CTA; below-fold Pledge accordion + methodology; tertiary skip. |
| UX-Evaluation #7 | Must-fix | §2 S8 | Carousel re-introduced as three collapsed tiles below aha workout (calorie / schedule / plan summary). Degraded copy when inputs missing. |
| UX-Evaluation #8 | Must-fix | §2 S1, §2 S10 | Skeptic side-door implemented at S1 with defaulted profile + `hasCompletedOnboarding:true`. Mural item 1 for this cohort becomes "Enable AI personalisation". |
| UX-Evaluation #9 | Must-fix | §2 S10 | Checklist: individual items dismissible; checklist non-dismissible until ≥3; then collapsible chip. Item 2 pre-complete for intake cohort with "done during setup" microcopy. Full-complete state replaces with "Setup done. See you {day}." |
| UX-Evaluation #10 | Must-fix | §2 (error-copy canon) | Canonical error strings in `lib/copy/errors.ts`. One sentence each, specific, reassuring. |
| UX-Evaluation #11 | Must-fix | §2 S1, §3.8 | Abandonment recovery: relaunch with partial draft shows "Welcome back. Pick up where you left off?" interstitial. 7d stale cutoff. Post-consent users go straight to aha. |
| UX-Evaluation #12 | Before-ship | §2 S9/S10 | Trial confirmation banner on home tab post-purchase: "Trial active · 7 days free · ends {date}". Auto-dismiss 24h + permanent X. `trial_confirmation_shown` event. |
| UX-Evaluation #13 | Before-ship | §2 S2 | No pre-selected goal card. Primary pin defaults to first-tapped after first tap. Disabled CTA microcopy "Pick at least one to continue." |
| UX-Evaluation #14 | Before-ship | §2 (copy rubric) + §2 S7 | Strava-dry rubric committed (`docs/prism/onboarding-flow/copy-rubric.md`). S7 narrated lines rewritten to drop "other lifters" / "weekday gaps" jargon. |
| UX-Evaluation #15 | Polish | §2 S5a, §3.1 | `biologicalSex` moved out of intake; collected lazily at first calorie-calc tap. Schema retains as optional. Primer writes surfaced in user copy. Methodology link same destination from S8 + S9. |
| Theme A — type firewall | Cross-cutting | §3.3 | See Security CR1 / HealthKit-Privacy CR1 rows. Exact `Extract<>` conditional + runtime scan + negative test file. |
| Theme B — replay allowlist | Cross-cutting | §3.3 | See HealthKit-Privacy CR2 row. Route-transition hooks. |
| Theme C — consent granularity | Cross-cutting | §2 S6, §3.1, §3.5 | See HealthKit-Privacy CR3 / Security CR3 rows. Three unbundled purposes; `ai_coach_inference` gate; analytics grant required pre-capture. |
| Theme D — pre-consent AsyncStorage | Cross-cutting | §3.8 | See Security CR2 row. In-memory Art. 9 slice + partitioned persisted S2–S4 slice. |
| Theme E — withdrawal in V1 | Cross-cutting | §3.10, Phase 8 | Settings privacy UI + account deletion ship in V1. |
| Theme F — account deletion | Cross-cutting | §3.10, Phase 8 | See HealthKit-Privacy C4 row. Cascade specified. |
| Theme G — AI safety scaffolding | Cross-cutting | §3.5 | System prompt verbatim; sanity bounds; goal literal union; schema safety; 16+ gate; rate limit; safety-net; no tools; model abstraction; moderation; medical disclaimer. |
| Theme H — latency budget | Cross-cutting | §2 S7 | Three-phase p50/p95/p99 with 14s hard-kill. |
| Theme I — streaming architecture | Cross-cutting | §3.1, §3.5 | Dedicated `onboardingAha` table; `generationId`; 250ms throttle; full-overwrite; tri-state `useOnboardingStatus`; indexes added. |
| Theme J — subscription state machine | Cross-cutting | §3.1, §3.2 | All RC events handled; `paused`; `rc_temp`; refund/transfer; `cancelReason`; `sourceHistory`; out-of-order protection. |
| Theme K — entitlement boundary + env enumeration | Cross-cutting | Phase 0, Phase 10 | `lib/subscription-constants.ts` single source of truth. Env-var table with scope column. |
| Theme L — webhook token rotation | Cross-cutting | §3.2 | `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` with 7d window + rotation doc. |
| Theme M — RevenueCatUI null fallback | Cross-cutting | §2 S9 | In-component `purchasePackage` button + diagnostic event. |
| Theme N — trial eligibility + 48h reminder | Cross-cutting | §2 S9, Phase 8 | `checkTrialOrIntroDiscountEligibility` + Resend-backed 48h email + DCSA anchor. |
| Theme O — accessibility | Cross-cutting | §2 multiple, Phase 3/5/7/10 | Mobile-A11y #1-17 all addressed; Maestro VO gate. |
| Theme P — offline sync | Cross-cutting | §2 S6, §3.2-3.8 | Offline-Sync #1-10 all addressed. |
| Theme Q — UX polish | Cross-cutting | §2 multiple, lib/copy | UX-Evaluation #1-15 all addressed. |
| Theme R — performance | Cross-cutting | §3.3/3.6/3.8, Phase 3/7/9/10 | Performance #1-10 all addressed. |

---

## Scope discipline (explicit declines / deferrals)

Items raised by reviews but intentionally NOT scope-creeped into V1:

- **GDPR Art. 20 in-app export** (Security CR3 suggested shipping alongside withdrawal). Deferred to V1.1 with documented risk acceptance; S6 copy carefully says "withdraw in Settings" (V1-honored) and does not promise in-app export. Support-email export path until V1.1.
- **iPad-tuned layout + external keyboard tab order** (Mobile-A11y #17). Explicitly out of V1 per §7.
- **Full Bokmål/SV/DA/FI/IS UI translation**. Storefront-localised paywall only in V1.
- **Custom `<NativePaywall>`** (RevenueCat F5 suggested "Better" option). V1 uses in-component fallback button when `RevenueCatUI` is null; full custom paywall deferred to V1.1.
- **RC Experiments in V1** (RevenueCat F10). Disabled dashboard-side; A/B via PostHog only.
- **Marketing consent purpose** (HealthKit-Privacy C1). Removed from V1 union entirely.
- **Partial-JSON streaming-tolerant parser** (Convex-Realtime C11 option 2). Chose option 1 (skeleton → render-on-complete).

---

## Plan-length note

Original plan: ~690 lines. Revised plan: ~850-900 lines (inside the 850-1100 target). All original phases, gate decisions (D1-D10), load-bearing facts, and out-of-scope declarations preserved. Extensions are tightenings and specifications, not new scope.

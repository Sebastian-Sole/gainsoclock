# Master Plan: Fitbull Onboarding Overhaul (Revised)

**Session:** `onboarding-flow`
**Date:** 2026-04-21 (revised after 9 domain reviews)
**Owner:** Sebastian Sole
**Source inputs:** `docs/prism/onboarding-flow/brief.md`, `orient.md`, `synthesis.md`, `loadout.md`, the 14 explore files + 8 rotations under `docs/prism/onboarding-flow/research/`, and the 9 reviews under `docs/prism/onboarding-flow/reviews/`.

This plan is executable by an implementation agent that has not read the exploration. All load-bearing facts, file paths, decisions, and constraints are restated here. Every review-driven change is annotated inline with its origin (e.g. `[Security CR1]`, `[AI-Safety #7]`).

---

## 1. Executive Summary

We are replacing Fitbull's placeholder onboarding — a post-sign-up feature list behind a paywall followed by an 8-step spotlight tour — with a short, structured, personalised intake flow that produces an "aha" moment before monetisation. Shape: **sign-up (Sign-in-with-Apple primary) + skeptic side-door → 5 decision screens + 1 consent screen → Fitbull-owned HealthKit primer → narrated analysis → AI-voiced aha plan card (+ calorie/schedule tiles) → soft paywall interstitial → StoreKit 7-day free-trial (if eligible) + in-app trial confirmation → post-paywall Mural checklist on home tab**. Flow is iOS-only, Nordic-first on English copy with a storefront-localised paywall, designed around three converged principles: *the fallback is the product, measure the funnel not the screens, design for the denier*.

Key architectural moves (unchanged from gate, tightened per reviews):

- A new Convex `userProfile` + `userConsents` (append-only log) + `onboardingAha` (dedicated streaming row) domain keyed by `userId`, with an atomic interactive `completeOnboardingV2` mutation.
- A first-class subscription state machine (`status: "free"|"trial"|"pro"|"grace"|"paused"|"lapsed"`, plus `source`, `trialExpiresAt`, `willAutoRenew`, `lastVerifiedAt`, `cancelReason`, `sourceHistory`) spanning `convex/schema.ts`, `convex/subscriptions.ts`, `convex/http.ts` (dual-token webhook + RC event coverage), `stores/subscription-store.ts`, `hooks/use-purchases.ts`, paywall consumers.
- A PostHog-based funnel-first analytics layer (EU host, TypeScript literal-union event schema, type+runtime HealthKit firewall, rage-quit hook, session replay route-allowlisted to non-sensitive screens only) wrapped in `lib/analytics.ts`.
- A safety-hardened AI-aha action (`convex/onboardingActions.ts`) using OpenAI Structured Outputs streaming with system-prompt clauses, sanity bounds, 16+ age gate, exercise-enum schema, rate limit, moderation pass, model abstraction with fallback, and a static safety-net session when the LLM fails.

**V1 explicitly does NOT ship:** custom `<NativePaywall>`; full Bokmål / SV / DA / FI / IS UI translation; app-local grace as a user-facing trial (built as primitive, not exposed); DMA external-purchase; BankID; Vipps-on-paywall; existing-user re-onboarding; Android; web; iPad-tuned layout with external-keyboard tab order.

---

## 2. Flow Specification

One screen per file under `app/onboarding/*` (Expo Router 6, typed routes). Existing `app/onboarding.tsx` is demolished; `app/onboarding/_layout.tsx` owns the stack + progress affordance.

**Progress affordance (UX #1):** segmented 5-dot indicator covering S2–S6 only. S1 shows no progress dots. S7–S9 show no progress UI (reward phase, not work). Endowed-progress effect: dot 1 lit on S2 entry. Dots collapse S5/S5a/S5b into a single segment.

**Strava-dry copy canon (UX #14):** (a) no second-person possessive transformation verbs ("unleash your potential"), (b) no comparison-to-others framing ("412 lifters in Norway," "people like you"), (c) indicative over imperative for non-critical actions ("You can change these anytime"), (d) ≤ 8 words per display line, (e) no emojis, no exclamations, no motivational filler. Register rubric committed to `docs/prism/onboarding-flow/copy-rubric.md`.

**Error copy canon (UX #10):** canonical strings in `lib/copy/errors.ts`. Every error string says (a) what failed in user terms, (b) what the user can do, (c) reassurance that data is safe. Four strings locked:

- Network/sync: "Couldn't reach Fitbull. We'll retry in the background — your answers are safe."
- HealthKit permission fail: "Apple Health didn't respond. Add your stats manually now and try Health later in Settings."
- Aha LLM fail: "Couldn't reach our AI coach — try again in a moment." (one sentence, specific)
- Paywall sheet fail: "Couldn't open the purchase screen. Try again, or skip for now — your plan is waiting."

### S0 — App Store listing (not a screen)

**Purpose:** honest Privacy Nutrition Label covering the **full data footprint** [HealthKit-Privacy C3].

**Declared categories:**

- **Health & Fitness → Linked to You → App Functionality** (Convex-stored body stats, consented Art. 9 data).
- **Identifiers → Linked to You → Analytics** (PostHog `distinct_id` + userId merge; iOS IDFV not requested).
- **User Content → Linked to You → App Functionality** (chat messages, workout logs, aha outputs).
- **Contact Info → Email Address → Linked to You → App Functionality** (email-password sign-up path; SIWA relay emails per-developer-team).
- NOT Tracking. NOT Advertising.

**`NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` (final strings, locked Phase 6) [HealthKit-Privacy CR4]:**

- Share: *"Fitbull reads your weight, height, and body-fat percentage from Apple Health so you don't have to re-enter them. We never read sleep, heart rate, cycle, or workout data."*
- Update: *"Fitbull writes your completed strength workouts and estimated active energy to Apple Health so they count toward your Fitness rings."*

Replaces the current vague strings in `app.json:48-49`. Verified in Phase 10.

### S1 — Welcome + sign-up (`app/(auth)/sign-up.tsx`, refactor)

- **Purpose:** create identity. SIWA primary (D4). Skeptic side-door per UX #8.
- **Inputs:** SIWA button (primary, native `expo-apple-authentication`), email + password (secondary), "Already have an account? Sign in" link (UX-A11y #8: label not duplicated with SIWA). Privacy + Terms tappable above submit — Art. 13 discharged before submit.
- **Skeptic side-door (UX #8):** a subtle link below SIWA — *"Experienced lifter? Skip to the app"* — routes to `/(tabs)` after writing `userProfile` defaults: `{ goals: ["stronger"], primaryGoal: "stronger", experience: "experienced", trainingDaysOfWeek: [1,3,5], dataSource: "manual", ageYears: null, biologicalSex: null, weightKg: null, heightCm: null }`, `userOnboarding.hasCompletedOnboarding = true`, `userConsents` NOT written (health_data_personalization = false). Mural checklist includes "Enable AI personalisation" as item 1 for this cohort. Analytics: `skipped_to_app { reason: "experienced_lifter" }`.
- **Abandonment recovery (UX #11):** on relaunch, if `intake-draft-store` is non-empty AND `hasCompletedOnboarding === false` AND draft is < 7 days old, show interstitial: *"Welcome back. Pick up where you left off?"* with `Continue` (last screen + 1) and `Start over` (clears draft → S2). Draft > 7d old → auto-clear, go to S2. If S6 completed but paywall-exited, relaunch lands on aha directly (never re-run intake). Analytics: `intake_resumed`, `intake_restarted`.
- **SIWA ↔ email account collision [Security CR5]:** `convex/auth.ts` callback detects when a SIWA `sub` has no existing user but a same-email row already exists (non-relay). Surface support path copy instead of silent double-account. Document that relay `@privaterelay.appleid.com` is authoritative identity; app copy must never treat email field as "real" address. Confirm `usesAppleSignIn: true` in `app.json` + Apple Developer entitlement for team ID before TestFlight. `@convex-dev/auth` account-linking story researched in Phase 4 pre-flight; if no native primitive, the collision branch surfaces an explicit support-email copy and rejects the second sign-in method for that email.
- **Accessibility:** SIWA uses native button (platform-correct contrast/Dynamic Type). Labels/roles on email+password via `components/ui/label.tsx`. 44×44pt targets. After SIWA success, `AccessibilityInfo.setAccessibilityFocus()` on destination first heading [Mobile-A11y #13].
- **Analytics:** `intake_started` (mount, not unmount). `auth_method_selected { method }`. `auth_succeeded { method }`. `skipped_to_app { reason }`.
- **Files:** `app/(auth)/sign-up.tsx`, `app/(auth)/sign-in.tsx`, `components/auth/apple-sign-in-button.tsx` (new), `app.json`.

### S2 — Goal (`app/onboarding/goal.tsx`)

- **Purpose:** multi-select intent with primary pin.
- **Inputs:** 4 cards — *Stronger, Leaner, Healthier, Back in a routine*. Multi-select; pin primary after first tap.
- **No pre-selection [UX #13].** Primary-pin becomes available after first goal tapped; defaults to first-tapped (mechanical, not nudge). Disabled CTA shows microcopy: *"Pick at least one to continue."*
- **Copy:** subhead *"Goal."* (not "What brings you here?" — too therapy-register per UX #14).
- **Schema (promoted to literal union) [Security CR5, AI-Safety #3]:** `goalValidator = v.union(v.literal("stronger"), v.literal("leaner"), v.literal("healthier"), v.literal("routine"))`. Both `goals[]` and `primaryGoal` reference it. Array length capped at 4 server-side.
- **Card assets [Performance #7]:** WebP, ≤40KB each, bundled under `assets/onboarding/`, never fetched. `expo-image` with `contentFit="cover"` + blurhash placeholder. Decoded dimensions match render within 2× to avoid scaling cost.
- **Analytics:** `goal_set { goals, primaryGoal }`.
- **Accessibility:** cards `accessibilityRole="checkbox"` + `accessibilityState={{ checked }}`; primary-pin control `accessibilityRole="radio"`. Each card's `accessibilityLabel` expands the card title to a full SR sentence per Mobile-A11y #16 (e.g. display "Stronger", SR reads "Stronger — build strength and muscle").

### S3 — Experience (`app/onboarding/experience.tsx`)

- **Purpose:** single-select skill level; feeds prompt tone.
- **Inputs:** 3 chips — `beginner | returning | experienced` (validator literal union). Each chip shows an honest one-line framing. Chip SR labels expand per UX #14 + Mobile-A11y #16 (e.g. "Returning — some training history, coming back after a break.").
- **Copy:** *"How long have you been training?"*
- **No side-door here** — the side-door lives at S1 (confirmed UX #8).
- **Analytics:** `experience_set { experience }`.

### S4 — Training days (`app/onboarding/days.tsx`)

- **Purpose:** commitment ceremony.
- **Inputs:** day-of-week multi-select (1–7 selections).
- **Copy rewrite [UX #2]:** header *"Which days can you train this week?"* (was "actually train" — reads as Jantelov-violating accusation). Sub-caption below picker: *"You can change these anytime."* Avoid the word "commit."
- **44pt compliance [Mobile-A11y #3]:** on widths ≤ 375pt (iPhone SE), render as **2-row grid (4+3)** not a single row. Every chip's effective tap target is ≥ 44×44pt, enforced via `hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}`. `components/ui/button.tsx` gets a new `onboarding` size variant `h-12` (48pt) minimum; intake screens pin to this variant. Maestro adds an iPhone SE simulator profile run.
- **Analytics:** `days_set { count, weekdays[] }`.
- **Writes:** staged to in-memory intake draft (see §3.8 for persistence rules).

### S5 — HealthKit primer + ask (`app/onboarding/healthkit.tsx` — iOS only)

- **Purpose:** Fitbull-owned primer BEFORE Apple's sheet. Equal-weight "Not now."
- **Displayed reads (verified against `lib/healthkit.ts:40-50`):** HKQuantityTypeIdentifierBodyMass, HKQuantityTypeIdentifierHeight, HKQuantityTypeIdentifierBodyFatPercentage.
- **Displayed writes:** HKQuantityTypeIdentifierActiveEnergyBurned, HKWorkoutTypeIdentifier.
- **Critical correction:** `lib/healthkit.ts` does NOT request age or biological sex. Always manual.

**Copy layout, locked in order [UX #3, HealthKit-Privacy C5]:**

1. Header: *"Import from Apple Health (optional)."*
2. Won't-reads FIRST: *"We don't read your sleep, heart rate, cycle, lab results, or workout history."*
3. Reads SECOND: *"We'll read your weight, height, and body fat percentage — so you don't have to type them."*
4. Writes THIRD: *"We'll save workouts you finish to Apple Health so your Fitness rings close."*
5. Revocation: *"Change any of this in Settings > Privacy > Health."*
6. Two equal-weight buttons: `Import from Apple Health` and `Not now` — same size, same visual weight, no underline.

**VoiceOver grouping [Mobile-A11y #4]:** each of the three content groups is a single accessible element with a consolidated `accessibilityLabel` (e.g. "Health data we don't read: sleep, heart rate, cycle, labs, workout history.") and children marked `accessibilityElementsHidden={true}`. Group headings carry `accessibilityRole="header"`. Both buttons receive equal `accessibilityLabel` emphasis.

**Analytics:** `healthkit_primer_shown`, `healthkit_granted { grantedScopes: string[] }`, `healthkit_denied`. Never fire values — only scope names (documented rationale in `lib/analytics.ts` per HealthKit-Privacy C6; if scope list ever widens to sex-indicative types, re-evaluate).

#### S5a — On-grant confirmation (`app/onboarding/healthkit-prefill.tsx`)

- **Purpose:** editable "we pulled 82,3 kg — still right?" confirmation.
- **Inputs:** age (manual, always), weight (prefilled, editable), height (prefilled, editable), body fat % (prefilled, editable, optional). `biologicalSex` is NOT collected here [UX #15, see S6 note]. Moved out of intake entirely; asked at first calorie-calc tap.
- **Age gate (hard) [AI-Safety #7]:** `ageYears < 16` → block submission with a dedicated error screen *"Fitbull is for users 16 and older. Please come back when you're eligible."* Documented in `docs/compliance/age-gate.md`.
- **Sanity bounds, client + server [AI-Safety #4]:** age 16–100, weight 30–250 kg, height 120–230 cm, body fat 3–60%. Mutation rejects out-of-range with typed error; client shows inline error copy.
- **HealthKit reads performance [Performance #10]:** `lib/healthkit.ts` uses `limit: 1` + `sortDescriptors: [endDate DESC]` for weight, height, body-fat — verified Phase 6. Exit target: prefill ≤ 300ms on a dev device seeded with 2+ years of samples.
- **Labels [Mobile-A11y #9]:** every `<TextInput>` preceded by `<Label>` (`components/ui/label.tsx`) with `nativeID` / `accessibilityLabelledBy`. Placeholder text is not a label.
- **Analytics:** `manual_stats_complete { dataSource: "healthkit" | "mixed" }` — no values, no bounds.

#### S5b — On-denial manual (`app/onboarding/manual-stats.tsx`)

- **Purpose:** single screen per Baymard §10 (don't split memorised numerics).
- **Inputs:** age + weight + height (required); body fat % (optional). Same bounds + 16+ gate as S5a.
- **Analytics:** `manual_stats_complete { dataSource: "manual" }`.
- **Files for S5 family:** `app/onboarding/healthkit.tsx`, `app/onboarding/healthkit-prefill.tsx`, `app/onboarding/manual-stats.tsx`, `lib/format.ts` (comma-decimal parsers: weight, height, age — no regex duplication), `lib/healthkit.ts` (verify `limit:1` + sort).

### S6 — GDPR Art. 9 consent + intake summary (`app/onboarding/consent.tsx`)

- **Purpose:** discrete, unbundled, specific-purpose consents. Art. 7(1) requires timestamp + copy-version hash. Also Nordic conversion moment.

**Three unbundled consent rows, each with its own explicit checkbox (not pre-checked) [Security CR3, HealthKit-Privacy CR3, AI-Safety #12]:**

1. **`health_data_personalization`** — "OK, use my weight, height, and workouts on this device to personalise my coach." (local/Convex storage)
2. **`ai_coach_inference`** — "OK, send my profile (weight, height, age, training goals) to OpenAI (United States, under Standard Contractual Clauses) so the AI coach can generate my plan." Required for aha path.
3. **`analytics`** — "OK, send anonymous usage analytics to PostHog (Frankfurt, EU) so Fitbull can improve the app." *Default off*; affirmative grant required before PostHog starts capturing [HealthKit-Privacy C1, Security CR5].

**Copy structure [UX #4]:** each row is a **bold scannable line** (primary consent sentence, above) + **fine print** (Art. 9/28 specificity, below). Checkbox labels are affirmative ("OK, use my data to personalise") not legal ("I consent to…"). Sub-processors link below the three rows → list recipients (OpenAI US / SCC, PostHog EU-Frankfurt, RevenueCat US / SCC, Convex per region declaration).

**Paywall disclosure MOVED [UX #4]:** the *"Your plan is ready — unlock to start Monday…"* line does NOT appear on S6. It appears on S9 interstitial only. S6 is consent, not conversion preview.

**Withdraw promise:** *"You can withdraw this in Settings anytime."* — backed by Settings UI shipped in V1 (see §3.10 and Phase 8) [HealthKit-Privacy CR5, Security CR3].

- **Intake summary:** compact review list of S2–S5 answers with Edit chips. Each Edit chip: `accessibilityLabel="Goal: Stronger"` (value in label), `accessibilityHint="Double-tap to edit"`, `accessibilityRole="button"` [Mobile-A11y #5].
- **Writes:** submission fires `completeOnboardingV2` (§3.4) atomically: `userProfile` (upsert by userId) + `userConsents` (append-only log per purpose; see §3.4) + `userOnboarding.hasCompletedOnboarding = true`.
- **Submit is interactive, NOT queued [Offline-Sync #1]:** S6 uses `useMutation(api.onboarding.completeOnboardingV2)` directly with explicit retry UI. The `syncToConvex` fire-and-forget queue is NOT used by default — it swallows errors and can leave the user stuck. Retry button + copy from `lib/copy/errors.ts` on failure.
- **Server-authored timestamps [Convex-Realtime C8]:** `grantedAt` is set inside the mutation, not from the client (so dedup still works if the queue is ever used as fallback). Client sends `clientIntakeId` (nanoid from `lib/id.ts`) for replay safety.
- **Analytics:** `consent_granted { versionHash, purposes: ["health_data_personalization", "ai_coach_inference", "analytics"] }` — only that granting happened + what + version, never values.
- **Accessibility:** checkbox `accessibilityRole="checkbox"` + full consent sentence as label; disabled Submit uses `accessibilityState={{ disabled: true }}`, not opacity alone [Mobile-A11y #5].
- **Files:** `app/onboarding/consent.tsx`, `lib/consent.ts` (copy-version hash, per §3.7), `convex/onboarding.ts` (new — `completeOnboardingV2`).

### S7 — Narrated analysis (`app/onboarding/analysis.tsx`)

- **Purpose:** bridge while OpenAI Structured Outputs begins. Three 3–5 pre-filled lines.
- **Copy rewrite [UX #14]:** *"Comparing your stats to other lifters…"* → *"Looking at your inputs…"*. *"Matching 3 days to weekday gaps…"* → *"Fitting 3 sessions into your week…"*. *"Writing your first session…"* stays.
- **Latency budget [Performance #1]:** three-phase, honest, not a single 6s cutoff.
  - **p50 ≤ 3.5s** plan_first_byte on Oslo LTE / iPhone 12.
  - **p95 ≤ 8s** on same or Slow 3G.
  - **p99 ≤ 14s** worst-case with retry.
  - Hard action kill at 14s; client abort + fallback safety-net session.
  - At p50: if not done, extend with a fourth line *"Refining for your training days…"*.
  - At p95: surface a retry affordance while letting the server action continue.
- **VoiceOver [Mobile-A11y #1]:** use `AccessibilityInfo.announceForAccessibility` queued via `AccessibilityInfo.isScreenReaderEnabled()` check (NOT `accessibilityLiveRegion` — that's Android-only and no-op on iOS). If VoiceOver is active: skip fade animation, render all lines immediately inside a single `accessibilityLiveRegion="polite"` wrapper, and extend the timeout so the SR user can finish reading before routing to S8. Screen-container `accessibilityLabel` carries the full concatenated narration for rotor-sweep context.
- **Reduce Motion [Mobile-A11y #6]:** single `hooks/use-reduce-motion.ts` hook reading `AccessibilityInfo.isReduceMotionEnabled()` + listener; every animated component in onboarding consumes it. No translate/scale/opacity crossfade when enabled.
- **Reduce Transparency / Invert Colors [Mobile-A11y #14]:** if the screen uses `BlurView` or `bg-*/80`, fall back to `bg-background` opaque when Reduce Transparency is on.
- **Reanimated text [Mobile-A11y #10]:** use `Animated.createAnimatedComponent(Text)` where `Text` is from `components/ui/text.tsx` — Dynamic Type flows through theme tokens. Exit: Accessibility XXL scales without clipping.
- **Analytics:** `plan_generation_started` (S6 submit), `plan_first_byte` (first delta lands), `plan_visible` (S8 mount).

### S8 — Aha plan card (`app/onboarding/aha.tsx`)

- **Purpose:** single personalised workout via OpenAI Structured Outputs streaming (D5).
- **Content:** name, target muscle groups, estimated duration, 4–6 exercises each with `exerciseId, sets, reps, restSeconds, coachingNote`. Intake chips (goal, experience, days, weight) editable; editing re-generates via the same action subject to rate-limit (§3.5).
- **Carousel tiles reintroduced [UX #7]:** below the workout, three collapsed tiles — (1) calorie target (Mifflin-St Jeor; if inputs missing, tile degrades to *"Add weight + height to see your calorie target"*), (2) training schedule from S4, (3) plan summary. Tappable to expand. The aha card absorbs synthesis T8's slide 3; tiles 1+2 live alongside it.
- **LLM intro constraints [UX #5, AI-Safety #2]:** schema-bound.
  - 2–3 sentences (not 1 — 1 reads glib).
  - Must reference at least one user-provided input (goal, experience, or days).
  - Recommend-register verbs ("I'd start with," "Given your…," "Since you…") — NOT delivery-register ("Here's your…").
  - Must NOT use possessive "your" as ownership ("your plan") — use as address ("you").
  - No weight-referencing, no body-shaming, no medical framing, no emojis, no superlatives.
- **Footer:** medical disclaimer persistent [AI-Safety #6]: *"General fitness guidance — not medical advice. Talk to a qualified professional before starting if you have injuries, pregnancy, or heart conditions."* Links to methodology page (same destination referenced from S9 [UX #15]).
- **Streaming render strategy [Convex-Realtime C11]:** the client does NOT `JSON.parse` on each tick. It reads `onboardingAha.status`: during `"streaming"` it shows a skeleton ("Writing your first session…"); on `"complete"` it unmounts skeleton and renders the fully-parsed card at once. This preserves honest perceived latency without a partial-JSON parser. OpenAI `refusal: "..."` shape handled separately [Security C6]: same error copy as failure.
- **VoiceOver [Mobile-A11y #2]:** no live region during stream. On `status === "complete"`, announce once via `announceForAccessibility` with a single-sentence summary ("Your first session: upper/lower split, 45 minutes, 5 exercises. Double-tap to continue."). Edit chips are a separate `accessibilityRole="button"` group below the card; each chip `accessibilityLabel` includes current value (Mobile-A11y #5).
- **Error state [Mobile-A11y #7]:** `accessibilityLiveRegion="assertive"` + `announceForAccessibility` + `setAccessibilityFocus` on the retry button. Copy from `lib/copy/errors.ts`. `retry button accessibilityLabel="Retry generating your plan"`.
- **Fallback safety-net [AI-Safety #9]:** if two retries fail OR the p99 14s hard-kill fires, present the static safety-net session from `lib/onboarding-fallback-session.ts` (3-exercise bodyweight beginner session: squat, push-up, row). Copy: *"We couldn't reach the coach right now. Here's a starter session — your full plan will be ready in the app."* Analytics: `plan_generation_failed`, `plan_fallback_shown`.
- **React Compiler safety [Performance #2]:** stable keys on exercises (`exercise.exerciseId`), `useAnimatedStyle` correctness (never read `.value` during render), `useSharedValue` declarations above conditional branches. Phase 7 adds `npx react-compiler-healthcheck` against `components/onboarding/*.tsx` as an exit gate.
- **Render budgets [Performance #9]:** first pixel ≤ 500ms after `plan_first_byte`; animation ≥ 55fps average, no frame > 50ms.
- **Files:** `app/onboarding/aha.tsx`, `app/onboarding/methodology.tsx`, `convex/onboardingActions.ts`, `lib/onboarding-fallback-session.ts`.

### S9 — Paywall interstitial + RevenueCat chrome (`app/onboarding/paywall.tsx`)

- **Purpose:** D9 interstitial carrying Apple 3.1.2 disclosure + Non-Promise Pledge + Methodology link, followed by `RevenueCatUI.presentPaywall()` (or fallback — see below).

**Visual hierarchy [UX #6]:**

- **Above fold:** header + 3.1.2 disclosure + primary CTA. Nothing else. This is the Apple-compliance surface.
- **Below fold:** Non-Promise Pledge as collapsed accordion (*"4 things we promise — tap to read"*) + Methodology link.
- **Skip route:** *"I'll decide later"* as tertiary text button in footer, same color weight as Methodology link — not grey-underlined.

**Trial eligibility branch [RevenueCat F6]:** before presenting, call `Purchases.checkTrialOrIntroDiscountEligibility([annualSKU])`. Branches:

- Eligible → *"7 days free, then {priceString}/{period}. Cancel anytime in Settings > Apple ID > Subscriptions."*
- Ineligible → *"{priceString}/{period}, cancel anytime."* (no free-trial copy; prevents 3.1.2 bait-and-switch on reinstall).

Fire `paywall_interstitial_shown { trialEligible: boolean }` for segmentable funnel.

**Price plumbing [RevenueCat F9]:** interstitial props are `priceString: string` (pass-through from `Purchases.getOfferings()` — never concatenate manually), `introPriceString`, `subscriptionPeriod.unit`, `numberOfUnits`. Iceland renders `$X.XX` (Apple USD fallback) — verified on device in Phase 10.

**Offline degrade [Offline-Sync #7]:** if `getOfferings()` fails or exceeds 3s, render interstitial with last-known cached price (AsyncStorage, keyed by storefront) or omit price and substitute *"Pricing will load when you're back online."* — disable primary CTA; leave skip enabled. Do NOT call `presentPaywall()` offline.

**`RevenueCatUI` null fallback [RevenueCat F5]:** if `RevenueCatUI` module is null at runtime, do NOT show a scary alert. Render a Fitbull-authored in-component purchase button inside the interstitial that calls `Purchases.purchasePackage(pkg)` directly (fed from `getOfferings()`). Log `revenuecat_ui_unavailable` to PostHog. Preserves V1.1 deferral of full custom paywall while unblocking trial start.

**Version pin [RevenueCat F4]:** `react-native-purchases` + `react-native-purchases-ui` pinned to exact versions (drop `^` caret). Any bump = "revalidate paywall + redo `rnpModule.default ?? rnpModule` fallback" PR. Mirror the `pnpm.overrides` pattern used for `react-native-nitro-modules`. `Purchases = rnpModule.default ?? rnpModule` preserved; `getOfferings` pulled from the same lazily-loaded object.

**On `PAYWALL_RESULT.PURCHASED` [UX #12]:** state machine `free → trial` with `source: "rc_intro"`, `trialExpiresAt`, `willAutoRenew: true`. S10 home tab shows a top-of-feed banner (not modal): *"Trial active · 7 days free · ends {date}"* + *"Manage in Settings"* link. Auto-dismiss 24h; permanent X. Analytics: `trial_confirmation_shown`.

**Analytics:** `paywall_interstitial_shown`, `paywall_presented { placementId: "onboarding_default" }`, `trial_started { source }` (deduped against RC webhook in `convex/http.ts`).

**Accessibility:** on `presentPaywall()` dismissal, `AccessibilityInfo.setAccessibilityFocus()` on destination first heading [Mobile-A11y #13]. 3.1.2 disclosure readable in full.

**Files:** `app/onboarding/paywall.tsx`, `components/paywall/paywall-interstitial.tsx`, `hooks/use-purchases.ts`.

### S10 — Post-paywall Mural activation checklist (home tab)

- **5 items:** (1) log workout, (2) generate plan, (3) send first coach message, (4) import HealthKit if denied at S5, (5) set weekly target.
- **Item 2 resolution [UX #9]:** item 2 ("generate plan") resolves on the first user-*requested* full plan in-app (chat action / plan create flow) — NOT on aha card generation. Item 2 displays as **pre-complete, greyed, microcopy "done during setup"** from day 1 for the intake cohort.
- **Dismissal [UX #9]:** individual items dismissible. Checklist non-dismissible until ≥3 items complete; then collapsible (not dismissible) as "4/5 complete — tap to expand" chip. Full-complete state replaces checklist with *"Setup done. See you {firstTrainingDay}."* No confetti.
- **Empty state [UX #9]:** before any item complete, home tab primary card is *"Your first session is ready"*; checklist secondary.
- **Skeptic-cohort override (UX #8):** users who skipped at S1 get "Enable AI personalisation" as item 1 (replaces log workout as the primary activation).
- **Aggregated query [Performance #6]:** checklist derives from one `api.home.getActivationState` query that returns all 5 booleans server-side — NOT 5 separate `useQuery` hooks. Phase 10 exit criterion: ≤ 3 concurrent `useQuery` per screen.
- **Accessibility [Mobile-A11y #15]:** each item `accessibilityRole="button"` + `accessibilityState={{ disabled, selected }}` where `selected === completed`; `accessibilityLabel` includes state ("Log your first workout, not completed").
- **Analytics:** `activation_gate_{name}` on flip. `trial_confirmation_shown` for the trial banner.
- **Files:** `components/home/activation-checklist.tsx`, `app/(tabs)/index.tsx`, `convex/home.ts` (new — aggregated query).

### S11 — Day-3 HealthKit re-ask

- **Trigger:** `userProfile.dataSource === "manual"` AND `workoutLogs.count >= 1` AND scheduled `healthkit_reask_after` ≥ 3d old.
- **Cadence cap [HealthKit-Privacy C2]:** after 1 dismissal suppress for 30 days; after 2 dismissals suppress permanently until user toggles in Settings.
- **iOS settings deep-link [HealthKit-Privacy C2]:** if `AppleHealthKit.getAuthorizationStatus` reports `.sharingDenied`, tap routes to `Linking.openSettings()` (cannot re-prompt `requestAuthorization`). If never-asked / undetermined, call `enable()`.
- **Accessibility [Mobile-A11y #15]:** CTA `accessibilityRole="button"`, dismiss button `accessibilityLabel="Dismiss HealthKit prompt"`.
- **Analytics:** `healthkit_reask_shown`, `healthkit_reask_granted | dismissed`.
- **Files:** `components/home/healthkit-reask-card.tsx`.

---

## 3. Architecture

### 3.1 Schema additions (`convex/schema.ts`)

Keep rows keyed by `userId: v.id("users")`. App-owned profile data lives in sibling tables.

```ts
userProfile: defineTable({
  userId: v.id("users"),
  clientIntakeId: v.optional(v.string()), // nanoid from client for replay-safety [Offline-Sync #2]
  goals: v.array(goalValidator), // literal union [AI-Safety #3, Security CR5]
  primaryGoal: goalValidator,
  experience: v.union(v.literal("beginner"), v.literal("returning"), v.literal("experienced")),
  trainingDaysOfWeek: v.array(v.number()),
  ageYears: v.optional(v.number()), // bounded 16-100 in mutation
  biologicalSex: v.optional(v.union(v.literal("male"), v.literal("female"))), // collected at first calorie-calc tap, not in intake [UX #15]
  weightKg: v.optional(v.number()), // bounded 30-250
  heightCm: v.optional(v.number()), // bounded 120-230
  bodyFatPercent: v.optional(v.number()), // bounded 3-60
  dataSource: v.union(v.literal("healthkit"), v.literal("manual"), v.literal("mixed")),
  ahaGenerationCount: v.optional(v.number()), // rate-limit counter [AI-Safety #8]
  archetypeKey: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
}).index("by_user", ["userId"]),

userConsents: defineTable({ // append-only log [Security CR4]
  userId: v.id("users"),
  purpose: consentPurposeValidator, // "health_data_personalization" | "ai_coach_inference" | "analytics"
  granted: v.boolean(),
  version: v.string(), // copy-version hash per lib/consent.ts
  grantedAt: v.string(), // server-authored
})
  .index("by_user", ["userId"])
  .index("by_user_purpose_grantedAt", ["userId", "purpose", "grantedAt"]), // latest-by-purpose read

onboardingAha: defineTable({ // dedicated table, not a chatConversations column [Convex-Realtime C2]
  userId: v.id("users"),
  generationId: v.string(), // client-sent nanoid, idempotency key [Convex-Realtime C4, Offline-Sync #6]
  status: v.union(v.literal("streaming"), v.literal("complete"), v.literal("failed")),
  workout: v.optional(v.any()), // JSON-overwrite each tick [Theme I]
  error: v.optional(v.string()),
  profileSnapshot: v.string(), // JSON snapshot for re-generate comparison
  startedAt: v.string(),
  completedAt: v.optional(v.string()),
  updatedAt: v.string(),
})
  .index("by_user", ["userId"])
  .index("by_user_generationId", ["userId", "generationId"]),
```

Consent purpose literal union (source of truth in `convex/validators.ts`):
`consentPurposeValidator = v.union(v.literal("health_data_personalization"), v.literal("ai_coach_inference"), v.literal("analytics"))`.
No `"marketing"` in V1 [HealthKit-Privacy C1].

**Extend `userSubscriptions`** (pre-launch, 2 TestFlight users):

```ts
userSubscriptions: defineTable({
  userId: v.id("users"),
  revenuecatAppUserId: v.string(),
  entitlement: v.string(),
  isActive: v.boolean(),
  productId: v.optional(v.string()),
  store: v.optional(v.string()),
  expiresAt: v.optional(v.string()),
  updatedAt: v.string(),
  lastEventId: v.optional(v.string()),
  lastEventTimestampMs: v.optional(v.number()),

  // state machine (D10)
  status: v.optional(v.union(
    v.literal("free"),
    v.literal("trial"),
    v.literal("pro"),
    v.literal("grace"),
    v.literal("paused"), // Android paused subs [RC F1]
    v.literal("lapsed"),
  )),
  source: v.optional(v.union(
    v.literal("rc_intro"),
    v.literal("rc_paid"),
    v.literal("rc_temp"), // TEMPORARY_ENTITLEMENT_GRANT [RC F1, F11]
    v.literal("app_local"),
  )),
  sourceHistory: v.optional(v.array(v.object({ // audit trail [RC F11]
    source: v.string(),
    grantedAt: v.string(),
    reason: v.string(),
  }))),
  cancelReason: v.optional(v.string()), // from RC CANCELLATION payload [RC F1]
  trialExpiresAt: v.optional(v.string()),
  willAutoRenew: v.optional(v.boolean()),
  lastVerifiedAt: v.optional(v.string()),

  // DCSA + reminders [Convex-Realtime C6, RC F7, F8]
  notificationAnchorAt: v.optional(v.string()), // INITIAL_PURCHASE ts, reset on RENEWAL
  dcsaNotifiedAt: v.optional(v.string()),
  reminder48hSentAt: v.optional(v.string()),
  emailOptOut: v.optional(v.boolean()),
  storefrontCountry: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_revenuecat_id", ["revenuecatAppUserId"])
  .index("by_status", ["status"]) // [Convex-Realtime C5]
  .index("by_status_trialExpiresAt", ["status", "trialExpiresAt"])
  .index("by_status_lastVerifiedAt", ["status", "lastVerifiedAt"])
  .index("by_status_notificationAnchorAt", ["status", "notificationAnchorAt"])
```

**Migration [Convex-Realtime C9]:** Phase 1 includes a one-shot `internalMutation migrateSubscriptionsV2` computing state-machine fields from existing `(isActive, expiresAt, productId)` for the 2 TestFlight rows. Run manually via Convex dashboard. Phase 10 pre-ship checklist item.

### 3.2 Subscription state machine refactor

1. `convex/validators.ts` — add `entitlementIdValidator` + export constant tuple `ENTITLEMENT_IDS = ["fitbull_pro"] as const`. **Single source of truth** [RC F2, Theme K]: `lib/subscription-constants.ts` exports `ENTITLEMENT_ID = "fitbull_pro"`; both `convex/` and client import from there. Delete the `REVENUECAT_ENTITLEMENT_ID` and `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` env vars and the `?? "Fitbull Pro"` fallbacks. Delete the "first active entitlement" fallback at `hooks/use-purchases.ts:65-75` in the same PR.

2. `convex/subscriptions.ts` — rewrite `upsertSubscription` + `updateFromWebhook` to compute `status` as a pure function. Add `getSubscriptionState` query. Honor **out-of-order protection [Offline-Sync #5, RC F3]**: compare incoming `event_timestamp_ms` (webhook) or `customerInfo.requestDate` (client) against stored `lastEventTimestampMs`; ignore stale. Log "ignored stale event."

3. `convex/http.ts` — extend RC webhook handler:
   - **Dual-token window [RC F3, Theme L]:** accept `REVENUECAT_WEBHOOK_AUTH_TOKEN` OR `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` (7-day rotation overlap, documented in `docs/revenuecat-webhook-rotation.md`). Use timing-safe compare.
   - **Event coverage [RC F1]:** handle `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION` (with `cancel_reason` captured → `refunded | user_cancel | billing_error | developer_initiated | subscription_replaced`), `EXPIRATION` (replaces the incorrect `GRACE_PERIOD_EXPIRED` reference), `BILLING_ISSUE`, `NON_RENEWING_PURCHASE`, `SUBSCRIPTION_EXTENDED`, `SUBSCRIPTION_PAUSED` → `status: "paused"` (keep entitlement), `PRODUCT_CHANGE` (update `productId`, never reset `trialExpiresAt` on upgrade), `REFUND` / `REFUND_REVERSED` (refunded → `free` with audit row; reversal restores pro), `TRANSFER` (losing app_user_id → `free` + drop `trialExpiresAt`; winning gets entitlement), `TEMPORARY_ENTITLEMENT_GRANT` → `pro` with `source: "rc_temp"` + 24h `expiresAt`, `SUBSCRIBER_ALIAS` (idempotent no-op server-side), `UNCANCELLATION` → restore `willAutoRenew: true`.
   - Replay tests in Phase 2 exit criteria: old-timestamp `INITIAL_PURCHASE` no-ops; `SUBSCRIPTION_EXTENDED` with past ts still updates `trialExpiresAt` [Security #8].

4. `stores/subscription-store.ts` — extend with all new fields. Client **never** evaluates `Date.now() > trialExpiresAt` [Offline-Sync #10]: `status` is server truth; `trialExpiresAt` is display-only ("2 days left").

5. `hooks/use-purchases.ts` — add `getOfferings()` access (cached per onboarding session), `checkTrialOrIntroDiscountEligibility()`. Preserve `Purchases = rnpModule.default ?? rnpModule` lazy pattern [RC F4]. Update `syncCustomerInfo` to respect out-of-order rule.

6. `components/paywall.tsx` + `app/settings/index.tsx:103` — read state machine, not raw `isPro`.

**Convex cron (`convex/crons.ts`) [Convex-Realtime C6, RC F7/F8]:**

- `crons.daily("trial-reminder-48h", { hourUTC: 8, minuteUTC: 0 }, internal.crons.sendTrialReminders)` — scans `by_status_trialExpiresAt` where `status = "trial"` AND `trialExpiresAt ∈ [now+46h, now+50h]` AND `reminder48hSentAt IS NULL`; enqueues email; patches `reminder48hSentAt` in same mutation.
- `crons.daily("dcsa-6-monthly", ...)` — scans `by_status_notificationAnchorAt` where `status = "pro"` AND `notificationAnchorAt + 183d < now` AND `dcsaNotifiedAt < notificationAnchorAt + 183d`.
- Email provider: **Resend** (EU region, Convex integration) [RC F7]. Env var `EMAIL_SERVICE_API_KEY` in Convex env. English V1; locale pivots to NB/SV/DA/FI in V1.1 via user's `storefrontCountry`.
- `unsubscribeFromLegalReminders` mutation + withdraw link in email body. `emailOptOut: true` falls back to `expo-notifications` local notification from same cron trigger.

**RC Experiments disabled in V1 dashboard [RC F10].** A/B lives in PostHog.

**App-local grace primitive:** state-machine only (`source: "app_local"`); not wired to V1 UI.

### 3.3 Analytics wrapper (`lib/analytics.ts`)

Single import site for `posthog-react-native`. Funnel-first event schema (literal union):

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
  | { name: "healthkit_reask_granted" | "healthkit_reask_dismissed"; props: Record<string, never> }
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

// HealthKit firewall: type-level + runtime [Security CR1, HealthKit-Privacy CR1, Theme A]
type ForbiddenKeys =
  | "weightKg" | "heightCm" | "ageYears" | "biologicalSex" | "bodyFatPercent"
  | "activityLevel" | "tdee" | "bmr" | "bmi" | "caloriesBurned"
  | "workoutDurationSec" | "restingHeartRate" | "activeCalories";

// CORRECT distributive conditional; intersect keys with forbidden set
export type NoHealthKitFields<T> = Extract<keyof T, ForbiddenKeys> extends never ? T : never;

export function capture<E extends AnalyticsEvent>(
  event: E & { props: NoHealthKitFields<E["props"]> }
): void {
  // runtime guard: scan keys, throw in __DEV__, drop+warn in prod
  // analytics consent gate: refuse capture() unless userConsents has analytics granted
}
```

**Negative type test [Theme A]:** `lib/analytics.test-types.ts` (type-only) asserts `capture({ name: "consent_granted", props: { weightKg: 82 } as any })` is a `ts(2322)`. Phase 3 exit criterion — `npx tsc --noEmit` must surface it.

**Analytics consent gate [Security CR5, HealthKit-Privacy C1]:** `capture()` checks `userConsents { purpose: "analytics", granted: true }` before forwarding to PostHog. If not granted, drop. PostHog does not start capturing before S6 `analytics` grant. `intake_started` is held in a small in-memory buffer from S1; flushed once at S6 if analytics granted, else dropped.

**Session replay route allowlist [Theme B, HealthKit-Privacy CR2, Performance #3]:**

- **Replay ON (allowlist):** S1 welcome, S2 goal, S3 experience, S4 days, S6 consent (chrome only; content values hidden via `maskAllInputs`), S9 paywall interstitial, S10 Mural checklist.
- **Replay OFF (denylist):** S5 primer, S5a prefill, S5b manual, S7 narrated analysis (frame-sensitive per Performance #3), S8 aha reveal (frame-sensitive + body-stat chips), S11 HealthKit re-ask, all `(auth)/*` routes (email visible per Security #9).
- **Mechanism:** `posthog.startSessionRecording()` / `stopSessionRecording()` gated on route match in a `lib/analytics.ts` hook subscribed to Expo Router. `maskAllInputs: true` globally; per-route override OPT-OUT (never opt-in by default). `recordVideo: false`. Buffer cap `maxSessionBufferSizeBytes: 5_000_000`; `sessionTimeoutSeconds: 900`.

**PostHog configuration:**

- Host `https://eu.i.posthog.com`. IP capture off.
- `captureScreens: false` for onboarding routes. Manual `screen()` calls in `_layout.tsx` effect.
- `reset()` on logout. `identify()` merges anonymous ID.
- **Deferred init [Performance #5]:** PostHog `initAsync` via `InteractionManager.runAfterInteractions` after `useAuthGuard` resolves. Cold-start budget: ≤ +400ms over current baseline. Measured Phase 3 + Phase 10 on iPhone 12.
- **Offline queueing [Offline-Sync #8]:** PostHog RN persists events to disk and flushes on reconnect. Canary Maestro asserts PostHog counts in a 24h window, not 5-minute.
- **Server-side (`posthog-node`) in Convex actions:** `captureImmediate()` + `flushAt: 1` + `flushInterval: 0` + `await Promise.race([client.shutdown(), timeout(2000)])` [Security #7]. Analytics failures never block the user-facing action. `POSTHOG_API_KEY` (server, no `EXPO_PUBLIC_` prefix) in Convex env.

**Rage-quit hook (`hooks/use-rage-quit-tracking.ts`):** AppState-background within 3s of mount → `rage_quit`.

**Bundle-impact budget [Performance #3]:** total JS bundle delta from analytics ≤ 350KB gzipped. Fail Phase 3 if exceeded.

### 3.4 Intake persistence — `completeOnboardingV2` mutation (`convex/onboarding.ts`)

New file. Exports:

- `completeOnboardingV2(args)` — atomic interactive mutation.
- `getProfile()` — public query, authenticated user's `userProfile`.
- `getConsents()` — public query, returns latest-per-purpose (consent log is append-only; this query reduces via `by_user_purpose_grantedAt` index) [Security CR4].
- `withdrawConsent({ purpose })` — appends new row with `granted: false` (never mutates history); cascades per §3.10 [Security CR3, HealthKit-Privacy CR5].
- `deleteAccount()` — Art. 17 cascade per §3.10.

**Arg validator (reject-on-bounds, server-side [AI-Safety #4, #7]):**

```ts
args: v.object({
  clientIntakeId: v.string(), // nanoid, replay-safety [Offline-Sync #2]
  goals: v.array(goalValidator), // max length 4 enforced in body [AI-Safety #3]
  primaryGoal: goalValidator,
  experience: v.union(v.literal("beginner"), v.literal("returning"), v.literal("experienced")),
  trainingDaysOfWeek: v.array(v.number()),
  ageYears: v.optional(v.number()), // body: reject < 16 or > 100
  weightKg: v.optional(v.number()), // body: reject <30 or >250
  heightCm: v.optional(v.number()), // body: reject <120 or >230
  bodyFatPercent: v.optional(v.number()), // body: reject <3 or >60
  dataSource: v.union(v.literal("healthkit"), v.literal("manual"), v.literal("mixed")),
  consents: v.object({
    health_data_personalization: v.boolean(),
    ai_coach_inference: v.boolean(),
    analytics: v.boolean(),
  }),
  consentVersionHash: v.string(),
})
```

**Idempotency semantics [Convex-Realtime C8, Offline-Sync #2]:**

1. `getAuthUserId(ctx)` first; throw on null. `userId` is NEVER a client-supplied arg.
2. `userProfile`: `ctx.db.query("userProfile").withIndex("by_user", q => q.eq("userId", userId)).unique()` → patch or insert. If existing `clientIntakeId === args.clientIntakeId`, no-op.
3. `userConsents`: append-only. For each purpose in `args.consents`, insert a new row `{ userId, purpose, granted, version, grantedAt: Date.now() }`. `getConsents()` returns latest-by-purpose via the `by_user_purpose_grantedAt` index.
4. `userOnboarding`: patch `hasCompletedOnboarding = true`.
5. Timestamps (`grantedAt`, `createdAt`, `updatedAt`) are server-authored inside the mutation body. Never from client (keeps sync-queue dedup workable if ever used as fallback).

**`getAuthUserId` discipline [Convex-Realtime C7, Security Obs #1]:** every public query/mutation/action in `convex/onboarding.ts`, `convex/onboardingActions.ts`, `convex/analytics.ts`, `convex/home.ts` opens with `const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Not authenticated");`. `userId` is never a public arg. `internal.*` mutations called from actions or crons may accept `userId: v.id("users")`.

**Multi-device conflict [Offline-Sync #9]:** last-write-wins on `userProfile`; `userConsents` is additive. On device B, `useOnboardingStatus()` flipping to `completed` mid-intake auto-routes forward; draft purges on server-confirmed completion.

### 3.5 AI aha action (`convex/onboardingActions.ts`)

New file. NOT `convex/chatActions.ts` (which has a subscription gate). Exports:

- `generateAhaWorkout({ generationId: string })` — public action (NOT `internal`), idempotent.
- `rekickAha({ generationId: string })` — public mutation for foreground re-kick after abandonment [Offline-Sync #6].
- `getAha({ generationId })` — internal query used by `useQuery` on the client for reactive streaming.

**Idempotency guard [Convex-Realtime C4, Performance #8]:** action opens with: (a) `getAuthUserId`, (b) lookup `onboardingAha` by `(userId, generationId)`, (c) if status `"streaming"` AND `updatedAt > now - 60s` → return row unchanged (no re-fire, no double-spend); if older, mark `"failed"` and proceed; if `"complete"` → return existing. Client sends `generationId` from nanoid; on foreground-after-background, client reads row; if absent, calls `rekickAha`.

**Input validation [AI-Safety #4]:** re-verify sanity bounds on `userProfile` inside the action before building the prompt — DB backfill bugs could land out-of-range values.

**Consent gate [Security CR3, HealthKit-Privacy CR3, AI-Safety #12]:** action queries `userConsents` for the latest `ai_coach_inference` row; refuses (throws typed error) if `granted !== true`.

**Rate limit [AI-Safety #8]:**

- Per-user lifetime: `userProfile.ahaGenerationCount <= 5` (covers legitimate chip-edit re-generations).
- Per-user-per-30s: block if last `onboardingAha.startedAt` < 30s ago. Implemented via a rate-limit row on a new `rateLimits` table OR inline check on `onboardingAha.startedAt`.
- On cap-hit: return last completed `onboardingAha` row (idempotent fallback), not an error.

**No `tools` parameter [AI-Safety #5]:** action MUST NOT pass `tools` or `tool_choice` to the OpenAI client. Do not import `TOOLS` from `chatActions.ts`. Phase 10 code-review gate explicitly checks this line.

**Model abstraction [AI-Safety #10]:** `convex/openai-config.ts` exports `OPENAI_AHA_MODEL = process.env.OPENAI_AHA_MODEL ?? "gpt-5.2"` and `OPENAI_AHA_FALLBACK_MODEL = process.env.OPENAI_AHA_FALLBACK_MODEL ?? "gpt-5.2-chat-latest"`. Action tries primary; on 5xx/timeout, retries once on fallback; then surfaces failure → safety-net session. `chatActions.ts` refactored to use the same constant in the Phase 0 entitlement pass.

**Env assertion [Security #7]:** action entry asserts `process.env.OPENAI_API_KEY` exists with a typed error before instantiating the OpenAI client. Never log the key.

**System prompt (committed verbatim here; source-of-truth in `convex/onboardingActions.ts` as a file-level constant) [AI-Safety #2]:**

```text
You are Fitbull's onboarding coach. Generate ONE training session based on the user's profile.

MEDICAL BOUNDARY: You are not a doctor. Never diagnose, prescribe medical treatment, or discuss injury rehabilitation. If the profile suggests pain, injury, pregnancy, or a medical condition, output a single gentle mobility session with coachingNote recommending the user consult a qualified professional before training.

AGE & VOLUME: If ageYears < 18, reduce volume, never prescribe heavy barbell work, and recommend coaching in coachingNote. For experience === "beginner": use RPE-based intensity cues in coachingNote (e.g. "RPE 6 — last 2 reps should feel challenging but clean"); do not prescribe absolute load (kg/lb); forbid olympic lifts, plyometrics, unspotted heavy barbell.

LANGUAGE: intro is 2-3 sentences, second-person address (not possessive), recommend-register ("I'd start with", "Given your", "Since you"). Must reference at least one user input (goal, experience, or days). No possessive ownership ("your plan"), no weight-referencing, no body-shaming, no medical framing, no superlatives, no emojis.

PRIVACY: Never repeat the user's exact weight, height, or age in intro. Never reference HealthKit-derived fields beyond what is in the profile payload.

EXERCISE SELECTION: Select exercises only from the provided allowedExerciseIds list. If empty, output an error. Warmup (2-3 movements) and cooldown (2-3 movements) are required.

VOLUME CAPS: beginner: duration 15-45 min, sets*reps <= 50 per exercise; returning: 20-60 min, <= 80; experienced: 20-90 min, <= 120.
```

**Profile fencing [AI-Safety #3]:** user profile is passed as a structured user-message JSON block, not interpolated into the system prompt string. Goal and primaryGoal are validated literal unions before prompt construction.

**Workout JSON schema (response_format.json_schema.schema) [AI-Safety #1]:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["intro", "warmup", "workout", "cooldown"],
  "properties": {
    "intro": { "type": "string", "description": "2-3 sentences, recommend-register, references user input" },
    "warmup": {
      "type": "object",
      "required": ["exercises"],
      "properties": {
        "exercises": {
          "type": "array", "minItems": 2, "maxItems": 3,
          "items": { "$ref": "#/definitions/exercise" }
        }
      }
    },
    "workout": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "targetMuscleGroups", "durationMinutes", "exercises"],
      "properties": {
        "name": { "type": "string" },
        "targetMuscleGroups": { "type": "array", "items": { "type": "string" }, "minItems": 1, "maxItems": 6 },
        "durationMinutes": { "type": "number" },
        "exercises": { "type": "array", "minItems": 3, "maxItems": 8, "items": { "$ref": "#/definitions/exercise" } }
      }
    },
    "cooldown": {
      "type": "object",
      "required": ["exercises"],
      "properties": {
        "exercises": { "type": "array", "minItems": 2, "maxItems": 3, "items": { "$ref": "#/definitions/exercise" } }
      }
    }
  },
  "definitions": {
    "exercise": {
      "type": "object", "additionalProperties": false,
      "required": ["exerciseId", "sets", "reps", "restSeconds", "coachingNote"],
      "properties": {
        "exerciseId": { "type": "string", "enum": "<<bound to allowedExerciseIds from server, filtered by experience tier>>" },
        "sets": { "type": "integer", "minimum": 1, "maximum": 10 },
        "reps": { "type": "integer", "minimum": 1, "maximum": 30 },
        "restSeconds": { "type": "integer", "minimum": 30, "maximum": 300 },
        "coachingNote": { "type": "string" }
      }
    }
  }
}
```

**Post-parse safety enforcement:**

- `sets * reps > 50` (beginner) / `> 80` (returning) / `> 120` (experienced) → reject; serve safety-net.
- `durationMinutes` out of tier bounds → reject.
- Any `exerciseId` not in library → reject.
- Pass `intro` through `openai.moderations.create()` [AI-Safety #11]; on flag (`self-harm` / `harassment` / `harassment-threatening`) → replace with static "Here's your first session — let's start." Log to new `aiSafetyIncidents` table.
- OpenAI `refusal: "..."` shape → treat as failure; serve safety-net [Security C6].

**Streaming shape [Convex-Realtime C1]:**

- Throttle 250ms (matches `chatActions.ts` pattern; pinned as contract in a code comment).
- Each tick: action calls `ctx.runMutation(internal.onboarding.writeAhaDelta, { generationId, workout: <full accumulated JSON object> })` — **full overwrite**, not incremental. Payload is small (~500-800 tokens).
- On completion: mutation sets `status: "complete"`, `completedAt`, flushes.
- On failure: `status: "failed"`, `error: <reason>`; client renders error + retry.
- Consumer: `useQuery(api.onboarding.getAha, { generationId })` — reactive single row.

**Cost budget:** ~$0.01–0.02/user (D5).

### 3.6 Onboarding status single source of truth

`hooks/use-onboarding-status.ts` (Phase 0) — reactive hook [Convex-Realtime C3, Offline-Sync #4].

- Uses `useQuery(api.user.getOnboardingStatus)`. Returns tri-state: `{ status: "loading" | "pending" | "complete", profile?, consents? }`.
- On `undefined` (loading) AND network reports offline: fall back to `auth-cache-store.hasCompletedOnboarding` → `"complete" | "pending"`.
- Online + `undefined`: return `"loading"`. `use-auth-guard.ts` must NOT call `router.replace` during `"loading"`; show splash / last route instead. Never default to `"complete"` on uncertainty.
- `auth-cache-store` updated on every `true` transition AND every subsequent re-confirmation (to catch consent-withdrawal server flips).
- On cold-boot offline after successful `completeOnboardingV2` but before server subscription re-sync: cache holds truth.

**Cold-start budget [Performance #5]:** `useOnboardingStatus` batches with auth-cache-store read — returns immediately from cache, subscribes in background. Mount order in `app/_layout.tsx`:

1. Convex auth provider (blocks on token).
2. `useAuthGuard` + route resolution (first paint).
3. `NetworkProvider` (cheap).
4. **Deferred via `InteractionManager.runAfterInteractions`:** PostHog init, `configurePurchases()`, HealthKit module import, session replay start.

Budget: ≤ +400ms over current baseline on iPhone 12. Measured Phase 3 + Phase 10.

### 3.7 Copy version hash (`lib/consent.ts`)

New file. `CONSENT_COPY` object keyed by purpose (three keys: `health_data_personalization`, `ai_coach_inference`, `analytics`). `hashConsentCopy(purpose)` returns first 8 hex of SHA-256 via `expo-crypto` (no `crypto-js` — +30KB unnecessary). Hash recorded in `userConsents.version`. Copy change → hash change → withdraw-and-re-consent surfaced via Settings.

### 3.8 Intake draft store (`stores/intake-draft-store.ts`)

**Pre-consent Art. 9 data NEVER persists to AsyncStorage [Security CR2, Theme D, Offline-Sync #3]:**

- S2–S4 fields (goal, experience, days — NOT special category) persist to AsyncStorage normally, partitioned by userId. User-ID partition key on `persist()`; cold-boot migration wipes drafts whose partition doesn't match current user.
- S5a/S5b Art. 9 fields (age, weight, height, body fat, sex) stay **in-memory only** (Zustand without `persist` for these slices) until S6 submit. Rationale: 2-minute flow; no cross-session persistence needed.
- Abandonment at S5 → Art. 9 data vanishes on process kill (expected, privacy-aligned). UX #11 resume only restores S2–S4.

**Persistence discipline [Performance #4]:** AsyncStorage writes for the persisted slice (S2–S4) use persist-on-blur + 300ms debounce, NOT on every keystroke. Triggers: screen-blur, "Next" tap, AppState background listener.

**Purge rules [Offline-Sync #3, Theme D]:**

- On `completeOnboardingV2` success (`onSuccess` of `useMutation` — server-confirmed, not optimistic).
- On sign-out (wire into `stores/auth-cache-store.ts:clear()` bulk wipe).
- On user-initiated "Start over" from abandonment-recovery prompt.
- Cold-boot migration when userId partition doesn't match authenticated user.

### 3.9 Paywall interstitial component

`components/paywall/paywall-interstitial.tsx` — presentational. Props: `priceString, introPriceString, trialLength, trialEligible, onCta, onSkip, onMethodology`. No direct `react-native-purchases` import. `app/onboarding/paywall.tsx` composes with `hooks/use-purchases.ts`.

### 3.10 Erasure, withdrawal & retention (`convex/onboarding.ts`, `app/settings/*`) [Security CR3, HealthKit-Privacy CR5, C4, Theme E, Theme F]

**Withdrawal UI ships in V1** (Phase 8) — `app/settings/privacy.tsx`:

- Lists all three consent purposes with current state (from `getConsents()`).
- Toggle-to-revoke calls `withdrawConsent({ purpose })` — appends new row with `granted: false`, never mutates history.
- On `ai_coach_inference` withdrawal: mark existing `onboardingAha` rows as archived; future `generateAhaWorkout` refuses.
- On `health_data_personalization` withdrawal: stop processing; schedule user-profile purge (`scheduler.runAfter(0, internal.onboarding.scheduleProfileErasure, { userId })`).
- On `analytics` withdrawal: stop `capture()` forwarding; call PostHog server-side delete API.
- User remains signed in through withdrawal.

**Account deletion (Apple 5.1.1(v) + GDPR Art. 17) ships in V1** — `app/settings/delete-account.tsx`:

- Cascade inside `deleteAccount()` mutation: `users`, `userProfile`, `userConsents`, `userOnboarding`, `userSubscriptions`, `chatConversations`, `chatMessages`, `workoutPlans`, `workoutLogs`, `onboardingAha`, `aiSafetyIncidents`, and any other owned rows.
- Queue PostHog server-side delete (`posthog-node` delete API by `distinct_id`).
- Set OpenAI zero-retention header on any future `generateAhaWorkout` (30-day ZDR; add `X-OpenAI-Organization` + ZDR header to base client).
- HealthKit authored-sample cleanup: on deletion, issue `deleteObjects` predicate by `HKExternalUUID` for every sample Fitbull wrote.
- Sign out + `auth-cache-store.clear()` + AsyncStorage wipe + `expo-secure-store` clear.

**GDPR Art. 20 export — V1.1 (documented risk accepted):** S6 copy does not promise export in V1. Copy reads "withdraw in Settings," which V1 honors. Export delivered via support email until V1.1 ships the in-app export.

---

## 4. Implementation Phases

**S** <4h, **M** 4–16h, **L** >16h, **XL** days.

### Phase 0 — Setup & unblockers (S)

- Add `entitlementIdValidator` + `ENTITLEMENT_ID` in `convex/validators.ts` + `lib/subscription-constants.ts`. Delete legacy env vars + fallbacks [RC F2].
- Add `hooks/use-onboarding-status.ts` (reactive tri-state).
- Delete spotlight tour: `lib/onboarding-steps.ts`, `providers/onboarding-provider.tsx`, `stores/onboarding-store.ts`, `components/onboarding/*`, any `use-onboarding-target.ts` hooks. Unmount provider from root.
- `docs/revenuecat-webhook-rotation.md` (new).
- Exit: `pnpm lint` + `npx tsc --noEmit` pass; D3 race no longer reproduces.

### Phase 1 — Schema & persistence (M)

- Add tables (`userProfile`, `userConsents` append-only, `onboardingAha`) + indexes per §3.1.
- Add `consentPurposeValidator`, `goalValidator` to `convex/validators.ts`.
- `convex/onboarding.ts`: `completeOnboardingV2` (interactive, idempotent, upsert-or-append, server timestamps, sanity-bounds, age-gate 16+, consent checkboxes) + `getProfile` + `getConsents` (latest-per-purpose) + `withdrawConsent` + `deleteAccount`.
- `lib/consent.ts` (copy + hash).
- `stores/intake-draft-store.ts` (in-memory slice for Art. 9 + partitioned AsyncStorage slice for S2–S4; debounce on blur).
- `lib/id.ts` (nanoid).
- Delete `completeOnboarding` in `convex/user.ts:74-101`.
- Exit: `pnpm convex:dev` clean; `getAuthUserId` called in every public handler; consent append-only verified via dev REPL.

### Phase 2 — Subscription state machine (M–L)

- Schema extension per §3.1 (all new columns + indexes).
- Rewrite `convex/subscriptions.ts` (pure-function status + out-of-order protection).
- Extend `convex/http.ts` (dual-token window + full RC event coverage + timing-safe compare + replay protection).
- Extend `stores/subscription-store.ts` + `hooks/use-purchases.ts` (`getOfferings`, `checkTrialOrIntroDiscountEligibility`, lazy-require preserved, version pins exact).
- Migrate `components/paywall.tsx` + `app/settings/index.tsx:103` to state machine.
- `convex/crons.ts`: trial-reminder-48h + dcsa-6-monthly with `*SentAt` idempotency.
- Resend provider wired; `EMAIL_SERVICE_API_KEY` in Convex env.
- App-local grace primitive implemented, not exposed.
- One-shot `migrateSubscriptionsV2` internal mutation for 2 TestFlight rows.
- Exit: simulated webhook `curl` flips state cleanly across `free → trial → pro → paused → lapsed → refunded`; replay tests pass; old-timestamp no-op confirmed.

### Phase 3 — Analytics foundation (M)

- `pnpm add posthog-react-native posthog-node expo-crypto`.
- `lib/analytics.ts` with corrected HealthKit firewall (type-level `NoHealthKitFields` + runtime key-scan) + negative type-test file + analytics-consent gate.
- Route-allowlist mechanism wired to Expo Router transitions.
- `hooks/use-rage-quit-tracking.ts`.
- `convex/analytics.ts` (server wrapper with shutdown timeout).
- `hooks/use-reduce-motion.ts`.
- Deferred provider mount order per §3.6.
- Bundle + cold-start measurement captured in `docs/perf/baseline.md`.
- Exit: dev events appear in PostHog EU; negative-type-test fires `ts(2322)`; cold-start delta ≤ +400ms; bundle delta ≤ 350KB.

### Phase 4 — Auth UI (S)

- `expo-apple-authentication` + `components/auth/apple-sign-in-button.tsx`.
- SIWA in sign-up + sign-in. Privacy/Terms above submit. `usesAppleSignIn: true` + Apple Developer entitlement verified.
- Skeptic side-door link at S1 [UX #8].
- `convex/auth.ts` SIWA↔email collision branch.
- Research: `@convex-dev/auth@0.0.90` account-linking primitive (if present, wire it; otherwise accept the collision branch as the documented V1 behavior).
- Exit: SIWA succeeds on real device; Hide My Email relay accepted; collision surfaces support-path copy.

### Phase 5 — Intake screens S1–S6 (L)

- Replace `app/onboarding.tsx` with `app/onboarding/_layout.tsx` (segmented 5-dot progress S2–S6) + `goal`, `experience`, `days`, `healthkit`, `healthkit-prefill`, `manual-stats`, `consent`.
- Goal cards: no pre-selection; "Pick at least one" microcopy; WebP assets ≤40KB each; `expo-image`.
- Days: 2-row grid on ≤375pt viewports; `hitSlop`; new `onboarding` Button variant `h-12`.
- Copy rewrites per UX #2, #4, #14; canonical error strings in `lib/copy/errors.ts`.
- Abandonment-recovery interstitial at S1.
- Consent: three checkboxes, unbundled; three consent rows written atomically; server timestamps.
- Reduce-Motion / Reduce-Transparency honored.
- Exit: happy-path + deny-path write correct rows; offline submit shows retry UI; draft clears on server success.

### Phase 6 — HealthKit primer polish (S)

- Lock `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` strings in `app.json` per §S0.
- Primer copy order (won't-reads → reads → writes → revocation) locked.
- VoiceOver grouping on primer.
- `lib/healthkit.ts` verified `limit:1` + sort; extend with `getLatestHeight`, `getLatestBodyFat` if absent.
- Grant-but-null-reads fallback to manual single-screen with gentle copy.
- Exit: grant / deny / grant-null-reads all land in S6 with correct `dataSource`; `NSHealth*` strings verified; prefill ≤ 300ms.

### Phase 7 — AI aha (M–L)

- `convex/onboardingActions.ts` with full safety layer per §3.5 (system prompt, sanity re-check, consent gate, rate limit, no-tools, model fallback, moderation, safety-net fallback).
- `convex/openai-config.ts` (`OPENAI_AHA_MODEL` + fallback).
- `lib/onboarding-fallback-session.ts` (static 3-exercise safety-net).
- `aiSafetyIncidents` table for moderation flags.
- Dedicated `onboardingAha` streaming table (throttle 250ms, full-overwrite).
- `ctx.scheduler.runAfter(0, ...)` from S6 side-effect; `rekickAha` mutation for background-recovery.
- `app/onboarding/analysis.tsx` with VoiceOver queueing + Reduce-Motion + extended timing under VO.
- `app/onboarding/aha.tsx` with skeleton-until-complete render + medical disclaimer + carousel tiles + chip re-generate flow + error-state focus management.
- `app/onboarding/methodology.tsx`: Lindy Line + medical-disclaimer block + sub-processors list (OpenAI US/SCC, PostHog EU-Frankfurt, RevenueCat US/SCC).
- `npx react-compiler-healthcheck` against `components/onboarding/*` as exit gate.
- Exit: p50 `plan_first_byte` ≤ 3.5s on Oslo LTE / iPhone 12; p95 ≤ 8s Slow 3G; hard 14s abort → safety-net; chip edit respects rate limit; background-foreground resumes without double-spend; no `tools` param.

### Phase 8 — Paywall interstitial & trial + Settings privacy (M)

- `components/paywall/paywall-interstitial.tsx` (above-fold CTA+disclosure, below-fold accordion Pledge + methodology, tertiary skip).
- `app/onboarding/paywall.tsx` with trial-eligibility branch + offline degrade + RevenueCatUI null fallback (`Purchases.purchasePackage` path) + storefront price pass-through.
- Trial-confirmation banner in `components/home/trial-confirmation-banner.tsx`.
- **Settings privacy UI [Theme E]:** `app/settings/privacy.tsx` (list consents, toggle-to-revoke) + `app/settings/delete-account.tsx` (Art. 17 cascade).
- Resend templates committed: 48h reminder, DCSA 6-monthly, unsubscribe link.
- Founder letter NOT on S9 (D6).
- Exit: interstitial → paywall → trial start → state machine `trial` + banner shown; offline path disables CTA cleanly; `RevenueCatUI` null fallback tested (force-null in dev); withdraw-consent toggle flows to server; delete-account cascade leaves no orphan rows.

### Phase 9 — Post-paywall activation (S–M)

- `components/home/activation-checklist.tsx` from single `api.home.getActivationState` aggregated query.
- Item 2 pre-complete for intake cohort; skeptic-cohort override.
- Collapse/full-complete states per UX #9.
- `components/home/healthkit-reask-card.tsx` with cadence cap + `Linking.openSettings()` on denied.
- Exit: checklist completion drives gates; re-ask respects caps; ≤ 3 concurrent `useQuery` per screen.

### Phase 10 — Pre-ship polish & verification (M)

- G2: 2026 NOK/SEK/DKK/EUR tier matrix from ASC; prices locked in RC offerings.
- G8: methodology citation DOIs verified (Halperin, Borg RPE 1970, DeLorme 1948, Mifflin-St Jeor BMR-only).
- Dogfood: Slow 3G + HealthKit denied + iPhone 12 + iPhone SE simulator runs.
- Session-replay human review for first 50 real users.
- Canary Maestro (`.maestro/onboarding/99-canary.yaml`) with 24h window invariants.
- **VoiceOver Maestro gate [Mobile-A11y #12]:** `07-voiceover-happy.yaml` — sign-up → aha → paywall with VO on, eyes closed. Blocking ship gate.
- Contrast audit every new surface in light+dark (Stark / Xcode Accessibility Inspector).
- `react-compiler-healthcheck` green.
- **Env var enumeration (pre-ship checklist) [Convex-Realtime C10, Theme K]:**

| Var | Scope | Source | Phase |
|---|---|---|---|
| `OPENAI_API_KEY` | Convex env | existing | — |
| `OPENAI_AHA_MODEL` (optional) | Convex env | new | 7 |
| `OPENAI_AHA_FALLBACK_MODEL` (optional) | Convex env | new | 7 |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | Convex env | existing | 2 |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` | Convex env | new (7d rotation) | 2 |
| `REVENUECAT_REST_API_KEY` | Convex env | new (REST verify) | 2 |
| `POSTHOG_API_KEY` (server) | Convex env | new | 3 |
| `EMAIL_SERVICE_API_KEY` (Resend) | Convex env | new | 2 |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Expo env | new | 3 |
| `EXPO_PUBLIC_CONVEX_URL` | Expo env | existing | — |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Expo env | existing | — |

`ENTITLEMENT_ID = "fitbull_pro"` is code-constant in `lib/subscription-constants.ts`, not an env var.

- Per-screen render-time budgets verified [Performance #9]: S2/S3/S4 mount ≤ 150ms; S5 primer ≤ 400ms; S8 aha first pixel ≤ 500ms after `plan_first_byte`; cold-start → sign-up interactive ≤ 2.2s; narrated analysis ≥ 55fps.

---

## 5. Testing Strategy

Project has no test runner; do not introduce one.

- **Typecheck & lint** every commit: `npx tsc --noEmit`, `pnpm convex:dev`, `pnpm lint`.
- **Manual smoke** per phase exit criteria on iPhone 12 (A14) dev build.
- **Maestro E2E** (`.maestro/onboarding/`):
  - `01-signup-siwa.yaml`, `02-signup-email.yaml`, `03-intake-happy.yaml` (iPhone SE variant), `04-intake-healthkit-grant.yaml` (real-device only), `05-aha-paywall.yaml`, `06-activation-checklist.yaml`, `07-voiceover-happy.yaml` (Phase 10 ship-gate), `08-reduce-motion.yaml`, `99-canary.yaml` (weekly invariants).
- **Pre-ship discipline:** Network Link Conditioner 3G slow + HealthKit denied + iPhone 12. Session-replay watch for first 50 real users. Run `/verify` before every commit.

---

## 6. Risks & Mitigations

Carried forward from synthesis + pre-mortem + 9 reviews.

| Risk | Mitigation | Phase |
|------|------------|-------|
| Aha p95 latency on Oslo LTE blows budget | Three-phase budget (p50 3.5s / p95 8s / p99 14s); narrated-analysis extends + retry at p95; safety-net at p99 | 7, 10 |
| HealthKit denial cohort (≥50%) | Symmetric flow; manual single-screen; day-3 re-ask at intent | 5, 6, 9 |
| Events fire on unmount (pre-mortem) | Forward-only firing; literal union; `captureScreens:false`; rage-quit; session replay 50 users | 3, 10 |
| D3 race | Reactive `useOnboardingStatus()` tri-state + spotlight delete | 0 |
| RC state-machine event gaps | Full event coverage including TRANSFER/REFUND/PAUSED/TEMPORARY_ENTITLEMENT_GRANT/PRODUCT_CHANGE | 2 |
| RC webhook token rotation dropped events | Dual-token window + `docs/revenuecat-webhook-rotation.md` | 2 |
| `RevenueCatUI` null at runtime | In-component `Purchases.purchasePackage` fallback; `revenuecat_ui_unavailable` event | 8 |
| Apple 3.1.2 bait-and-switch on reinstall (ineligible for trial) | `checkTrialOrIntroDiscountEligibility` branches copy | 8 |
| DCSA 6-monthly missing | Resend provider wired; `notificationAnchorAt` pivot; `*SentAt` idempotency | 2, 8 |
| 48h reminder stubbed | Promoted from Phase 10 to Phase 8 hard requirement via Resend | 8 |
| OpenAI cost blow-up via chip spam | Lifetime cap 5 + 30s debounce + idempotency via generationId | 7 |
| Background/foreground double-spend | `generationId` row reuse; 60s staleness rule | 7 |
| AI produces unsafe prescription | System prompt + RPE for beginners + exercise enum + volume caps + moderation + static safety-net | 7 |
| Age gate bypass | 16+ server-side reject; defense-in-depth clause in system prompt | 1, 7 |
| HealthKit firewall inert | `Extract<>` + runtime scan + negative type test + analytics-consent gate | 3 |
| Session replay captures body stats | Route allowlist + `maskAllInputs: true` + denylist on S5a/S5b/S7/S8/S11/auth | 3 |
| Pre-consent Art. 9 persistence | In-memory slice for special-category; AsyncStorage only for S2–S4 partitioned | 1, 5 |
| Withdraw promise unbacked | Settings privacy UI ships in V1 (not V1.1) | 8 |
| Account deletion (Apple 5.1.1(v)) | `app/settings/delete-account.tsx` + cascade including HealthKit externalUUID | 8 |
| OpenAI as non-EU sub-processor undisclosed | `ai_coach_inference` unbundled consent + sub-processors list on methodology | 5, 7 |
| VoiceOver stranded on narrated analysis | `announceForAccessibility` queued + VO-aware timing + live-region on completion only | 7 |
| 44pt failure on iPhone SE days row | 2-row grid ≤375pt + `hitSlop` + `onboarding` button variant h-12 | 5 |
| React Compiler bails on aha growing array | Stable keys + `useAnimatedStyle` correctness + `react-compiler-healthcheck` gate | 7 |
| Cold-start regression | Deferred init order + ≤+400ms budget; measurement in `docs/perf/baseline.md` | 3, 10 |
| Intake-draft IO storm | 300ms debounce + persist-on-blur | 1, 5 |
| Home tab query fan-out | Single aggregated `api.home.getActivationState`; ≤ 3 `useQuery` per screen | 9, 10 |
| Offline S9 paywall | Cached priceString + disabled CTA + skip enabled; never call StoreKit offline | 8 |
| Client trial-clock drift | Server `status` is truth; `trialExpiresAt` display-only; daily cron transitions | 2 |
| Structured Outputs `refusal` shape | Handled as failure → safety-net; same error copy | 7 |
| Prompt injection via goal string | Literal union validator + goals capped len 4 + profile as JSON user-message (not prompt interpolation) | 1, 7 |
| Nordic DCSA 6-month pivot wrong | `notificationAnchorAt` from INITIAL_PURCHASE, reset on RENEWAL; not `lastVerifiedAt` | 2 |

---

## 7. Out of V1 (explicit, unchanged from gate)

- Full Bokmål / SV / DA / FI / IS UI translation.
- Custom `<NativePaywall>`.
- App-local grace as default trial.
- DMA external-purchase entitlement.
- BankID; Vipps-on-paywall.
- Founder's Open Letter on any onboarding surface.
- Existing-user re-onboarding.
- Android; web.
- iPad-tuned layout + external-keyboard tab order [Mobile-A11y #17].
- Unit / integration test framework adoption.
- Dietary intake.
- Spin-the-wheel, countdown urgency, mid-onboarding review prompt, push ask in first 60s, BMI verdict, grey underlined Skip.
- Third-party streaming-JSON partial parser (render-on-complete suffices).
- Archetype-pure plan library (D5 locked).
- GDPR Art. 20 in-app export (V1.1; support-email path acceptable per consent copy wording).

---

## 8. Open Questions for Implementation

- **G2** — 2026 ASC tier matrix. Owner Sebastian, Phase 8.
- **G8** — Citation DOIs. Owner Sebastian, Phase 10.
- **G9** — RC paywall template layout on Dynamic Island / iPhone SE. Phase 10 visual inspection.
- **Convex region** — verify EU deployment for Art. 46 consistency with PostHog EU + OpenAI SCC declarations. Owner Sebastian, pre-Phase 1.
- **`@convex-dev/auth@0.0.90` account-linking primitive** for SIWA relay → email collision. Phase 4 pre-flight.
- **PostHog EU session-replay blob residency** — confirm Frankfurt. Phase 3.
- **RC offering config** — 7-day free trial intro on annual SKU; monthly without. ASC+RC dashboard; Sebastian, Phase 8.

---

## Closing note

Three principles still govern: *the fallback is the product; measure the funnel, not the screens; design for the denier*. This revision adds a fourth for the copy+safety layer: *the copy is the product; measure the moment, not the screen; design for the skeptic.* Narrow, reversible edits. Every file enumerated. No new state library, styling layer, test framework, auth provider, analytics provider, or paywall vendor. Zustand + Convex + NativeWind + RevenueCat + OpenAI + PostHog + Resend (new, email only) is the set.

If the implementation agent finds itself reaching for a seventh framework, a new global state manager, an archetype library, a Bokmål translation, a founder's letter, or an off-plan decision that contradicts §7 — stop, re-read the corresponding Gate decision or review section, and surface the conflict explicitly.

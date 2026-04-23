# Synthesis: Onboarding Flow Overhaul

**Session:** onboarding-flow
**Date:** 2026-04-21
**Inputs:** 14 explore files + 8 rotations + brief/orient/loadout

---

## Executive Summary

Across nine research perspectives and eight cross-reviews, one flow shape survived every hostile rotation with its core intact: **a short structured intake (≤6 decision screens, one question per screen, conversational voice), an AI-voiced but partially-deterministic aha moment, and a soft paywall after the aha** — implemented iOS-only, Nordic-first on English copy with a localized paywall screen, GDPR Art. 9 explicit consent unbundled from Terms. The flow is structurally Cal AI / Simple / MacroFactor, but explicitly designed for the *denier* (HealthKit, mic, notifications) and the *slow* (Oslo LTE, iPhone 12) rather than the happy path the pre-mortem crucified.

The single biggest trade-off the team must decide at gate is **how much of the plan is LLM-generated vs. deterministic-plus-LLM-narrated**. The Naive review and the Green-Hat-reviews-Pre-mortem both converge on "LLM voice, deterministic (archetype/template) plan content" as the architecture that avoids every pre-mortem failure simultaneously. The AI-Aha white-hat confirms tool-call streaming is categorically broken on real networks; the Pre-mortem shows real-device, real-network p95 hitting 16.4s of blank screen. Committing to archetype-plus-LLM-voice collapses the debate about streaming, timeouts, and HealthKit-denial plan quality.

**Top three risks** (ranked by rotation weight): (1) the pre-mortem's compound failure — streaming illusion + HealthKit denial 41% + PostHog unmount-tracking — which was the shape-agnostic root cause in all nine Shape failure narratives from Pre-mortem-reviews-Green-Hat; (2) the monetization stack's missing trial-state machine + custom paywall + Nordic compliance cron, which blocks every trial variant and today stacks paywall+spotlight overlays (D3 race, concrete repro); (3) regulatory/platform exposure on GDPR Art. 9 explicit consent (EEA, Norway Datatilsynet April 2025 enforcement), Apple 5.1.3 HealthKit-data-not-for-tracking (PostHog must never receive HealthKit fields), and Apple 3.1.2 subscription-disclosure conspicuousness — all three of which the RevenueCat default paywall chrome cannot satisfy.

---

## The Flow — Convergent Shape

Across Black-Hat-reviews-Naive (the hybrid 5-screen intake), Green-Hat intake Shape 5 (Nordic-local anchoring, also winner of Pre-mortem-reviews-Green-Hat), Scout's "patterns that keep winning" distillation, and the Naive-reviews-White-Hat-AI-Aha keystone (Q3 "why stream at all"), the convergent screen sequence is:

**S0. App Store listing** — Privacy Nutrition Label honest (Health & Fitness → Linked to You → App Functionality, *not* Tracking or Analytics; PostHog disclosed for Analytics on non-HealthKit events only). Screenshot 1 in NOK with comma decimal. (Stakeholder §00, Stakeholder-reviews-Nordic top-3, Nordic-localization §6.)

**S1. Welcome + sign-up.** Sign-in with Apple as primary (pending G1: verify `AppleProvider` exists in `@convex-dev/auth@0.0.90`). Email/password secondary. Copy: "One account, syncs across iPhone and iPad. We don't share your data with advertisers." The legal bar is Art. 13 privacy-notice-at-collection reachable before submit, not bundled into ToS (Nordic-localization §5; White-Hat-reviews-Stakeholder C8 — the load-bearing fact).

- **Anonymous-first vs. sign-up-first**: Auth & Data white hat established that `@convex-dev/auth@0.0.90` ships an `Anonymous` provider (🟢 verified), upgrade is supported via a custom `createOrUpdateUser` callback (🟢), and `userId` can be preserved across the transition (🟡 pattern, untested here). The Naive and Green-Hat Shape 6 lean on this to move sign-up later. The Pre-mortem's Shape 6 failure narrative shows the team "forced email sign-up at grace start, losing the 'no friction' value of the shape entirely." **Gate decision required (D4).**

**S2. Goal (multi-select, Headspace +10%)** — 4 Nordic-calibrated cards: *Stronger, Leaner, Healthier, Back in a routine* (Naive #9 / Green-Hat Shape 5). `goal: string[]` with a primary pinned. Feeds carousel slide 3.

**S3. Experience (single-select)** — beginner / returning / experienced. Feeds plan prompt tone.

**S4. Training days (day-of-week multi-select)** — "Pick the days you'll actually train this week" (Naive #5's commitment framing). `number[]` keyed to `planDays.dayOfWeek` (schema already keyed this way per `convex/schema.ts:193`). This is the behavioral hinge — the commitment ceremony survives from Naive.

**S5. HealthKit primer + ask** — *Fitbull-owned* primer screen before Apple's sheet (Green-Hat 3.2; Yellow-Hat social-proof #6, adjusted per Black-Hat-reviews-Yellow-Hat to split into per-purpose consents). Copy lists four reads (weight, height, age-from-DOB, activity baseline) and explicitly what Fitbull will *not* read (sleep, HR, cycle, labs). Two buttons: **Continue** and **Not now** — denial is equal-weight, not a grey link (Stakeholder §04).
  - *On denial:* **single screen** for age + sex + weight + height (Baymard §10: do not split memorized numerics). Comma decimals accepted (`lib/format.ts` + commit `2629ff8`).
  - *On grant:* prefill + editable confirmation ("we pulled 82,3 kg — still right?"). Second-order: persistent passive data channel (Green-Hat Shape 2).

**S6. GDPR Art. 9 consent + intake summary** — *discrete* consent screen, unbundled from Terms, specific-per-purpose. Copy: *"I consent to Fitbull processing my weight, height, and workout data so the AI coach can personalise plans for me. You can withdraw this in Settings anytime."* Compact review of answers so far (Stakeholder-reviews-Nordic ranks this #1 trust lever). Art. 7(1) requires storing the consent record with timestamp + copy version hash.

**S7. Narrated Analysis (3–6s)** — Green-Hat 1.5: 3–5 pre-filled Reanimated lines (*"Comparing your stats to 412 lifters in Norway…"* → *"Matching 3 days to weekday gaps…"* → *"Writing your first session…"*), `reduceMotion: system` respected. Plan selection runs in parallel via `ctx.scheduler.runAfter(0, ...)` started at S6-submit (Green-Hat 1.4 background pre-generation).

**S8. Aha — plan card** — plan content **archetype-picked** from a bundled library (Green-Hat 1.3; Naive Q1) with an **LLM-generated 1–3 sentence voice line** on top ("Hey — a 3-day dumbbell plan for a first-time lifter chasing strength — here's why"). Each intake input is an editable chip on the card (Yellow-Hat #10 — "intake answer editability"). Card includes macro target (Mifflin-St Jeor × activity from S5) and first week's schedule (from S4). These populate the three carousel slides (calories / schedule / plan) that Black-Hat-reviews-Naive argues are load-bearing for 15% trial opt-in.

**S9. Soft paywall** — **custom `<NativePaywall>`** is the V1.1 target (Yellow-Hat-reviews-Black-Hat's hidden asset); **V1 ships RevenueCat default chrome with a lightweight interstitial carrying the 3.1.2 disclosure + Non-Promise Pledge + Lindy line link** (D9 compromise). Pricing in NOK/SEK/DKK/EUR with comma decimal; subscription disclosure in storefront language.

**S10. Post-paywall activation checklist** — Mural pattern (+10% D7 retention, Scout A1): 5-item checklist on home tab — log workout / generate plan / send first coach message / import HealthKit / set weekly target. Replaces the current 8-step spotlight tour entirely.

**S11. Day-3 HealthKit re-ask** — if denied at S5, coach-message nudge after first workout logged (Green-Hat 3.4: "ask at highest demonstrated intent").

### Where the shape has 2–3 open options

Three commits the flow does not yet make:

1. **Sign-up-first vs anonymous-first at S1** (Contradiction C8).
2. **StoreKit free trial vs app-local grace at S9** (Contradiction C3).
3. **Structured Outputs streaming vs archetype-pure at S8** (Contradiction C5 — Green-Hat 1.2 JSON-schema partial parsing is a live alternative; Pre-mortem diagnosis favors archetype).

---

## Key Themes

### T1. "Design for the denied, the slow, and the silent" — the ONE principle that outlasts every shape

**Source:** Pre-mortem-reviews-Green-Hat-Intake synthesis. Echoed in Naive-reviews-White-Hat-AI-Aha Q10, Green-Hat-reviews-Pre-mortem 3.1, Stakeholder §04, implicit in Black-Hat-reviews-Naive §§6–7.

**Convergence:** Every shape's dominant failure mode is the majority landing on the fallback path. HealthKit denial 41% (Pre-mortem observed 59% grant). Mic denial 62% (Shape 9). Articulation failure ~50% (Shape 3 free-form goal). "No past workout" ~55% of beginners (Shape 4). The product is the fallback.

**Confidence: High.** Independent of specific numbers; it's a structural observation.

**Still in tension:** What "full quality for the denier" means. Green-Hat 3.3 proposes a `dataSource: "healthkit" | "manual"` prompt branch; if the plan is archetype-picked not LLM-generated, this branch is redundant. The cleaner frame: archetype plans don't care about data richness; LLM voice degrades gracefully on missing fields.

### T2. Aha content should be deterministic; aha voice should be AI

**Source:** Naive-reviews-White-Hat-AI-Aha (Q1/Q6/Q10 — keystone). Green-Hat-reviews-Pre-mortem (1.3 archetypes as "alternative future" prevention). Pre-mortem's diagnosis (tool-call streaming broken; JSON mode streams field names not exercises).

**Convergence:** 8 hand-authored archetype plans (goal × days × equipment × experience) cover 95% of starter-plan value. One 60-token LLM call generates the personalized intro/caption. Cost drops ~90% (~$0.002 vs ~$0.045 per user); reliability goes to 100% when OpenAI is degraded; streaming debate becomes moot; HealthKit-denial plan quality no longer depends on rich inputs.

**Confidence: Medium-High.** Strong architectural logic; Pre-mortem-reviews-Green-Hat validates Shape 5 (archetype-compatible) as most survivable. Only counter is brand positioning — "AI generates your plan" is marketable; "AI captions your plan" less sexy.

**Still in tension:** Brand positioning. Green-Hat-reviews-Pre-mortem frames it honestly: *"Fitbull's identity shifts from 'AI generates for you' to 'AI guides you through a curated library' — curated-by-humans beats LLM-generated-from-scratch in a market skeptical of AI theatre."* Nordic-native. Reconcilable: AI coach is the differentiator in the *ongoing* product (chat, weekly adaptation); onboarding can archetype-plus-voice without lying.

### T3. Monetization requires a domain model Fitbull does not yet own

**Source:** Yellow-Hat-reviews-Black-Hat-Monetization (whole file). Black-Hat-Monetization §§B3, C1–C4, D3.

**Convergence:** Every monetization risk — screenshot-and-run, with-card trial UX blocked (no `isInTrial`), no-card grace invisible to RC, magic-string entitlement ID duplication, null-fallback paywall absence, Norway 6-monthly notification, D3 race (paywall + spotlight stack), conspicuousness compliance — clusters at the same root: Fitbull is a thin RC adapter with no first-class monetization state machine.

**Convergent solution stack:** custom `<NativePaywall>` + subscription state machine (`status`, `source`, `trialExpiresAt`, `willAutoRenew`, `lastVerifiedAt`) + Convex cron for grace/reminders/compliance. Yellow-Hat's ranking: entitlement-literal-union (tiny, kills silent-failure) and onboarding-status-discriminated-union hook (small, fixes D3) are cheap wins; state machine (medium) is prerequisite; custom paywall (medium) is the compounder.

**Confidence: High.** Every critique maps to specific file+line evidence. "Fitbull doesn't call `getOfferings()` anywhere" and "`presentPaywall()` has no args at three sites" are 🟢 verified.

**Still in tension:** Sequencing. Custom paywall in V1 (bigger effort, "narrow, reversible edits" pressure) or defer to V1.1 (accept 3.1.2 conspicuousness risk and personalized-copy lift forgone)?

### T4. GDPR Art. 9 explicit consent is a conversion moment, not a legal checkbox

**Source:** Stakeholder-reviews-Nordic (#1 ranked lever). White-Hat-reviews-Stakeholder C8 (the single claim that most changes the flow if false). Nordic-localization §5 primary (EDPB 05/2020 §7.1, Art. 7(4), Datatilsynet April 3 2025 enforcement).

**Convergence:** Unbundled, specific, explicit consent control with readable Ingrid-voice copy pointing at a named purpose is both (a) required in EEA/Norway, and (b) the Nordic user's *conversion moment*. These two forces align.

**Confidence: High.** Regulatory requirement 🟢; conversion-moment framing is Stakeholder-voice (one user) reinforced by Nordic-localization §10 — BankID/DNB/Vipps "surface privacy early" under PSD2/FIDA/GDPR.

**Still in tension:** Whether consent at S6 (after intake) or earlier at S1. Nordic-localization §5 reads "before submission." The flow puts it at S6 because goal + days aren't Art. 9. Verify with a sharper Art. 9 + Art. 13 sequencing review at plan time.

### T5. PostHog instrumentation must be funnel-first, not screen-first

**Source:** Pre-mortem (primary); Green-Hat-reviews-Pre-mortem Thread 2 (six preventions); Pre-mortem-reviews-Green-Hat synthesis ("Measurement lies by default").

**Convergence:** Every Shape failure narrative shared one root cause — PostHog events written to component lifecycles produce misleading success rates. Fix: TypeScript-union-constrained event list derived from funnel gates *backwards* (Green-Hat 2.1); forward-only instrumentation (2.3); rage-quit as first-class event (2.2); session-replay-first design (2.6 — the non-obvious prevention).

**Confidence: High.** The mechanism is specific: `onboarding_step_completed` firing on unmount is a real pattern in PostHog RN examples the white-hat-PostHog white hat documented.

**Still in tension:** PostHog at launch or defer (Gap G5 / D7).

### T6. Nordic-first is a flow-shape decision, not a translation task

**Source:** Stakeholder-reviews-Nordic (English-clean > clumsy-Bokmål; NOK + comma paywall + 3.1.2 disclosure in storefront language is the V1 lever); Green-Hat Shape 5 (Nordic-local anchoring brand compass); Black-Hat-reviews-Yellow-Hat (Jantelov + founder-voice collision); Nordic-localization (zero i18n today; CLDR comma decimals; Iceland priced in USD).

**Convergence V1:** English UI (Strava-dry register) + localized paywall screen + NOK/SEK/DKK/EUR pricing + comma decimals + honest privacy labels + GDPR Art. 9 consent screen. **Does NOT ship:** full Bokmål translation, DMA external-purchase DK/SE/FI, Finnish/Icelandic translations, BankID, Vipps payments. Red-herrings from a user-seat (Stakeholder-reviews-Nordic Bucket 3); burn-rate from a Black-Hat seat.

**Confidence: High** on what ships; **Medium** on whether the English tone lands (Stakeholder's "Strava-dry" is aspirational, not A/B-proven). Copy is execution risk, not plan risk.

### T7. Pre-launch social proof voice must be one thing, not three

**Source:** Black-Hat-reviews-Yellow-Hat (§1 voice collision between Founder's Letter and Lindy Line); Yellow-Hat-social-proof's own "Risks that apply across most patterns."

**Convergence:** Ship EITHER founder-as-authority (#1 Founder's Letter, small-medium effort after legal review + support SLA sizing) OR Lindy/third-party-certification (#13 Lindy Line + #3 Audited Methodology, small effort but citations must be accurate). Stacking is incoherent.

**Confidence: High.** Both rotations converged; White-Hat-reviews-Stakeholder independently flagged citation accuracy.

**Still in tension:** Which. Black-Hat-reviews-Yellow-Hat leans Lindy ("survives App Store review, survives founder turnover, aligns with 61% Nordic trust in third-party certifiers"). Yellow-Hat-social-proof leans Founder ("highest-cost-per-word concession an indie app can make"). Both defensible. **Gate decision D6.**

### T8. The carousel (calories / schedule / plan) is the 2% → 15% lever

**Source:** Scout RevenueCat benchmarks; Black-Hat-reviews-Naive §3; White-Hat-Intake §5.

**Convergence:** `Welcome → carousel → Paywall → Onboarding → Home` hit 15% trial opt-in vs 2% for generic-onboarding-last-paywall. The carousel's content is a summary of intake outputs. If intake doesn't collect age/sex/weight/height, slide 1 is blank and we degrade toward 8% (paywall-first variant). This is why Black-Hat-reviews-Naive rejected the Naive's 3-question ceremony on empirical grounds.

**Confidence: High** on the benchmark; **Medium** on whether Cal-AI-style personalized-aha-first performs differently than the RC A/B comparators. Scout's caveat holds: the 15% is a floor, not a ceiling.

---

## Major Contradictions

### C1. Paywall placement: before vs. after the personalized plan preview

**Contradiction stated:** Every explorer except Black-Hat-Monetization §A1/A2 leans "aha before paywall." Black-Hat-Monetization symmetrically surfaces failure modes for both variants and lands on neither — it tees up the RC A/B data showing 2%/8%/15% trial opt-in where "paywall later" is the 2% number.

**Side A (paywall after aha) strongest evidence:** Scout "patterns that keep winning" #1 — Cal AI, Simple, Fastic, Noom, Grammarly (+10–20% on personalized paywall copy, Scout A5); Stakeholder's trust arc ("earliest 'ok this one's fine' is the AI preview that clearly used my inputs"); Health & Fitness top-decile trial-to-paid 68.3% — achievable only with aha-first.

**Side B (paywall early) strongest evidence:** RevenueCat's own A/B: 15% trial opt-in on carousel→paywall vs 2% paywall-last; Rootd 5× revenue from front-of-onboarding dismissible paywall; Future's hard-paywall-before-value. Black-Hat-Monetization §A1: screenshot-and-run turns net-negative below 6.7% trial-start if each generation costs >$0.03.

**Why it matters:** Single biggest conversion lever. Getting wrong caps us at 2% or 8%.

**How the planner should resolve:** Aha-before-paywall wins on evidence weight, **with two mitigations the Black Hat demanded**:
1. Aha plan is archetype-picked (not OpenAI-minted fresh) — screenshot-and-run loses threat because plan value is "inside the app tracking it," not pixels.
2. Disclosure line on last intake screen ("Your plan is ready — unlock to start Monday. 7-day free trial, then kr 149/mo") pre-empts 3.1.2 bait-and-switch.

RevenueCat's "carousel before paywall" is not the comparator — Cal AI / Simple (aha before soft paywall, top-decile H&F) is. **Confidence: Medium-High.** Gate decision D1.

### C2. Form vs. AI-native intake

**Contradiction:** Naive argues intake should *be* the first AI chat (Green-Hat Shape 1). Black-Hat-reviews-Naive rebuts on six distinct empirical grounds.

**Naive side:** `chatActions.ts:491-495` system prompt already asks clarifying questions; duplicating in a form is wasteful; DSC +5.24% / Headspace +10% are citable; rich intake is theater; `stores/onboarding-store.ts` can hold state as "Zustand as anonymous session."

**Black-Hat rebuttal (six empirical breaks):** (1) Mifflin-St Jeor needs four typed numbers — `parseFloat("around 75")` = NaN; (2) `create_workout_plan` tool args require typed `durationWeeks`, `dayOfWeek` — model may emit garbage; (3) carousel's 15% depends on age/sex/weight/height before paywall; (4) PostHog funnel events need discrete steps; (5) DSC and Headspace wins were *inside structured forms* (category error to cite for chat-only); (6) HealthKit prefill needs named Convex slots; plus (7) GDPR Art. 9 needs a discrete consent artifact — chat transcripts are legal ambiguity; (8) Apple 4.2 "minimum functionality" heuristic risk.

**Why it matters:** Flow-shape decision; downstream schema, measurement, compliance all fork.

**How the planner should resolve:** Black-Hat wins on hard constraints (GDPR, carousel, typed tool args). The Naive is *right* that (a) most fields shouldn't be collected by static forms if the AI can extract them later, and (b) commitment-ceremony beats data-grab framing. **Minimum-form hybrid from Black-Hat-reviews-Naive §Synthesis is the resolution: 5 decision screens + consent + aha, with conversational voice inside structured controls (DSC pattern). Equipment + injuries lazy-collected inside the first AI chat.** **Confidence: High.**

### C3. Trial strategy: StoreKit free trial vs. in-app grace period

**Contradiction:** Green-Hat Shape 6 and Yellow-Hat-reviews-Black-Hat-Monetization #3 argue for building an app-local grace primitive. Pre-mortem-reviews-Green-Hat Shape 6 narrative shows this as the second-most-likely-to-fail shape on economic grounds ($0.47 OpenAI/user, 0.38% paid conversion). White-Hat-Monetization §3: iOS auto-trial *requires* card-on-file.

**Side A (StoreKit card-on-file):** Industry-standard; Cal AI / MacroFactor; RC-native analytics; median 39.9% / top-decile 68.3%; Apple 3.1.2 clarity well-documented. Risks: 4.71% H&F refund; `stores/subscription-store.ts` lacks trial fields (6-file refactor); Nordic compliance needs 48h-before-charge email reminder.

**Side B (app-local grace):** Ladder pattern; Nordic "try before buy" resonates; allows mid-onboarding granting for aha moment (Yellow-Hat #8). Risks: invisible to RC; uninstall/reinstall abuse; OpenAI cost blowout (Pre-mortem observed $0.47/user); cohort *selected for* not paying; "Day 3 of 7 free" banner primes pre-churn.

**Side C (both):** Yellow-Hat-reviews-Black-Hat #8. App-local grace as generalized primitive for referral credit, win-back, cohort A/B — not the default trial.

**Why it matters:** Subscription state-machine Yellow-Hat identifies as prerequisite exists exactly to make this representable.

**How the planner should resolve:** Ship StoreKit free trial as V1 offer (card-on-file, industry-standard). Ship the state machine to make app-local grace *representable* but do not expose it in default onboarding. App-local grace = V1.5 infrastructure for referral, win-back, "grant 24h AI access after aha" experiment. This aligns with Nordic compliance (email reminder), RC analytics, and Pre-mortem's Shape 6 failure narrative. **Confidence: Medium-High.** Gate D2.

### C4. Structured intake necessity — is Mifflin-St Jeor load-bearing?

**Contradiction:** Naive argues only calorie calculator needs age/sex/weight/height; collect lazily inside calc. Black-Hat-reviews-Naive §1 argues those fields populate slide 1 of the 15%-carousel; must collect before paywall.

**Naive side:** `calorie.tsx:63-68` is only Mifflin-St Jeor consumer; plan generator takes free-text `goal` and `durationWeeks`; nutrition goals are stored numbers.

**Black-Hat side:** Carousel slide 1 = "here's your calorie target." Without age/sex/weight/height, slide 1 blank; degrade from 15% toward 8%. Mifflin-St Jeor *consumer* is calorie calc; Mifflin-St Jeor *justification for collecting-during-intake* is the carousel.

**How the planner should resolve:** Black-Hat wins — collect at S5. But Naive correctly identifies *sex* as single-consumer (only calorie calc); default from HealthKit biological sex with manual override at first calc tap. Age + weight + height are structurally required. **Confidence: High.**

### C5. Streaming AI vs. canned "analyzing" + atomic plan reveal

**Contradiction:** AI-Aha white-hat shows Fitbull's current "streaming" is DB-delta (200ms throttle), not SSE; Structured Outputs (`json_schema` strict) streams as text deltas; tool calls accumulate lumpy. Pre-mortem showed tool-call streaming categorically broken on real networks (16.4s p95 blank). Naive Q3 (keystone) asks *why stream at all* — a 4–6s canned analyzing screen + atomic reveal avoids the entire architecture debate.

**Side A (stream for UX):** Matches Cal AI theater. Requires Structured Outputs + partial JSON parser (Green-Hat 1.2) or HTTP-stream via `httpAction` (1.6) — both medium effort, both new failure surfaces on real networks.

**Side B (narrated analysis + atomic reveal):** Naive Q3; Green-Hat 1.1 Three-Card Reveal; Green-Hat 1.5 Narrated Analysis. Wait feels like work. No tool-call lumpiness, no JSON-field-name leak, no LTE gap. Compounds with archetype plans (1.3).

**How the planner should resolve:** **Side B wins on evidence weight**: Pre-mortem's failure is 100% deterministic under Side A on Nordic LTE; Side B removes it by construction. Only reason for Side A is brand ("streaming AI is the magic"), which Naive Q3 rebuts. **Confidence: High.** Gate D5.

### C6. Social proof voice — founder letter vs. Lindy / third-party cert

**Contradiction:** Yellow-Hat ranks Founder's Letter #1. Black-Hat-reviews-Yellow-Hat says Lindy Line is more defensible and "ship one, not both."

**Side A (founder):** Nordic build-in-public 30% higher engagement; founder-answered emails generate non-churners; vulnerability is proof. Scales to ~500 users sustainably.

**Side B (Lindy):** 61% Nordic trust third-party cert vs 22% hyperbolic claims; survives Apple 5.1; survives founder turnover; category-error-free if citations accurate.

**Why it matters:** Both tiny effort; voices collide (founder-authority vs "we didn't invent this"). Stacking incoherent per Black-Hat-reviews-Yellow-Hat §1.

**How the planner should resolve:** **Gate D6.** Planner recommends Lindy (survives Apple, survives founder-scaling, Jantelov-aligned); founder letter latent option later in non-colliding surface, not on paywall at launch. Ship Lindy at S8 methodology link + S9 paywall Non-Promise Pledge. **Confidence: Medium.** Either defensible.

### C7. Nordic localization depth

**Contradiction:** Nordic-localization white-hat lays out the full matrix (5 locales, DMA carve-out, Iceland-USD, BankID-first, Vipps non-IAP). Stakeholder-reviews-Nordic classifies most as red-herring theater from a user seat.

**White-hat side:** Regulatory completeness — per-locale plurals, `expo-localization`, `CFBundleAllowMixedLocalizations`, DMA DK/SE/FI, FI/IS separate translations, full privacy label coverage.

**Stakeholder side:** V1 ships English-clean + localized paywall screen + NOK + comma decimals + correct privacy labels. DMA is business math, not UX. Full translation is v1.1+. BankID is category-error for fitness. Vipps on paywall is a lie risk.

**How the planner should resolve:** Stakeholder's framing correct for user-facing scope; white-hat's completeness correct for the verification list. Translation matrix is post-launch. **V1 ships:** English UI + paywall storefront-language + NOK/SEK/DKK/EUR pricing + comma decimals + honest Privacy Nutrition Labels + GDPR Art. 9 consent. **V1 does not ship:** Bokmål/SV/DA/FI/IS translations, DMA external-purchase, BankID, Vipps-on-paywall, i18n infrastructure beyond paywall localization. **Confidence: High.**

### C8. Anonymous-first vs. sign-up-first at S1

**Contradiction:** Auth & Data establishes anonymous→email upgrade is supported but requires custom account-linking per Convex docs. Naive and Green-Hat Shape 6 lean anonymous-first. Pre-mortem-reviews-Green-Hat Shape 6: "anonymous-to-email upgrade required custom account-linking we hadn't finished — so we forced email sign-up at grace start, losing the 'no friction' value of the shape entirely."

**Anonymous-first side:** Lower intake friction; sign-up happens after user invests identity; plan-as-hostage at sign-up commit.

**Sign-up-first side:** Matches current code; `getAuthUserId` everywhere; no custom callback; no CAPTCHA abuse-prevention; Art. 9 consent audit cleaner with known `userId` at S6.

**How the planner should resolve:** Gate D4. Planner recommendation: sign-up-first with SIWA primary (pending G1). Lower risk, matches code, Art. 9 clean, upgrade-path cost not justified at 2 TestFlight users (Black-Hat D1 — pre-launch A/B is noise). **Confidence: Medium.** Anonymous-first defensible if SIWA unavailable.

---

## High-Confidence Conclusions

Act on these now without further exploration:

1. **Delete the current spotlight tour** (`lib/onboarding-steps.ts`, `providers/onboarding-provider.tsx`, three `components/onboarding/*` files). Stakeholder: "2014 app"; Orient pre-confirmed clean-delete.
2. **Fix the D3 race first.** Single source of truth for `hasCompletedOnboarding` via a `useOnboardingStatus()` discriminated-union hook (Yellow-Hat-reviews-Black-Hat item 1). Delete the Zustand flag. Small effort; unblocks every intake design.
3. **Centralize `ENTITLEMENT_ID` as typed literal union** in `convex/validators.ts` (Yellow-Hat-reviews-Black-Hat item 4, tiny, kills silent-failure masking at `hooks/use-purchases.ts:65-75`).
4. **One question per screen** (Houzz +15% A/B). No single-scroll form. `accessibilityLabel` + `accessibilityRole` per control.
5. **Multi-select goal with primary pinned** (Headspace +10%).
6. **Day-of-week multi-select for training days** (already keyed `planDays.dayOfWeek`).
7. **HealthKit primer is Fitbull-owned screen before Apple's sheet.** Explicit reads + explicit won't-reads; equal-weight "Not now"; single-screen manual fallback (Baymard: do not split memorized numerics).
8. **GDPR Art. 9 consent is its own screen.** Unbundled from Terms; specific purpose; audit trail row (Art. 7(1)).
9. **Aha plan content from bundled archetype library, not LLM-minted plan.** LLM writes intro/caption only. Cost ~$0.002/user. Zero streaming.
10. **Narrated Analysis screen during plan resolution.** 3–5 personalized Reanimated lines; `reduceMotion: system`. Plan selection via `ctx.scheduler.runAfter(0, ...)` at S6-submit.
11. **Aha card has editable intake chips.** Each re-opens its question; archetype re-picks instantly.
12. **Soft paywall after aha with storefront-language 3.1.2 disclosure.** NOK/SEK/DKK/EUR + comma decimal.
13. **Post-paywall Mural checklist on home tab** (+10% D7).
14. **PostHog EU host, funnel-first schema, forward-only firing, no HealthKit-derived metrics.** Rage-quit hook. Session replay 100% first 50 users for manual watching before scaling.
15. **Sign-in with Apple primary** if supported (G1).
16. **No dark patterns:** no spin-the-wheel; no countdown-timer urgency; no mid-onboarding App Store review prompt; no forced email before value; no push ask in first 60s; no BMI verdict; no grey underlined Skip.

---

## Gaps & Unknowns

| # | Gap | Why it matters | Blocks planning? | Cost to close |
|---|-----|----------------|------------------|---------------|
| G1 | Sign-in-with-Apple support in `@convex-dev/auth@0.0.90` | Shapes S1 auth; Stakeholder-reviews-Nordic "the 1 thing White Hat did NOT cover that I care about" | No — fallback to email | Cheap: read `convex/auth.ts`, check `@convex-dev/auth/providers/Apple` |
| G2 | 2026 App Store Connect price-point matrix NOK/SEK/DKK/EUR | Paywall copy needs exact numbers; equinux 🟡 | No — plan with estimates, verify at implementation | Cheap: pull from ASC |
| G3 | Whether Convex anonymous → email upgrade preserves `userId` in practice | Load-bearing for anonymous-first | No — sign-up-first default avoids | Medium: prototype test |
| G4 | Real Nordic-vs-US conversion benchmarks for fitness apps | RC 2025 is US-skewed | No — directionally sufficient | Expensive: post-launch cohorts |
| G5 | PostHog Expo Router autocapture compatibility | Docs reference React Navigation only | No — manual `screen()` calls viable | Cheap-medium: test in dev-client |
| G6 | Exact HealthKit request set in `lib/healthkit.ts` | Stakeholder cites "Read: BodyMass/Height/BodyFatPercentage; Write: ActiveEnergyBurned/Workout" — not verified this pass (C24 🟡) | No — plan defines target set | Cheap: file read |
| G7 | Does `chatActions.ts` forward HealthKit-derived values to OpenAI today? | Art. 9 consent copy + Apple 5.1.3 | Copy-ship blocker; not plan blocker | Cheap: grep |
| G8 | Halperin meta-analysis citation correctness | Yellow-Hat's DOI was wrong (Black-Hat-reviews-Yellow-Hat found discrepancy); methodology page ships with citations | No — replace before ship | Cheap: direct lookup |
| G9 | RC paywall template Dynamic Island / iPhone SE layout | Stakeholder C21 🟡 | No if custom paywall; otherwise yes | Cheap: device visual inspection |
| G10 | `REVENUECAT_WEBHOOK_AUTH_TOKEN` in production Convex env | Absence silently kills purchase-recovery (Black-Hat §D4) | No for plan; yes for ship gate | Trivial |
| G11 | `@convex-dev/auth` auth-provider upgrade mid-flight behavior | Latest 0.0.91 is additive | No | Cheap |
| G12 | OpenAI GPT-5.2 mini/nano variant availability + pricing | Naive Q2; hardcoded "gpt-5.2" Thinking twice | No for plan; cost optimization | Medium: research |
| G13 | React Compiler + Reanimated text-streaming on iPhone 12 (A14) | Pre-mortem documented silent bailout + stutter | No — narrated analysis uses static Reanimated strings | Medium: A14 dogfood |

**None block planning**; G1, G7 should be confirmed during plan phase because they shape copy and auth options.

---

## Verified Corrections

Rotation-surfaced claims the plan should use in corrected form:

- **Halperin RPE meta-analysis citation is broken.** Yellow-Hat-social-proof #3 cited `link.springer.com/article/10.1186/s40798-021-00386-8` as 118-study meta-analysis in "Sports Medicine Open 2021"; Black-Hat-reviews-Yellow-Hat verified the DOI prefix `10.1186/s40798` is *Sports Medicine — Open*, but Halperin's 2021 work is in *Sports Medicine* (prefix `10.1007/s40279`). Also: Borg RPE is 1970 not 2008; "Progressive overload: 1948" is DeLorme's specific protocol, concept is older; Mifflin-St Jeor is a BMR estimator not a training plan citation. **Plan: re-verify and correct every citation before methodology page ships.**
- **"Vipps logo signals Nordic care" is factually wrong + App Store risk.** Stakeholder-reviews-Nordic: *"Don't put Vipps anywhere on the paywall."* White-Hat-reviews-Stakeholder C3/C4 rates 🔴 perception + 3.1.1/3.1.3 exposure on EEA-not-EU storefronts. **Plan: no Vipps branding anywhere.**
- **"Norwegians distrust auto-charge" is stakeholder perception, not population fact.** White-Hat-reviews-Stakeholder C15 🔴; Nordic-localization found no cohort-sliced benchmark. **Plan: don't cite as evidence for trial-strategy decisions.**
- **"BankID for fitness" is a category error.** Stakeholder-reviews-Nordic: *"I would be genuinely alarmed if a fitness app asked me for BankID."* Nordic-localization notes DNB/Vipps/Oda use it because they're money/wallet/credit. **Plan: email + SIWA only; no BankID.**
- **Dollar Shave Club and Headspace A/B wins were INSIDE structured forms, not chat-only.** Black-Hat-reviews-Naive §5: DSC was conversational *tone rewriting of a subscription form*; Headspace was multi-select inside a *structured* question. Citing for chat-only intake is the wrong direction. **Plan: conversational tone inside one-question-per-screen structured intake.**
- **Pre-mortem's assumed 85% HealthKit grant rate (from Cal AI teardowns) likely overstates reality.** Pre-mortem observed 59%. Green-Hat-reviews-Pre-mortem and Pre-mortem-reviews-Green-Hat both treat 40%+ denial as design center. **Plan: design for 50% denial; treat grant as optimization.**
- **"Button 4.2.x" is not a real App Store guideline citation.** White-Hat-Monetization §10: closest sections are 4.2 Minimum Functionality and 3.1.1/3.1.2. **Plan: cite 4.2 and 3.1.2 generally; don't invoke "4.2.x."**
- **RevenueCat H&F "12.11% vs 2.18%" download-to-paid (not 10.7% vs 2.1%).** White-Hat-Monetization §7 updated Scout's older figures against 2025 report. **Plan: use 12.11% / 2.18%.**
- **Anonymous provider predates 0.0.80; 0.0.90 → 0.0.91 delta is `jwt.customClaims` + `beforeSessionCreation` (not account-linking changes).** Auth & Data §3. **Plan: upgrade optional, additive only.**
- **No Nordic alternative payment method funds Apple IAP.** Vipps/MobilePay/Klarna/Swish/BankAxept/BankID — none are Apple ID funding instruments. **Plan: IAP only; no DMA external-purchase V1.**
- **Iceland is priced in USD on iOS App Store.** **Plan: don't assume all five Nordics show local currency.**
- **The RevenueCat A/B carousel "15% trial opt-in" comparator is generic onboarding, not Cal-AI-style personalized-aha.** Scout caveat reinforced in Monetization-white-hat §7. **Plan: 15% is a floor, not a ceiling, for our comparator.**

---

## Load-Bearing Facts

Verified facts the planner can quote with confidence:

**Auth & Data:**
- `@convex-dev/auth@0.0.90` Anonymous provider exists and is documented (`providers: [Anonymous]`). Latest `0.0.91` (2026-02-26) is additive.
- Anonymous → email upgrade requires a custom `createOrUpdateUser` callback; auto-linking applies only when provider is verifying (Password with `verify:` configured; OAuth with `allowDangerousEmailAccountLinking`).
- `convex/schema.ts` `users` table has zero intake/profile fields — only `email`, `phone`, verification times, `name`, `image`, `isAnonymous` (from `authTables`).
- All app-owned profile data lives in sibling tables keyed by `userId`: `userSettings`, `userOnboarding`, `userSubscriptions`, `nutritionGoals`.
- `completeOnboarding` (`convex/user.ts:74-101`) accepts no args, flips boolean, stamps `updatedAt` — cannot persist intake today.
- `getAuthUserId(ctx)` called at top of every query/mutation/action in 14 Convex modules.
- Client auth uses `ConvexAuthProvider` with `lib/secure-storage.ts` (expo-secure-store wrapper).
- Two independent `hasCompletedOnboarding` sources exist today: `userOnboarding` (Convex), `stores/auth-cache-store.ts` (AsyncStorage), `stores/onboarding-store.ts` (AsyncStorage). Collapse before shipping.

**AI / Chat:**
- Model is `"gpt-5.2"` hardcoded at `convex/chatActions.ts:586` and `:714`.
- Streaming is Convex DB-delta (200ms mutation throttle — code is 200ms, comment says 500ms), not SSE.
- Tool-call argument streaming is categorically lumpy (Pre-mortem + Naive-reviews confirm).
- Subscription gate at `chatActions.ts:528-536` throws "Subscription required" for non-Pro — blocks current chat action for onboarding use.
- Convex action timeout 10 minutes.
- GPT-5.2 TTFT ~0.81s (non-reasoning); reasoning-mode TTFT can be ~70s (🟡).
- `create_workout_plan` tool call accumulates ~2–4K output tokens for 4-week plan.
- Cost per archetype-plus-intro generation ≈ $0.002; full LLM plan ≈ $0.045.
- Chat UI primitives reusable in onboarding: `chat-bubble.tsx`, `plan-preview.tsx`, `plan-calendar.tsx`, `plan-day-detail.tsx`, `approval-card.tsx`.
- Structured Outputs (`response_format: { type: "json_schema", strict: true }`) streams as text deltas, unlike tool calls.
- `httpAction` supports streamed `Response` / `ReadableStream`; `@convex-dev/auth` sets HTTP routes via `auth.addHttpRoutes(http)` in `convex/http.ts:8`.

**Monetization:**
- `hooks/use-purchases.ts:51` reads `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Fitbull Pro"`; `convex/subscriptions.ts:139` duplicates the string with a different env name (silent-failure risk).
- `RevenueCatUI.presentPaywall()` is called with **no arguments** from 3 sites (`app/onboarding.tsx:65`, `components/paywall.tsx:17`, `app/settings/index.tsx:103`); no `getOfferings()` or `getCurrentOfferingForPlacement()` exists anywhere.
- `stores/subscription-store.ts:4-21` has no `isInTrial`, `trialExpiresAt`, or `willAutoRenew` fields — 6-file refactor needed for any trial-aware UI.
- Apple IAP free trial requires card-on-file; no-card "trial" = app-local grace, invisible to RevenueCat.
- StoreKit intro offer types: free trial / pay-as-you-go / pay-up-front. Eligibility: one per subscription group per customer.
- Apple auto-equalizes pricing across 174 storefronts / 43 currencies from one base.
- RevenueCat paywall sequencing A/B: Welcome→Onboarding→Home→Paywall 2% | Welcome→Paywall→Onboarding 8% | Welcome→3-slide carousel→Paywall 15% trial opt-in.
- Hard paywall vs freemium: 12.11% vs 2.18% download-to-paid; 7× LTV per payer at high-price hard paywalls.
- Health & Fitness median trial-to-paid 39.9% / top-decile 68.3%; first-renewal retention 30.3%.
- Health & Fitness refund rate 4.71% (second only to Education 4.86%).
- Rootd: front-of-onboarding dismissible paywall = 5× revenue.
- Mural: post-onboarding checklist = +10% 1-week retention.
- Dollar Shave Club: conversational tone = +5.24% (stacked +17%).
- Headspace: multi-intent queries = +10% trial conversion.
- Houzz: one-question-per-screen = +15% conversion.
- Grammarly: personalized paywall copy = +10–20% upgrade rates.
- D3 race condition reproduces concretely: network fails between `presentPaywall()` returning purchased and `syncToServer` — paywall + spotlight overlay stack mutually undismissible.
- `docs/revenuecat-purchases-module-fix.md` workaround (`rnpModule.default ?? rnpModule`) is load-bearing.
- RevenueCat Experiments require Pro/Enterprise; up to 2 variants documented.
- `REVENUECAT_WEBHOOK_AUTH_TOKEN` absence silently kills purchase-recovery (Black-Hat D4).

**Compliance / Platform:**
- GDPR Art. 9(2)(a) requires unbundled, specific, informed, unambiguous, explicit, withdrawable consent for health data — a combined ToS checkbox cannot discharge this (🟢 EDPB 05/2020 §7.1).
- Norway's personopplysningsloven (LOV-2018-06-15-38) implements GDPR under EEA.
- Datatilsynet April 3 2025 guidance sharpened tracking-tool consent enforcement.
- Apple 5.1.3 + September 2025 Health & Fitness Apps Privacy Overview: HealthKit data may not be used for advertising, marketing, or tracking — **PostHog must never receive HealthKit-derived fields**.
- Apple 3.1.2(c): subscription title, duration, per-period price, cancellation info, Terms + Privacy links must appear before the purchase sheet in the storefront's language.
- Apple 5.1.1(v): account-delete required if account creation is offered (since 2022).
- Apple Hide My Email relays via `@privaterelay.appleid.com`, unique per developer team.
- App Privacy Nutrition Label mandatory; Health & Fitness category triggers the moment intake body-stats or HealthKit reads ship.
- Vipps MobilePay / Klarna / Swish / MobilePay / BankID / BankAxept cannot fund Apple IAP.
- CLDR: nb-NO, sv-SE, da-DK, fi-FI, is-IS all use comma as decimal separator + space/NBSP as digit-group separator.
- Iceland is priced in USD on iOS App Store (not ISK).
- EU DMA external-purchase entitlement (June 2025) applies DK/SE/FI but **not** NO/IS (EEA-not-EU).
- Norway DCSA: active notification every 6 months of active subscription required; commitment >6 months requires proportionate benefit.
- Norway Markedsføringsloven §22: annual-SKU discount anchoring scrutinized by Forbrukertilsynet.
- HealthKit authorization is granular per data type with separate read/write sets; `lib/healthkit.ts` is the only permitted import site.

**Measurement:**
- PostHog EU host: `https://eu.i.posthog.com` (Frankfurt). EU Cloud disables IP capture by default.
- Free tier: 1M events/mo, 2.5K mobile session recordings/mo.
- Session replay requires `posthog-react-native >= 3.2.0` + separate package, Android API 26+, iOS 13+, dev client (Expo Go unsupported).
- Default masking restrictive: all text/inputs/images masked; `secureTextEntry` auto-detected.
- `reset()` on logout strongly recommended; `identify()` auto-merges anonymous ID.
- Expo Router autocapture compatibility not documented in PostHog (🔴 G5).

**Repo-state facts:**
- Zero i18n infrastructure today (no `expo-localization`, no i18n library, no `locales/`).
- `app.json` has no `locales` map, no `CFBundleAllowMixedLocalizations`, English-only HealthKit `NSHealthShareUsageDescription`.
- Comma-decimal support lives in `components/workout/set-input.tsx` regex + replace only; not routed through `lib/format.ts` — regression risk.
- `lib/format.ts` has no locale awareness; hardcoded `kg`/`lbs`/`km`/`mi`/`h`/`m`/`s`.
- Mifflin-St Jeor calc at `app/calculator/calorie.tsx:63-68` requires typed numeric inputs; `handleCalculate` silently no-ops on NaN.
- `maestro` MCP wired in `.mcp.json`; Maestro CLI available for E2E.
- Spotlight tour (`lib/onboarding-steps.ts`, `providers/onboarding-provider.tsx`, three `components/onboarding/*`) is clean-deletable.
- `convex/schema.ts` already keys `planDays.dayOfWeek` 0–6 — training-days multi-select writes directly into it.

---

## Recommended Flow (Concrete Proposal)

Based on convergent findings and rotation results, ONE concrete flow. Gate decisions marked **[GATE]**.

### Entry state
- **[GATE D4] Sign-up first**, with Sign-in-with-Apple as primary if `@convex-dev/auth@0.0.90` supports the Apple provider (G1). Email/password fallback. Anonymous-first is V1.5 option.
- Privacy notice reachable before sign-up submit (Art. 13). Tappable Terms + Privacy.

### Intake shape (5 decision screens + 1 consent)
1. **Goal** — multi-select, 4 Nordic-calibrated cards.
2. **Experience** — single-select, 3 chips.
3. **Training days this week** — day-of-week multi-select (commitment moment).
4. **HealthKit primer + ask** — Fitbull-owned screen; on grant prefill + editable confirmation; on deny single-screen manual (age + sex + weight + height).
5. **GDPR Art. 9 consent + summary** — discrete screen, unbundled, specific purpose, audit-trail row.
6. *(no 6th screen)* — Equipment + injuries lazy-collected inside first AI chat (`chatActions.ts:491-495` already pattern).

### Value moment
- **S7 Narrated Analysis (3–6s)** with 3–5 Reanimated lines; `reduceMotion: system`. Plan selection in parallel via `ctx.scheduler.runAfter(0, ...)`.
- **[GATE D5] S8 Plan card** — **archetype-picked** (8-plan bundled library) + **LLM 1–3 sentence intro**. Editable intake chips. Methodology link at footer (Lindy Line, citations verified).

### Paywall placement + trial strategy
- **[GATE D1] Soft paywall immediately after aha card**, as sheet with plan card visible behind.
- **[GATE D2] StoreKit free trial** as V1 offer (7-day or 14-day per RC Offering config). Annual SKU with trial; monthly without. 48h-before-charge *email* (not push — Stakeholder §09 + Black-Hat-reviews-Yellow-Hat §1).
- App-local grace primitive built (state machine + cron) but not exposed in default flow; V1.5 infrastructure.
- **[GATE D9] V1 ships RevenueCat default chrome + lightweight interstitial** carrying 3.1.2 disclosure, Non-Promise Pledge, methodology link. **V1.1: custom `<NativePaywall>`** as the hidden-asset compounder.

### Trust elements
- **[GATE D6] Lindy Line** on methodology page (linked from aha card) — Borg/Tuchscherer RPE (1970+), Schoenfeld progressive overload, Mifflin-St Jeor (BMR/TDEE only, *not* cited for training plan). Citations verified before ship (G8).
- **Non-Promise Pledge** on paywall interstitial, revised per Black-Hat-reviews-Yellow-Hat: drop push requirement, substitute email. Four items, each gated on coded implementation (copy ships last).
- **Data residency & deletion card** linked from paywall: honest Convex/AWS region disclosure; Art. 20 export + Art. 17 delete shipped in Settings (Apple 5.1.1(v)).
- **No:** Founder's Open Letter V1 (voice collision per C6); paid credentialed reviewer on paywall (Apple 5.1 + Markedsføringsloven §3 risk); "you're the Nth user" counter (threshold problem).
- **Yes (small add):** Skeptic side-door at S1 — subtle "experienced lifter? skip to the app" link, reasonable defaults, routes to log screen. Serves Hevy/Strong power-user segment per Scout §B8.

### Nordic localization strategy for 1A
- **V1:** English UI (Strava-dry register, not gym-bro). Paywall screen localized per storefront (Apple 3.1.2) — Norwegian for NO, Swedish for SE, Danish for DK, Finnish for FI, (English/USD for IS). NOK/SEK/DKK/EUR pricing with comma decimals. Honest Privacy Nutrition Labels. Apple 5.1.1(v) account-delete + Art. 20 data-export in Settings.
- **V1 NOT shipped:** full UI i18n, DMA external-purchase, BankID, Vipps-on-paywall, FI/IS translations.
- **V1.1+:** Bokmål UI translation (SV/DA later; FI/IS v2).

### Measurement (PostHog)
- EU host (`eu.i.posthog.com`). **Funnel-first event schema** as a TypeScript literal union in `lib/analytics-events.ts`; `track()` generic-constrained by the union so renames can't compile-pass.
- Events from gates: `intake_started → goal_set → experience_set → days_set → healthkit_primer_shown → healthkit_granted/denied (with granted_scopes[]) → manual_stats_complete → consent_granted → plan_generation_started → plan_first_byte → plan_visible → plan_continue_tapped → paywall_presented (with placement_id) → trial_started (dedupe against RC webhook) → paid_converted → activation_gate_{name}` for D1/D7.
- **Rage-quit hook** (`hooks/use-rage-quit-tracking.ts`): `AppState` background within 3s of screen mount = `rage_quit_<screen>` (Green-Hat 2.2).
- **Forward-only firing**; no `onUnmount` completion events. Drop-off computed as `users(step_{n+1}) / users(step_n)` in PostHog (Green-Hat 2.3).
- **Session replay 100% for first 50 real users**, manually watched before scaling events (Green-Hat 2.6 — the non-obvious prevention).
- **No autocapture on sensitive screens** (goal, consent, manual-stats); explicit `captureScreens: false` at those routes.
- **Server-side events from Convex actions** via `posthog-node` with `captureImmediate()`, `flushAt: 1`, `flushInterval: 0`, `await client.shutdown()`.
- **Canary Walker**: Maestro flow weekly from CI compares observed counts to invariants; divergence emails Sebastian (Green-Hat 2.5).
- **PostHog event firewall**: HealthKit-derived fields never sent (Apple 5.1.3). Enforce in `lib/analytics.ts` wrapper.
- **Pre-ship checklist**: Network Link Conditioner "3G slow" + A14 device (iPhone 12) — the Pre-mortem's lesson #5.

### Accessibility + HealthKit-denial-aware symmetry
- `accessibilityLabel` + `accessibilityRole` on every interactive; 44×44pt minimum.
- Dynamic Type: theme tokens only; no hardcoded font sizes.
- Reduce Motion respected on narrated analysis, chip animations, paywall sheet.
- VoiceOver: Fitbull HealthKit primer readable linearly.
- `dataSource: "healthkit" | "manual"` passed through plan-selection / narration; manual cohort plan is *not* visibly worse (same archetype library; LLM narration references typed values with equal warmth).
- Comma-decimal validated through `lib/format.ts` (extend; commit `2629ff8` is the regression guard).

### Schema additions (minimal, reversible)

```ts
// convex/schema.ts additions
userProfile: defineTable({
  userId: v.id("users"),
  goals: v.array(v.string()),
  primaryGoal: v.string(),
  experience: v.union(v.literal("beginner"), v.literal("returning"), v.literal("experienced")),
  trainingDaysOfWeek: v.array(v.number()), // 0-6
  ageYears: v.optional(v.number()),
  biologicalSex: v.optional(v.union(v.literal("male"), v.literal("female"))),
  weightKg: v.optional(v.number()),
  heightCm: v.optional(v.number()),
  dataSource: v.union(v.literal("healthkit"), v.literal("manual"), v.literal("mixed")),
  archetypeKey: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
}).index("by_user", ["userId"]),

userConsents: defineTable({
  userId: v.id("users"),
  purpose: v.string(), // "health_data_personalization" | "ai_coach_inference" | "analytics" | "marketing"
  granted: v.boolean(),
  version: v.string(), // copy version hash for audit
  grantedAt: v.string(),
}).index("by_user", ["userId"]).index("by_user_purpose", ["userId", "purpose"]),

// Extend userSubscriptions toward typed status machine:
// status: "free" | "trial" | "pro" | "grace" | "lapsed"
// source: "rc_intro" | "app_local" | "rc_paid" | null
// trialExpiresAt, willAutoRenew, lastVerifiedAt
```

`completeOnboarding` mutation rewritten to accept the intake payload and write `userProfile` + `userConsents` atomically.

---

## Decisions Required at Gate

Before `/prism-plan` can produce an actionable plan:

### D1. Paywall placement — before vs. after aha
- **Options:** (A) After aha card; (B) Before aha as carousel→paywall (RC 15%); (C) Front-of-onboarding dismissible (Rootd 5×)
- **Trade-offs:** (A) highest ceiling per Cal AI H&F top-decile + 3.1.2 bait-and-switch risk; (B) floor-safe but loses Grammarly personalized-copy lift; (C) brand risk for premium positioning
- **Recommendation:** (A) with archetype plans (dissolves screenshot-and-run) + disclosure-line on last intake screen. **Confidence: Medium-High.**

### D2. Trial strategy — StoreKit vs. app-local grace vs. both
- **Options:** (A) StoreKit card-on-file; (B) App-local 7-day grace; (C) Ship both — StoreKit default, app-local as V1.5 primitive
- **Trade-offs:** (A) RC-native analytics, Nordic compliance easier, 4.71% refund risk; (B) "try before buy" resonates Nordic but OpenAI cost blowout + cohort-selects-for-non-payers; (C) adds state machine now, uses app-local sparingly
- **Recommendation:** (C). **Confidence: Medium-High.**

### D3. Intake depth — 3 vs. 5 vs. 7 screens
- **Options:** (A) Naive's 3-question ceremony; (B) 5 decision screens + consent; (C) 7+ (Cal-AI-adjacent)
- **Trade-offs:** (A) breaks carousel + GDPR audit + Mifflin-St Jeor; (B) carousel works, GDPR clean, ~90s median; (C) psychographic theater lift + Jantelov risk
- **Recommendation:** (B). Equipment + injuries lazy in first AI chat. **Confidence: High.**

### D4. Auth timing — sign-up first vs. anonymous-first
- **Options:** (A) Sign-up first with SIWA primary; (B) Anonymous session, upgrade at paywall commit
- **Trade-offs:** (A) matches code, no custom callback, Art. 9 clean; (B) lower friction, plan-as-hostage, needs account-linking test, Pre-mortem flagged as failure mode if incomplete
- **Recommendation:** (A) with SIWA, pending G1. **Confidence: Medium.**

### D5. AI aha architecture — stream vs. structured vs. archetype+voice
- **Options:** (A) Tool-call streaming (DO NOT — Pre-mortem target); (B) Structured Outputs streaming text-deltas into skeleton; (C) Archetype-picked plan + LLM intro caption
- **Trade-offs:** (A) 16.4s p95 blank LTE; (B) works but keeps LLM-authored plans (denial quality fragile, +$0.045/user, new schema/parser); (C) $0.002/user, deterministic, LTE-safe, Nordic-native
- **Recommendation:** (C). Authoring 8–12 archetypes is small; pattern compounds. **Confidence: Medium-High.**

### D6. Social-proof voice — founder letter vs. Lindy
- **Options:** (A) Founder's Open Letter on paywall + interstitial; (B) Lindy Line + methodology page + Non-Promise Pledge; (C) Both
- **Trade-offs:** (A) compounds retention + referral, legal review + SLA, single-POF; (B) survives Apple 5.1 + founder turnover + Jantelov; (C) voice collision
- **Recommendation:** (B) V1; founder letter as later non-colliding surface. **Confidence: Medium.**

### D7. Analytics — PostHog now vs. defer
- **Options:** (A) Ship at launch with funnel-first; (B) Defer 2 weeks, RC events only
- **Trade-offs:** (A) data from day 1, privacy label adds Analytics/Device ID, consent covers; (B) cleaner label, first 2 weeks blind (Pre-mortem failure)
- **Recommendation:** (A). **Confidence: High.**

### D8. Number of archetype plans to bundle (N)
- **Options:** (A) 8 (2 goals × 2 days × 2 equipment); (B) 12; (C) 20 (Green-Hat full spec)
- **Trade-offs:** author effort scales linearly; coverage gaps → approximate matches
- **Recommendation:** (A) V1; grow based on conversion data. **Confidence: Low — author-and-test.**

### D9. Custom `<NativePaywall>` in V1 vs. V1.1
- **Options:** (A) V1 RC default chrome; (B) V1 custom paywall; (C) V1 RC chrome + lightweight interstitial
- **Trade-offs:** (A) defers compounder, 3.1.2 conspicuousness risk; (B) medium effort but personalized-copy lift; (C) pragmatic middle
- **Recommendation:** (C). Custom paywall V1.1. **Confidence: Medium.**

### D10. Subscription state-machine refactor — V1 or V1.1?
- **Options:** (A) V1 prerequisite (enables trial UI, Nordic cron, grace primitive); (B) V1.1
- **Trade-offs:** (A) 6-file refactor + cron now; (B) accept D3 bug class risk, "trial ends in 3 days" copy blocked
- **Recommendation:** (A). Yellow-Hat-reviews-Black-Hat's highest-leverage prerequisite. **Confidence: Medium-High.**

---

## Confidence-Weighted Recommendation

**Proceed to `/prism-plan`**, with the following discipline:

1. **Resolve gate decisions D1–D10 first.** D3/D7/D10 High-confidence; D2 and D9 Medium-High; D1, D5 need explicit sign-off because they reshape architecture; D6 is brand preference; D4 depends on G1 (cheap to resolve first).
2. **Close G1 (SIWA), G6 (HealthKit set), G7 (HealthKit→OpenAI forwarding) before planning copy.** All cheap file reads. They change no architecture but shape user-facing copy and consent scope.
3. **Treat Pre-mortem's three root causes as plan-level constraints, not tickets:**
   - Measurement funnel-first and real-device-tested;
   - LTE + iPhone 12 + HealthKit-denied cohort is the design center;
   - The fallback is the product.
4. **Do not expand scope.** Temptation at plan time: add a 6th screen ("equipment"), founder letter, full Bokmål translation. Rotations are unanimous — each is red-herring or second-order. The minimum-form hybrid is the shape.
5. **Enforce sequencing discipline:**
   - (a) D3 race fix + entitlement literal-union + onboarding-status hook (cheap unlocks)
   - (b) Schema migration (`userProfile`, `userConsents`) + `completeOnboarding` rewrite
   - (c) Subscription state machine (D10)
   - (d) PostHog wiring with funnel events + rage-quit hook + EU host
   - (e) Intake screens S1–S6 + HealthKit primer + GDPR consent
   - (f) Archetype library authoring (N=8)
   - (g) Narrated Analysis + aha card + editable chips
   - (h) Paywall interstitial + Non-Promise Pledge + methodology page
   - (i) Post-paywall Mural checklist
   - (j) Pre-ship: Network Link Conditioner test on A14 device; Maestro canary; session-replay watch session.
6. **The single most non-obvious prevention is session-replay-first event design.** Watch 50 real sessions before authoring new events; derive events from behavior. Name as a discipline in the plan.

**Return to `/prism-explore` only if:**
- Gate rejects archetype-plus-voice (D5=B) — need to deep-dive Structured Outputs implementation + partial JSON parser + Nordic LTE testing.
- G1 returns "no SIWA support" — anonymous-first gets re-explored more deeply.
- Team wants quantitative A/B design pre-launch — not recommended: pre-launch A/B at n=2 is noise (Black-Hat-Monetization D1).

**Scope adjustment discussion with user:** Confirm with Sebastian — (a) clean-delete spotlight tour per brief; (b) defer custom `<NativePaywall>` to V1.1; (c) archetype-plan authoring + subscription-state-machine refactor are in V1 scope; (d) English UI V1 with per-storefront paywall localization is the Nordic-first V1 interpretation.

---

## Session metrics context

Explore: 1,065,103 tokens / 433 tool uses / 5,176s
Rotate: 487,599 tokens / 91 tool uses / 2,212s

---

**Closing observation for the planner.** The three files that did the most diagnostic work — the AI-Aha Pre-mortem, the Black-Hat-Monetization critique, and the Pre-mortem-reviews-Green-Hat synthesis — converged on the same sentence in different words: *"the fallback is the product; measure the funnel not the screens; design for the denier."* The plan that emerges from this synthesis is not the most ambitious version of the ideas surfaced — it is the version most likely to survive first contact with Oslo LTE, an A14 device, a 41% HealthKit-denial rate, and a Nordic consumer who has seen too many Cal-AI clones. The rotations rejected cleverness in favor of coherence. Keep that preserved through planning.

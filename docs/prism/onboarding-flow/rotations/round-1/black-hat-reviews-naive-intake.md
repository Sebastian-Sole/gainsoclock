# Black Hat reviews Naive — Intake UX

**Session:** `onboarding-flow`
**Perspective:** Black Hat (critical review, evidence-grounded)
**Target:** `research/intake-ux/naive.md` — argues the AI can do intake conversationally and we should ship a 3-question "commitment ceremony" instead of a structured form.
**Date:** 2026-04-21

Confidence tags: 🟢 verified (code / A/B number / official doc), 🟡 secondary, 🔴 unverified or speculative.

My job is to find the concrete breaks in the Naive proposal and translate them into a better plan — not a scarier one. The Naive is partly right. I'll say where, and I'll propose the minimum-form hybrid I can live with at the end.

---

## 1. Mifflin-St Jeor needs four numbers, and free-form chat doesn't guarantee them

🟢 `app/calculator/calorie.tsx:63-68` implements BMR as `10 * weightKg + 6.25 * heightCm - 5 * age + 5` (male) or `- 161` (female). `handleCalculate` (L131-136) does `parseInt(age, 10)`, `parseFloat(weight)`, `parseFloat(height)` and `if (isNaN(a) || isNaN(w) || isNaN(h)) return` — i.e., the button silently no-ops on missing or malformed input. The function takes a `Sex` union, not a free string.

The Naive proposes collecting age/sex/weight/height "inside the macro calculator, the first time the user taps it." That's a bait-and-switch: the user taps a "Calorie Calculator" card expecting the aha moment and instead gets a four-field form they thought they'd already done. In the chat variant, the AI extracts numbers from "around 30s" or "mid-seventies kilos" as conversational padding — and `parseFloat("around 75")` returns `NaN`. 🟢 (MDN/ECMA-262 — `parseFloat` stops at first invalid char, but "around 75" fails because the leading "around" makes the string yield `NaN`.)

**Consequence.** Macro targets ship as "—" for any user whose chat answer wasn't clean. Downstream `nutritionGoals` (`schema.ts:243-249`) stays blank, meal-log defaults break, and the "personalized plan + calorie target" aha carousel has nothing to put in the middle slide.

**Evidence of severity.** The RevenueCat whole-flow sequencing A/B in `white-hat/intake-ux.md §5` measured: Welcome → 3-slide carousel → Paywall → Onboarding = **15% trial opt-in** vs 2% for the carousel-less flow. The 7.5× lift is the carousel, and the carousel's middle slide is "here are your calories / your schedule / your plan." No numbers = no carousel = back to 2%. 🟢

**Cost to remediate in no-intake design.** Either (a) re-ask age/sex/weight/height at the calculator (double work, contradicts the Naive's own framing), or (b) post-hoc prompt the LLM to "please extract structured fields from the last 5 messages" with a `json_schema` response format — adding a second network round-trip and a silent-failure surface when extraction fails. Both are more expensive than a 3-field screen.

---

## 2. The plan tool (`create_workout_plan`) takes typed arguments — and is the chat gate

🟢 `convex/chatActions.ts:43-334` defines `TOOLS`. `create_workout_plan` requires `name`, `description`, `goal`, `durationWeeks`, `startDate`, `days[]` (week + dayOfWeek + templateName), and `templates[]` (full exercise arrays with types). The arguments come out as `JSON.parse(firstToolCall.arguments)` at `chatActions.ts:664` — no validator at the action boundary; the model is trusted to emit valid JSON. Validation happens later in `api.aiTools.executeApproval` when the user clicks Approve (`aiTools.ts:371-378`). Invalid args = silent rejection at approval time or a malformed plan card.

🟢 `internal.chatInternal.getUserContext` for an onboarding user returns empty `exercises`, `templates`, `recentLogs`, `exerciseHistory`, and `stats { totalWorkouts: 0 }` (verified in `white-hat/ai-aha.md §4`). The model is generating a plan with zero history to anchor it and whatever happened to be in the last three user turns — not a profile.

**Consequence.** With free-form chat intake, `durationWeeks` might get inferred from "a month or two" as 4, 6, or 8 depending on temperature. `days[].dayOfWeek` (0–6) depends on the model parsing "Monday, Wednesday, Friday ish" correctly. One bad emission and the approval card in `components/chat/plan-preview.tsx` renders garbage. With structured intake, `durationWeeks` and `daysPerWeek` are discrete fields passed in a prompt section the model can't miss.

**Cost to remediate.** Force the model into a `response_format: { type: "json_schema", ... }` mode — supported by GPT-5.2 🟡 (pricepertoken.com didn't say; structured outputs have been a Chat Completions feature since 2024-08). That works, but it's a second code path on top of the streaming tool-call pattern already in use. The Naive understates the engineering cost of "just let the AI ask."

---

## 3. "Three-slide carousel lifted trial 2% → 15%" — the carousel needs inputs the Naive doesn't guarantee

🟢 Scout §RevenueCat benchmarks, reproduced in `white-hat/intake-ux.md §5`:

- Welcome → Onboarding → Home → Paywall: **2%**
- Welcome → Paywall → Onboarding → Home: **8%**
- Welcome → 3-slide carousel → Paywall → Onboarding → Home: **15%**

The carousel is conventionally "your calories / your schedule / your plan" — it's a summary of intake. The Naive's 3-question ceremony (goal, experience, days) populates slide 3 (the plan) but can't fill slide 1 (calories: needs age, sex, weight, height). With two blank slides the carousel degrades to a single-slide handoff, and we're likely closer to the 8% cohort than 15%. Losing 7 points of trial opt-in on Nordic LTVs 🔴 (no EUR ARPU number in-repo) is the kind of loss you don't recover from with "lazy" collection.

The white-hat caveat still applies: the RevenueCat A/B didn't compare against Cal-AI-style personalized intake → paywall, so 15% isn't the ceiling. But it is the explicit baseline the no-intake variant underperforms.

---

## 4. PostHog funnel measurement needs discrete steps (and the orient locked PostHog)

🟢 `orient.md` header: "Analytics provider selected: PostHog." The entire measurement exploration (orient row #11) assumes a funnel we can instrument with discrete events.

In a form-based intake, you emit `onboarding_goal_answered`, `onboarding_experience_answered`, `onboarding_days_answered` — drop-off between any two events is a one-liner in PostHog's funnel tool. In a free-form chat, "when did the user bail" is ambiguous: after the goal question, during the clarification, while typing, or after the model's rewording of their answer. The Naive offers "emit structured PostHog events on chip selection" as the fix, which is fine — *but it means every chat branch the LLM might take needs event instrumentation around every chip*. The LLM decides the branches. The instrumentation can't.

**Consequence.** We ship with a funnel we can't split-test against, in a session whose explicit success criteria (brief lines 22-25) are "trial-start rate, paid conversion, D1/D7 activation." You can't optimize what you can't measure. 🟢

**Cost to remediate in no-intake design.** Force every model turn through a tool call that emits a typed event — doable, but requires the model to reliably call the event-emit tool on every turn (it won't — Opus/GPT-5.2 drop ~2-5% of tool calls under temperature in my experience 🔴 no repo-level measurement). Or: instrument chip-tap events only and accept funnel gaps when users type custom answers. The latter is what the Naive implicitly proposes — it silently abandons measurability for users who engage most deeply.

---

## 5. A/B testing a chat is a category-error compared to A/B testing a form

🟢 RevenueCat's placement/offering system (CLAUDE.md, brief line 72) is built around structured variant assignment at known trigger points. PostHog feature flags + experiments assume discrete variants with observable outcomes. A chat "variant" — slightly different system prompt, different suggested chips — is not a discrete variant in the statistical sense: the distribution of conversations under prompt A vs prompt B is high-variance and hard to power.

The Naive cites the Dollar Shave Club **conversational tone** win (scout §A2, +5.24% and +17% combined across two tests 🟢) as evidence that chat-style beats form-style. The white-hat notes the test was **within a structured form** — copy change, not structure change. That's a real category error. The DSC number does not support "replace form with chat"; it supports "rewrite form copy conversationally." Same goes for the Headspace multi-intent win (+10%, scout §A4 🟢) — that was multi-select *within a structured question*, not unstructured chat.

**Consequence.** Citing DSC and Headspace in support of chat-only intake is citing the wrong direction of the evidence. The evidence says "structured form, conversational voice." 🟢

---

## 6. HealthKit prefill needs named slots

🟢 `lib/healthkit.ts:95-120` (per white-hat references) implements `getLatestBodyWeight` returning a number. The pattern in the codebase is to *write* to named Convex fields — but today there are no such fields in `users` (`white-hat/auth-and-data §4` — zero profile fields). The intake-driven plan adds `weightKg`, `heightCm`, `age`, `sex` (or similar) to `userSettings` or a new `userProfile` table.

In a chat-only world, HealthKit's 82 kg reading has nowhere deterministic to land. We can't write "user's weight = HealthKit says 82" unless we have a slot. The Naive's proposal to collect body stats "lazily when a feature needs them" means HealthKit prefill runs at that moment — not at onboarding — and we lose the aha opportunity "we read your weight from Apple Health, here's your plan" which is the exact Nordic-friendly privacy-forward moment the orient (Nordic-first, GDPR-sensitive 🟢) wants.

**Consequence.** Without schema slots, HealthKit is decorative. With schema slots but no form, the user has to grant HealthKit without seeing any UI that justifies why — fewer grants, lower fidelity.

---

## 7. GDPR Article 9 consent cleanliness

🟢 GDPR Art. 9(1) classifies data concerning health as a special category; processing requires explicit consent under Art. 9(2)(a) (or another exception). "Explicit" is auditable — it means a discrete, informed, unambiguous yes/no from the user. The Nordic-first scope (orient lines 3, 15) makes this load-bearing.

A form-based intake screen titled "Help us personalize your plan — we'll use this for fitness and nutrition recommendations only" with a clear next-button is a textbook Art. 9(2)(a) moment. A chat that drifts into "what do you weigh?" mid-conversation is not. If the DPA audits and asks "show me the consent artifact," the form's PostHog event and the screen copy are the artifact. The chat transcript is a legal ambiguity. 🟢

**Consequence.** Nordic users live under aggressive DPAs (Datatilsynet in NO, Datainspektionen in SE, Datatilsynet in DK). An audit finding on health-data consent is a remediation project — not a UX tweak.

**Cost to remediate in chat-only.** Insert a discrete consent interstitial before the chat begins that says "the AI may ask you about weight, age, and health data — consent?" which is *exactly* a form screen. The Naive's design implicitly requires it, so the claim "no form" is rhetorical.

---

## 8. Nordic predictability preference

🔴 I can't cite a controlled A/B for Nordic-specific variance tolerance. But: the scout and white-hat evidence consistently shows structured multi-screen intake outperforming single-form in markets tested (Houzz +15%, scout §A3 🟢), and the governing principle "length isn't the enemy; emptiness is" (scout §B2 🟢) argues against reducing to 3 questions if the remaining questions visibly feed personalization. Nordic user psychology is adjacent to these markets; assuming a reverse effect would need evidence the Naive doesn't provide.

More pointedly: MacroFactor and Hevy/Strong (white-hat §8 🟢) both have short intake and are beloved by "experienced lifters who hate Noom-style onboarding." Nordic users split between the two audiences. A 3-question intake optimizes for the Hevy audience and underperforms for the Noom audience. Our brief doesn't pick a segment; the Naive implicitly does.

---

## 9. Apple review and 4.2 "minimum functionality"

🟡 App Review Guideline 4.2 ("minimum functionality") historically flags thin GPT wrappers. Several indie apps in 2024-2025 reported rejections for "app is primarily a chat interface to an LLM" 🟡 (Reddit / IndieHackers threads; no single authoritative Apple source). A chat-only onboarding screen with no structured UI is consistent with that pattern and could invite scrutiny.

Counter: Fitbull is not a thin wrapper — it has workout logging, meal tracking, HealthKit, plan generator. A chat onboarding doesn't make the app a chat app. So this is a 🟡 concern, not a 🟢 block. Worth raising in the PR but not decisive on its own.

---

## 10. The LLM asks non-uniform questions — profile data quality varies

🟢 `chatActions.ts:491-495` explicitly instructs: "For COMPLEX requests… Ask 2-3 targeted clarifying questions BEFORE generating anything. Ask about relevant factors *like* [list]." The word "like" is the operative word — the model picks which factors. For an articulate user the model asks about 1RM and equipment; for a beginner the model asks about "how many times a week do you like to move." The profile data that falls out is non-uniform.

**Downstream consequence.** 20% of users have `age = "around 30s"`, 30% have `age = null`, 50% have `age = 34`. Any Convex query or PostHog cohort that partitions on age fails for half the user base. The `workoutPlans.goal` field (`schema.ts:177`) becomes a free-text soup rather than an analyzable dimension.

**Cost to remediate.** A post-chat "normalize the profile" LLM pass. Which is a structured extraction step. Which costs an extra ~$0.01 per user and has its own silent-failure mode when extraction is wrong.

---

## Steelman: what if the AI is actually good at structured extraction?

The best defense of the Naive position: **GPT-5.2 with `response_format: { type: "json_schema" }` is demonstrably good at forced-structure output.** 🟡 (OpenAI structured outputs documentation, 2024-08 launch; no fresh benchmark for gpt-5.2 specifically fetched). In that world:

- Run the intake conversation freely (warmer, better conversion on DSC-tone grounds).
- At the end, do a single JSON-schema extraction call: `{ age: number, sex: "male" | "female" | "other", weightKg: number, heightCm: number, goal: string, daysPerWeek: number, experience: "beginner" | "intermediate" | "advanced" }`.
- Persist to Convex with deterministic slots, same as a form.

What breaks in my critique under this steelman:
- **#1 and #10** (macro calculator fields missing, profile non-uniformity) partially dissolve: the extraction step produces clean fields.
- **#2** (plan-tool args) partially dissolves: the extraction output becomes a structured prompt input.
- **#4** (PostHog funnel) partially dissolves: we can emit `onboarding_extraction_complete` with the extracted fields as properties.

What still doesn't dissolve:
- **#3** (carousel needs inputs *during* the session before the paywall): extraction only happens at end-of-intake, so carousel content still depends on the chat having actually surfaced the needed slots.
- **#5** (A/B testability): even with extraction, the variant space is "prompt A vs prompt B produces different conversation distributions," which is high-variance to power.
- **#6** (HealthKit prefill UX): prefill is most effective *before* the user types anything, not after extraction.
- **#7** (GDPR Art. 9): needs a discrete consent checkpoint regardless.
- **#9** (Apple review): cosmetic risk only; mostly orthogonal.

Steelmanned verdict: **extraction makes chat-first viable for data fidelity but doesn't save the carousel, the funnel testability, or the GDPR posture.**

---

## Where the Naive is right

1. **The current `users` table has zero profile fields** (🟢 `white-hat/auth-and-data §4`). Adding a 10-field form before we've added a schema is cart-before-horse. The Naive correctly inverts the assumption: start from "what does the downstream consume?" not "what does the intake produce?"
2. **The AI system prompt already asks clarifying questions.** Duplicating that in a static form is wasteful for the "generate me a plan" subset of users. The Naive correctly sees that a Cal-AI-style 28-step form is not our only option.
3. **The calorie-calculator inputs are single-consumer.** It's defensible to lazy-collect `sex` at the calorie calculator itself — *only* `sex`, because age/weight/height have other legitimate uses (carousel, plan generator prompt enrichment, HealthKit writebacks). 🟢
4. **Paywall-outside-onboarding is a legitimate question** the brief hasn't asked. Apple-style gated-feature paywall (paywall appears when user taps AI coach) is a real option. Strong does this. This isn't specifically an intake question, but the Naive is right to flag it.
5. **The "commitment ceremony" framing** is stronger than "data collection." Noom's 113 screens work partly because of the ritual (scout §B2 🟢). Branding intake as commitment, not paperwork, is correct.

---

## Synthesis: the minimum-form hybrid

**Goal: preserve the Naive's wins (less form fatigue, commitment framing, AI gets to shine) without the breaks above.**

Proposed intake, ordered, each on its own screen (one-question-per-screen A/B-validated at Houzz +15% 🟢):

1. **Goal (multi-select, Headspace pattern +10% 🟢)** — 4 Nordic-first cards (*Stronger, Leaner, Healthier, Back in a routine*). Stored as `string[]` with a `primary`. Feeds plan prompt + carousel slide 3.
2. **Experience (single-select, 3 chips)** — beginner / returning / experienced. Feeds plan prompt tone.
3. **Training days (day-of-week multi-select)** — this week's committed days. Stored as `number[]` (dayOfWeek 0-6). Feeds `planDays` directly and schema is already keyed this way (🟢 `schema.ts:193`). Acts as the commitment moment.
4. **HealthKit prompt (iOS only)** — "Read age/weight/height from Apple Health?" with Yes / Enter manually. On yes: prefill and move on. On no: single combined screen for age + sex + weight + height (Baymard warns against splitting memorized numerics 🟢).
5. **Consent + profile confirmation** — one screen: "Here's what we'll use: [goal], [days], [82 kg from Apple Health]. Consent to process this for personalization? [Continue]". Satisfies GDPR Art. 9(2)(a) as a discrete auditable artifact. 🟢
6. **Aha moment** — AI generates plan using structured fields as a prompt block. Plan card renders. **This is where the carousel's slides 1-3 come from** — calories (BMR × TDEE from fields 4), schedule (field 3), plan (AI output).
7. **Paywall (RevenueCat)** — standard placement post-aha.

Total: 5 decision screens + 1 aha + 1 paywall. **Far fewer than Cal AI's 28 or Noom's 113, on par with MacroFactor's "short quiz" and Future's "short quiz."** Still enough to fill the carousel, respect GDPR, A/B test discretely, and power the calorie calculator.

**Where the AI still shines:** the plan-generation step on screen 6 is a streaming chat-style render (existing `chat-bubble.tsx` + `plan-preview.tsx` components reused 🟢). Conversational tone lives in the *copy* of each intake screen (per-screen acknowledgement, Noom-style 🟢), not the *structure*.

**Where the lazy-collection idea survives:** `equipment` and `injuries` do not ship in this intake. They're lazy-collected inside the AI chat on the first "create a plan for me" request — the LLM's existing "ask 2-3 clarifying questions" behavior handles them. This saves 2-3 screens and matches the Naive's instinct that not every field needs a screen.

**Net outcome vs the Naive's 3-question ceremony:** two more discrete screens (HealthKit + confirmation consent), proper schema slots, carousel fully populated, funnel measurable, GDPR clean, Apple-review clean. The commitment-ceremony feel survives because the day-picker (#3) is still the behavioral hinge.

---

## Revised recommendation to the synthesizer

- **Adopt the Naive's framing** (intake = commitment, not data-grab) and **its skepticism toward large forms**.
- **Reject its "no form" conclusion** on carousel, funnel, GDPR, and calorie-calc grounds.
- **Ship 5 decision screens** (goal, experience, days, HealthKit + body stats, consent/confirm) + 1 AI aha + paywall. Equipment and injuries are lazy-collected inside the first AI plan request.
- **Force JSON-schema extraction as a backstop**, not a primary path, for any field the user answered in natural language via a chat-style chip-and-text input (e.g., a "what's your goal" free-text fallback).
- **Audit the carousel's three slides against the fields collected** before building it — if a slide has no input, cut it; don't ship blanks.

Word count ≈ 2100.

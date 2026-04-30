# Intake UX — Naive Explorer

**Perspective:** Naive / beginner's mind. Ten uncomfortable questions, steelmanned, with an opposite proposal where the team's assumption looks load-bearing but isn't.

**Setup before the challenges.** The most load-bearing fact I found isn't in the brief. The Convex schema (`convex/schema.ts`, lines 17–250) has **zero fields** for age, sex, weight, height, goal, experience, equipment, or days-per-week. The AI coach's system prompt (`convex/chatActions.ts:464-513`) receives exercise library, templates, recent logs, exercise history, stats, and active-plan info — but no biographical profile. Today, the app works without intake. The brief assumes we need to add one. That assumption is the whole game, and most of what follows attacks it. 🟢

---

## 1. "We need age/weight/height/sex to make a first plan."

**Steelman.** BMR requires them (Mifflin-St Jeor, `app/calculator/calorie.tsx:63-68`). TDEE drives macros; macros drive meal-log defaults. The brief's "aha moment" list includes macro targets (orient row 10).

**What actually breaks without them.** Only the calorie calculator. The AI coach infers training state from history (`chatActions.ts:484-486`). The plan generator takes a free-text `goal` and `durationWeeks` and that's it (`schema.ts:172-186`). Nutrition goals (`schema.ts:243-249`) are stored numbers, not derived — a user can set `2200 kcal` from a Noom-style range picker without ever telling us their weight. 🟢

**Naive take.** Age/sex/weight/height are a tax we pay for **one screen** — the macro calculator — and dietary style is already out of scope. We're collecting medical-ish PII up front to light a feature many users won't open on day one.

**Opposite proposal.** Collect height+weight+age **inside the macro calculator, the first time the user taps it**. Sex only if they open calorie calc (its only consumer). For the plan generator, pass the user's self-described goal string straight to the AI; it's already designed for that (`schema.ts:177`).

---

## 2. "HealthKit is a bonus; we'll ask for weight in the form."

**Steelman.** HealthKit permission is friction. Prefill still needs a manual fallback for denials. The form field is the safe baseline.

**Naive take.** iOS-only is non-negotiable (brief). On iOS, HealthKit *is* the source of truth for body stats for most of our Nordic target audience. `lib/healthkit.ts:95-120` already implements `getLatestBodyWeight`. We don't use it in onboarding because onboarding doesn't exist yet. 🟢

**Opposite proposal.** Flip the sequence: HealthKit prompt **first**, body-stat screen is a read-only confirmation ("We pulled 82 kg from Apple Health on Tuesday. Still right? / Change"). On denial, degrade to a single "weight today?" field. The brief flags timing as open (line 109); the naive answer is "prefill is default, typing is fallback," not the other way around.

---

## 3. "The AI is the selling point, so we need a good intake to personalize it."

**Steelman.** Without structured data, the AI answers from history. A brand-new user has no history. Cold-start is exactly when personalization matters most and the AI has the least to go on.

**Naive take.** The system prompt (`chatActions.ts:491-495`) already has explicit cold-start handling: *"For COMPLEX requests... Ask 2-3 targeted clarifying questions BEFORE generating anything."* The AI is already designed to ask about experience, equipment, frequency, goals, injuries, and time — conversationally. 🟢 We are about to build a static form that asks the *exact same questions* the LLM is already instructed to ask.

**Opposite proposal.** **The intake *is* the first chat.** Three fullscreen pseudo-messages from the coach ("What brings you here?" / "New to lifting, or returning?" / "When do you want to train?") with tap-to-answer chips plus typing fallback. The fourth screen is the plan the AI produces. No form at all. Savings: one less data model, one less schema migration, AI owns its own context. Cost: harder funnel instrumentation — fix by emitting structured PostHog events on chip selection.

---

## 4. "Primary goal is a clean dichotomy — build muscle vs. lose fat."

**Steelman.** The calorie calculator (`calculator/calorie.tsx:20-24`) codifies cut/maintain/bulk. Plans store a `goal` string (`schema.ts:177`). Noom, Cal AI, MacroFactor all open with goal dropdowns because they test well. Picking a goal is a commitment moment.

**Naive take.** Most beginners want "get in shape" — a shape they can't articulate in cut/maintain/bulk terms. Forcing a pick forces the first moment of friction onto a question they haven't formed. "Aesthetics" is culturally awkward in Nordic framing (see #9). The goal dropdown selects for users who already think in fitness-industry frames — not our largest growth segment. 🔴

**Opposite proposal.** Replace "what's your primary goal?" with **"what would a good year from now look like?"** — 4 vibe cards: *Stronger*, *Leaner*, *Healthier overall*, *Back in a routine*. Store the raw selection as `goal` string; the AI reads it and adapts. "Healthier overall" and "Back in a routine" don't map to cut/maintain/bulk — that's a feature. The calc has its own dropdown for when it's actually needed.

---

## 5. "Days-per-week is a core intake field."

**Steelman.** Programming needs frequency. A 3-day plan differs fundamentally from a 5-day. It's the one variable the plan generator can't guess cold.

**Naive take.** Every beginner ticks 5, does 2. We're not collecting a preference; we're collecting an aspiration, then building the plan on top of the lie. Six weeks later the user is behind schedule on a plan they misspecified, and churns. 🔴 speculative but familiar.

**Opposite proposal.** Ask *"pick the days you will actually train this week"* with a Mon/Tue/Wed calendar-style day picker. Behavioral framing ("this week", named days, committed slots) converts aspiration into a schedule. The plan generator maps `dayOfWeek` slots directly — the schema is already day-of-week keyed (`schema.ts:193`). 🟢 After week 1, swap intake for HealthKit activity + app history — `calculator/calorie.tsx:100-129` already computes weekly frequency from logs; we don't reuse it.

---

## 6. "Intake is data collection."

**Steelman.** The brief frames intake as "personalization intake" (line 85). Its job is to produce fields the AI, macro calculator, and plan generator consume (line 30). A data-collection frame is honest.

**Naive take.** The brief optimizes for trial-starts and D1/D7 activation (lines 22-25). Those metrics don't move with more accurate weight inputs. They move with *commitment* — a Cialdini-style consistency moment where the user invests identity. The data is a side-effect of a ritual, not the ritual itself. Noom's onboarding is 40+ questions long *because the ritual is the product*. Ours will be 10 questions and feel like a DMV form unless we reframe. 🔴

**Opposite proposal.** Intake is a **commitment ceremony** with data collection as byproduct. One required moment: "I commit to training on these days for the next 2 weeks." That becomes the aha step — and what PostHog measures as aspiration-to-commitment conversion.

---

## 7. "A long, personalized intake proves value before the paywall."

**Steelman.** The abtest.design "multi-intent queries" test and growth.design's Grammarly teardown both argue *the perception of being known* drives conversion. More questions → more known → higher willingness-to-pay.

**Naive take.** What drives conversion is the *appearance* of personalization, not the data's accuracy. Cal AI doesn't use most of what it asks. Noom's personality quiz doesn't meaningfully change the meal plan. We could ship a 12-question intake where only 4 answers influence output and nobody would notice. 🔴 We should be honest that we're running a theater of personalization — fine, but then *design the theater*; don't pretend we're building an expert system.

**Opposite proposal.** Keep the *perception* (rich questions, animated progress, "Analyzing your answers…") and cut what actually feeds downstream. **Three feeding questions** (goal, experience, days) do 95% of the personalization work. Six decorative questions ("how stressed are you?", single-chip lifestyle) are dialogue. Mark theater explicitly in the code so future maintainers don't mistake it for expert logic.

---

## 8. "The paywall belongs inside onboarding."

**Steelman.** RevenueCat is the primary monetization surface. Users are most engaged during onboarding. The current implementation (`app/onboarding.tsx:62-87`) puts "Choose Plan" as the terminal action. The brief inherits this.

**Naive take.** The current onboarding is *just* the paywall plus a feature list. It captures zero data, shows no value, and asks for money — precisely what the brief calls the problem. But the brief's solution keeps the paywall inside onboarding — just later. 🟢 The question nobody asked: **why is paywall *inside* onboarding at all?** For iOS-first Nordic users, Apple-style "free to try, paywall appears when you tap a gated feature" is credible. The AI coach is the gated feature, so the first tap on `/chat` is the paywall — not the close of a 10-minute form.

**Opposite proposal.** Onboarding ends on "log your first workout" or "run the AI once for free." Paywall triggers on second AI run, third meal log, or opening the plan generator. That's what Apple Fitness+, Strong, and Hevy do. The brief should explicitly ask whether paywall-in-onboarding is a *constraint* or an *assumption*. Orient treats it as open ("before vs. after plan preview"), but neither option is "outside onboarding entirely."

---

## 9. "'Optimize for aesthetics' works as a Nordic goal option."

**Steelman.** The fitness industry's vocabulary is global. Nordic users read English apps constantly. Cal AI ships in Norway with English framings and performs.

**Naive take.** Nordic users (1A primary, orient line 3) code-switch to modest framings in their own register. "Look good on the beach" becomes "feel good in my body" or "hike longer without getting tired." 🔴 No hard evidence in this codebase, but a pattern. US-calibrated goals — "get shredded," "sculpt," "build mass" — read tryhard in Swedish/Norwegian/Danish and *also* tryhard in English-to-Nordic reading. Doesn't kill the flow; chips at trust.

**Opposite proposal.** Nordic-first goal list: *Become stronger*, *Feel better daily*, *Get back in shape*, *Train for a goal (race, trip, event)*. Notice: no fat-loss in the top level — it lives under option 4. In Norwegian Bokmål / Swedish, "sterk/stark" (strong) reads culturally unmarked; "ripped" has no clean translation. Since the brief commits Nordic-first (orient), copy should be written in Norwegian first and translated to English, not the reverse. The brief doesn't mention this.

---

## 10. "Sign-up has to happen before intake because Convex needs a user."

**Steelman.** Every query in `convex/user.ts:13-43` calls `getAuthUserId(ctx)`. No auth = no writes. Current flow works.

**Naive take.** The brief itself flags this (lines 102-105); orient #1 rates it V5U1. The naive frame goes further: **even if anonymous auth exists, do we need server persistence during intake at all?** Answers can live in Zustand (`stores/onboarding-store.ts` already persists step state; add an intake slice) and flush to Convex once the user signs up at the end. The offline-first sync queue (`lib/convex-sync.ts`) already handles exactly this shape. 🟢

**Opposite proposal.** Sign-up is the **last** step. Entire intake → plan preview → "Save your plan" → sign-up → paywall. Trial-start conversion climbs because the user has invested 3 minutes of identity work before being asked to create an account. Apple ID / email is easier to give up once their plan is the hostage. Don't wait for anonymous-auth to land — use Zustand as the anonymous session.

---

## What's actually load-bearing vs. assumption

**Load-bearing (don't cut):**
- Some goal signal — the plan generator needs something to condition on.
- Some training-frequency signal — plans need days.
- Sign-up happens eventually (Convex identity, brief constraint).

**Assumptions masquerading as requirements:**
- Age/sex/weight/height in onboarding. Only calorie calc uses them. 🟢
- Form-based intake. The AI's own system prompt already does intake conversationally. 🟢
- Paywall *inside* onboarding. Apple-style gated-feature paywall is a better cultural fit.
- Intake as data collection. It's a commitment ceremony; data is the side-effect.
- US/industry goal vocabulary. Nordic-first means rewriting copy, not translating.
- Sign-up before intake. Zustand holds the session until the user commits.

## One-line naive recommendation

**Ship a 3-question commitment ceremony** (goal vibe card, experience chip, pick-your-training-days calendar), hand the answers to the AI as its first chat message, show the plan it produces, and make the paywall a gated-feature trigger on the *second* AI call — not the close of onboarding. Age, sex, weight, height, equipment detail get collected by the feature that actually needs them, when the user opens it. The brief assumes we need rich intake; the code says we don't.

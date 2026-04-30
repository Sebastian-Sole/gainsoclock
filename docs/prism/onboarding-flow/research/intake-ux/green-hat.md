# Green Hat — Intake UX: Alternative Flow Shapes

**Perspective:** Green Hat (generative / divergent)
**Session:** onboarding-flow
**Topic:** Intake UX — alternative flow shapes
**Date:** 2026-04-21

## Working constraints (verified, so the shapes stay honest)

- 🟢 `@convex-dev/auth` ships an `Anonymous` provider, but anonymous-to-email upgrade is a **custom account-linking implementation**. ([Convex Auth docs](https://labs.convex.dev/auth/config/anonymous))
- 🟢 True "no-credit-card" free trials are **not** offered by StoreKit; RevenueCat can only front what Apple offers. "Reverse paywall" means an app-local grace period, not a StoreKit trial. ([RevenueCat community](https://community.revenuecat.com/general-questions-7/can-my-ios-app-begin-a-free-trial-without-a-subscription-flow-5274))
- 🟢 `expo-speech-recognition` works in Expo dev-client builds in 2026 — voice intake is feasible, not fictional. ([repo](https://github.com/jamsch/expo-speech-recognition))
- 🟡 Cal AI's reported "answers influence price tier" is third-party reporting, not documented behavior. Pattern, not evidence.
- 🟢 (from code) `app/onboarding.tsx` is a single paywall card; `hooks/use-healthkit.ts` already exposes `getLatestBodyWeight`; the current flow captures zero personalization.

These flag when a shape costs real platform work vs. screen-and-copy.

---

## Shape 1 — Conversational AI-first ("the coach is the form")

**Flow**
1. Sign-up (or Sign in with Apple — Convex needs identity up front).
2. Chat screen opens pre-populated: "Hi — I'm your coach. Mind if I ask you 4 things?"
3. AI asks Q1: "What's the one outcome you'd feel proud of in 90 days?" User types. AI function-calls `save_profile_goal(text, parsedGoalType)`.
4. AI asks Q2 (days/week) with quick-reply chips as accessibility fallback.
5. AI asks Q3 (equipment) and Q4 (experience). Each answer is tool-called into `convex/user.ts`.
6. AI offers HealthKit import inline: "Want me to pull your stats from Apple Health?"
7. AI streams a personalized read, drops a Plan card into the chat.
8. Paywall sheet slides up anchored to the Plan card.

**Data:** goal (LLM-parsed from free text), days, equipment, experience, HealthKit stats. Age/sex deferred or from HealthKit.
**Paywall:** step 8, after the aha.
**Lever:** parasocial onboarding. Every answer is *spoken to someone*, not submitted to a database.
**Risk:** if the AI is slow (>3s) or misreads the function-call schema, the magic breaks. Q1 free-text parsing is the highest-risk node — "lose weight but mainly I want to stop feeling old" has to parse cleanly.
**Fit:**
- Nordic audience: **strong.** Nordic users prefer directness; a coach who asks four pointed questions and shuts up reads as respectful. Avoid the over-warm US chatbot tone.
- Pre-launch / 2 TestFlight: **medium.** No fake social proof needed — the coach *is* the proof.
- Expo/Convex: **good.** `convex/chatActions.ts` + `convex/aiTools.ts` already exist. The "form as chat" pattern is literally `tools: [save_profile_goal, save_training_frequency, ...]` wired into the existing action.

**Compounding benefit:** the first-conversation transcript is permanent context. Every future coach session can reference "you told me on day 1 you wanted to stop feeling old" — no other shape produces a quotable artifact from intake.

---

## Shape 2 — HealthKit-first ("I already know you")

**Flow**
1. Sign-up (Sign in with Apple aligns culturally with HealthKit).
2. Full-bleed: "Fitbull runs on your own data. Tap once to let me read from Apple Health." Single CTA, one secondary "I don't use Health."
3. HealthKit permission sheet. On grant: loading state with real data scrolling in ("weight 82.3 kg … last run 5.2 km … resting HR 58 …").
4. AI read: "You trained 11 times last month, mostly lifts + some zone-2. Resting HR suggests decent recovery. Three questions left."
5. Three remaining questions (only what HealthKit can't supply): goal, equipment, days.
6. Plan card populated with real numbers ("based on your 80 kg body weight…").
7. Paywall.

On denial: the same screen reshapes into a 6-question manual intake with a prominent "Connect Health later in Settings" callout.

**Data:** weight, height, sex, age, workout history, VO2Max, resting HR (HealthKit); goal, equipment, days (asked).
**Paywall:** step 7.
**Lever:** effort asymmetry. One tap, app appears to know them. The closest a fitness app gets to magic without deception.
**Risk:** HealthKit denial. If 30%+ tap "Don't Allow," the USP evaporates and the fallback feels second-class. Empty HealthKit (Android-switchers, new phone) gets a disappointing empty-state.
**Fit:**
- Nordic: **strong.** Nordics are privacy-sensitive but high-trust of platform-level data patterns (BankID lineage). "Your data stays on your device" resonates.
- Pre-launch: **good** — data IS the proof.
- Expo/Convex: **good** with one caveat. `@kingstinct/react-native-healthkit` is iOS-only, which *forces* iOS-only intake — aligns with session scope. `lib/healthkit.ts` already has `getLatestBodyWeight`; pattern extends cleanly.

**Compounding benefit:** if intake reads from Health, daily usage can too. The same permission grant powers a permanent passive-read channel — intake becomes the installation of a daily data pipeline, not a one-time form.

---

## Shape 3 — Goal-as-commitment ("one sentence, one promise")

**Flow**
1. Sign-up.
2. Black screen. Centered prompt: "In one sentence — what do you want to be true in 90 days?" Large text input, no placeholder gimmick.
3. User types (e.g., "I want to deadlift 180 kg and not be winded chasing my kid"). Submit.
4. AI parses into `{ primaryGoal, secondaryGoal, targetLift, targetWeight, motivationAnchor }`. Asks one clarifying Q: "Can you train 3+ days/week?"
5. AI responds: "OK. Here's the promise." A single card reads: "In 90 days, you deadlift 180 kg. I check in every Sunday. Miss two weeks, I redo the plan." User taps "I commit."
6. Commitment generates a lockscreen widget / shareable image with the goal.
7. Paywall framed as "unlock your 90 days."

**Data:** primary goal (LLM-parsed from user's own sentence), schedule (1 Q). Everything else deferred to first workout log.
**Paywall:** step 7, immediately after the commitment ceremony. Commitment-consistency bias.
**Lever:** public commitment + implementation intention (Gollwitzer, 1999). User's own words shown back as contract are harder to abandon than a generic plan.
**Risk:** LLM misreads the goal and produces a commitment that feels off. Users who can't articulate a 90-day goal (most people) freeze at step 2.
**Fit:**
- Nordic: **very strong.** Nordic motivation culture is internal, deed-based. "Tell me what you'll do, I'll hold you to it" is the tradition of `sisu`/`dugnad`. Most culturally native of the nine.
- Pre-launch: **strong** — no social proof needed; commitment is self-referential.
- Expo/Convex: **easy.** One screen + one LLM call via `chatActions.ts`. Widget is optional polish.

**Compounding benefit:** weekly check-ins have a user-written, falsifiable North Star. No other shape gives the coach a concrete promise to reference in every push notification ("3 weeks in — on pace for the deadlift?").

---

## Shape 4 — Past-workout-first ("show me your last rep")

**Flow**
1. Sign-up.
2. "Before I plan anything — walk me through the last workout you actually did. Even if it was 6 months ago." Free-form input, voice optional.
3. User types: "bench 3x8 @ 80kg, some lat pulldowns, gave up on legs."
4. AI parses into a structured `WorkoutLog` (via existing validators). Presents it as an editable card: "Is this right? Tap any row to fix."
5. User confirms. That log is saved as their *first entry*, backdated.
6. AI reads: "Bench is respectable, pulls solid, legs skipped. Plan starts there." Asks two remaining Qs (days/week, goal).
7. Plan anchored to the real exercises they already do.
8. Paywall.

**Data:** experience (revealed via parsed volumes), exercise preferences, real baseline lifts, goal + frequency (2 Qs). Body stats deferred to post-paywall HealthKit prompt.
**Paywall:** step 8.
**Lever:** sunk-cost + behavioral momentum. Logging is the hardest action in a fitness app; having done it once before any "real" ask means the user has already done the thing the app will require forever.
**Risk:** users with no recent workout history bounce or lie. Mid-journey returners (the most valuable segment) thrive. Needs a "never trained? Start here" alt-path at screen 2.
**Fit:**
- Nordic: **strong.** Selects for the "serious, not a beginner" positioning. Fluffier markets might resent it; this audience respects it.
- Pre-launch: **good** — your first logged workout is inherently personal proof.
- Expo/Convex: **good.** Reuses existing workout-log validators (`convex/validators.ts`). LLM parses free-text via one new tool in `convex/aiTools.ts`. Offline-first writes flow through `convex-sync` normally.

**Compounding benefit:** workout history graph starts at N=1 on day one. Every "you're progressing" chart works from install. No other shape produces a non-empty history on first launch.

---

## Shape 5 — Nordic-local anchoring ("short, because we respect your time")

**Flow**
1. Sign-up (Sign in with Apple prioritized).
2. Full-bleed, serif-ish Nordic typography: "Hi. I'm Fitbull. Built for people who train seriously and want their tools to shut up and work. This takes 90 seconds." Single Continue.
3. Three-column Dynamic-Type-safe layout, one toggle each: **Goal** (Strength / Physique / Performance), **Frequency** (2–3 / 4–5 / 6+), **Experience** (Beginner / Intermediate / Advanced). No avatars, no cartoon icons.
4. HealthKit connect OR manual three-field (weight / height / age).
5. AI-generated plan card with one sentence under each week. No emoji, no confetti.
6. Paywall framed as "One price. No tiers. No upsells."

**Data:** goal, frequency, experience (3 picks in 10 seconds), stats (HealthKit or 3 fields). Target: <90s from sign-in to plan preview.
**Paywall:** step 6, single tier.
**Lever:** scarcity of respect. Most fitness apps waste your time with dark patterns; this one doesn't. *Absence* of manipulation becomes positioning. Works because the Nordic audience has been over-marketed at by Cal AI clones.
**Risk:** you're deliberately shedding the psychological tactics (progress bars, streak pre-selling, fake scarcity) that *do* move conversion. Brand bet, not growth bet.
**Fit:**
- Nordic: **by definition, perfect.** The shape IS the localization.
- Pre-launch: **excellent.** Simple flows are easiest to instrument and polish with 2 TestFlight users.
- Expo/Convex: **easiest of any shape.** Three toggles + HealthKit + plan-gen call. ~3 days of work.

**Compounding benefit:** a brand position legible from the app icon outward. Every future design decision gets a rubric — "would a Cal AI clone do this? then don't." No other shape gives the product a compass.

---

## Shape 6 — Reverse paywall / value-before-price

**Flow**
1. Sign-up (or anonymous Convex session via `@convex-dev/auth` Anonymous provider, with "finish sign-up later" upgrade — see caveat).
2. Two-minute intake (minimal: goal + days + HealthKit).
3. Plan generated, user drops into (tabs). **No paywall seen.** Pro is fully unlocked for 7 days via an app-local entitlement flag (not a StoreKit trial).
4. Day 2–6: subtle signals — "Day 3 of 7 free" top banner, "Why Pro?" card inside chat tab.
5. Day 7 push: "Your week was strong. Keep going?" opens a paywall backed by the user's *own* last-7-days stats ("4 workouts · 12 chats · 3 plans").
6. Paywall is either (a) StoreKit real trial → paid, or (b) straight paid.

**Data:** minimal at intake (2–3 items). The real personalization source is 7 days of *lived* behavior.
**Paywall:** day 7, after value.
**Lever:** endowment effect. By day 7 users have a plan, logged workouts, and chat history — losing those is loss-aversion, not opportunity-cost.
**Risk:**
- Apple's "no-CC trial" isn't a StoreKit trial (verified). You're giving away Pro via app-local logic; 7 days produces $0 and burns OpenAI tokens. Budget it.
- Power users may game it (uninstall/reinstall). Tie entitlement to Convex user ID, not device.
- 7-day churn window is wide.

**Fit:**
- Nordic: **strong.** "Try before you buy" reads as honest.
- Pre-launch: **ideal.** With 2 TestFlight users you measure this end-to-end for free; only shape where the aha is *lived, not simulated*.
- Expo/Convex: **medium-hard.** Anonymous Convex is supported, but anonymous→email upgrade needs custom account-linking (verified). Entitlement logic belongs in `stores/subscription-store.ts` alongside the RevenueCat flag.

**Compounding benefit:** richest D0–D7 behavior dataset of any shape — PostHog funnels get *real* retention cohorts in month one without needing paying users. Fastest post-launch feedback loop.

---

## Shape 7 — Video-first ("founder's 30 seconds")

**Flow**
1. Sign-up.
2. Auto-playing vertical video (Sebastian, 30s, subtitled, reduced-motion respected): "Hi. I built this because every fitness app wastes your time. Here's what I want to know." Camera on face, not a Keynote deck.
3. Single question overlaid on the last 5s: "What's your goal right now?" — 3 chips.
4. HealthKit prompt framed: "I'll let the coach read your Health data. Your choice."
5. Plan preview.
6. Paywall.

**Data:** goal (1 chip) + HealthKit. Rest deferred to first chat session.
**Paywall:** step 6.
**Lever:** parasocial trust + face-to-face signal. Founder being *visible and accountable* is the highest-trust signal available pre-launch when there are no real reviews.
**Risk:**
- Video quality becomes the conversion rate. Bad video destroys brand. Iteration requires re-shooting.
- Autoplay accessibility — needs captions, reduced-motion bypass, skip-to-text.
- Users watch 4s and skip. The film converts the 10% who care, annoys the 90% who don't.

**Fit:**
- Nordic: **risky.** Nordic skepticism of overt personality marketing is real; the founder has to hit a specific non-salesy tone. Done right, gold. Done wrong, cringe.
- Pre-launch: **well-suited.** The video IS the pre-launch artifact; no testimonials required.
- Expo/Convex: **easy.** `expo-video` handles playback; Convex stores watch-completion events.

**Compounding benefit:** founder-video completion rate is the cleanest "who's my actual audience?" signal available. Every other shape conflates motivation with curiosity; the 30s video filters.

---

## Shape 8 — Gamified quiz ("You're a Volume Trainer")

**Flow**
1. Sign-up.
2. Quiz: 8–10 Qs, one per screen with progress bar. Some demographic, some behavioral. Each answer has a subtle scoring dimension (Volume vs. Intensity, Aesthetic vs. Performance).
3. "Analyzing…" transition (actually 2s, feels personalized).
4. Result screen with a big-type archetype: **"The Volume Trainer"** plus 4 lines of character description and a color palette the app subtly adopts.
5. Shareable card with the archetype, auto-generated PNG.
6. AI plan tailored to the archetype.
7. Paywall.

**Data:** ~10 dimensions (goal, frequency, experience, body stats split across screens, 2–3 psychographic Qs feeding the archetype).
**Paywall:** step 7.
**Lever:** Barnum effect + identity framing. "I'm a Volume Trainer" becomes a self-concept and then a reason to subscribe. Shareable cards are a free pre-launch acquisition loop.
**Risk:** kitsch. Can read as a BuzzFeed quiz and alienate the serious audience. High novelty first time, grating on re-engagement (reinstallers see the same quiz and find it hollow).
**Fit:**
- Nordic: **poor-to-medium.** Opposite of Shape 5. Archetype gimmick reads American. Could work if archetypes are austere ("Methodical / Explorer / Competitor") rather than cute ("The Beast Mode Beast").
- Pre-launch: **excellent for acquisition.** Shareable cards are the cheapest viral loop; Fitbull has zero install base to protect.
- Expo/Convex: **medium.** Quiz UI is simple; the PNG generation (`react-native-view-shot` + styled result view) is the new territory.

**Compounding benefit:** the archetype is a persistent personalization lens. "Volume Trainers get frequency reminders; Intensity Types get 1RM prompts." No other shape gives the coach a persistent *personality model* beyond raw stats.

---

## Shape 9 — Voice-first silent intake ("speak it once")

*My invented ninth — not on the prompt list.*

**Flow**
1. Sign-up.
2. Full-bleed pulsing microphone + one sentence: "Tell me about yourself. Anything — goals, what you've tried, what hurts, what time you have. Stop when you're done." No input fields visible.
3. User speaks for 20s–2min. Live captions appear as they speak (accessibility + social-proof of being heard).
4. On stop: transcript + AI-extracted structured profile slide in side-by-side: "Here's what I heard." Every extracted field is tappable to correct.
5. Gaps the monologue didn't cover (e.g. days/week) surface as quick-reply chips.
6. HealthKit prompt.
7. Plan preview.
8. Paywall.

**Data:** potentially everything the user mentions + gap-fill chips. Goal, history, injuries(!), time constraints, motivation — all in one pass.
**Paywall:** step 8.
**Lever:** highest-bandwidth intake possible. Speech is ~3x the throughput of typing, and users say things they wouldn't type ("my back has been dodgy since my second kid"). Voice also pre-commits users — speaking to an app is higher-involvement than tapping.
**Risk:**
- Mic permission is an extra platform ask.
- Users in public bounce ("can't talk right now"). Needs a prominent type-instead fallback.
- Speech errors + privacy perception. Needs explicit "processed on-device via Apple Speech, not uploaded" copy — which is half-true; if you use Whisper, it *is* uploaded. Pick one and be honest.
- Only works because LLM extraction from free-form transcripts is reliable in 2026; would've been science fiction 2 years ago.

**Fit:**
- Nordic: **medium.** Nordics are reserved about speaking aloud to devices; fewer use Siri than Americans. Could land as novel, could land as awkward.
- Pre-launch: **high-signal.** Voice onboarding is rare enough that it differentiates on the App Store screenshots alone.
- Expo/Convex: **medium.** `expo-speech-recognition` handles on-device STT on iOS (verified). Whisper via Convex action is the cloud fallback. New permission + new module, but not a rewrite.

**Compounding benefit:** raw audio (or transcript) becomes a permanent "how this user actually talks" reference for the AI coach's tone calibration. Every other shape produces structured data *about* the user; only this one produces an artifact of the user's *voice*, which the coach can mirror. No other shape does that.

---

## Non-obvious second-order effects (best shape per category)

**Best form-based shape: Shape 5 (Nordic-local anchoring).**
Second-order effect no other shape enables: a **permanent brand rubric for shipping decisions**. If intake is "respect your time, three picks, no manipulation," every subsequent feature (notifications, paywall reminders, post-workout modals) inherits the constraint. Onboarding stops being a funnel and becomes a product-design filter that rejects dark patterns at the PR-review stage. Downstream feature: *an anti-dark-pattern internal lint* — copy reviewers have a written standard to point at.

**Best AI-first shape: Shape 1 (Conversational intake).**
Second-order effect no other shape enables: **the first conversation becomes quotable, reusable context**. The AI coach can literally quote the user's own words six months later ("you told me on day 1 you wanted to stop feeling old — you just PR'd your deadlift"). This unlocks a retention mechanic — *self-referential narrative* — that plan-card shapes cannot produce because they compress the user into structured fields. Downstream feature: a "your first message" widget / year-in-review moment that's emotionally load-bearing.

**Best stats-first shape: Shape 2 (HealthKit-first).**
Second-order effect no other shape enables: **installing a persistent passive data read-channel at the high-intent moment**. Intake isn't a one-time form; it's when HealthKit permission is granted. That same permission powers daily passive summaries, automated deload detection from resting HR, and workout auto-logging — none of which any other shape bootstraps. Downstream feature: *ambient coaching* (the app notices you did an unlogged run and adapts without being asked), which competitors without HealthKit-first intake can't ship even if they want to, because they never asked for the permission at the high-intent moment.

---

## Sources

- [Convex Auth — Anonymous provider](https://labs.convex.dev/auth/config/anonymous)
- [RevenueCat community — free trial without subscription](https://community.revenuecat.com/general-questions-7/can-my-ios-app-begin-a-free-trial-without-a-subscription-flow-5274)
- [Cal AI iOS onboarding flow (Mobbin)](https://mobbin.com/explore/flows/579da5dd-453a-4e7c-9c11-d20708a4db82)
- [expo-speech-recognition (GitHub)](https://github.com/jamsch/expo-speech-recognition)

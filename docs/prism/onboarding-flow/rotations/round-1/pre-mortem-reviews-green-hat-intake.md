# Pre-mortem Reviews — Green Hat's 9 Intake Flow Shapes

**Perspective:** Pre-mortem (imagined October 2026 retrospective)
**Session:** `onboarding-flow`
**Reviewing:** `docs/prism/onboarding-flow/research/intake-ux/green-hat.md`
**Date authored:** 2026-04-21 (but written from October 2026 vantage)

Nine failure narratives. In each, assume we shipped the shape on **2026-07-14**, the same date the AI-aha pre-mortem uses. PostHog is the analytics layer (wired in `lib/analytics.ts`), Convex is the only backend, RevenueCat the paywall, and our Nordic-first cohort is the one whose reviews land in App Store Connect first.

---

## Shape 1 — Conversational AI-first ("the coach is the form")

**What we shipped:** `app/onboarding/chat.tsx` opens immediately after sign-up. The coach greets the user and streams through 4 questions, each bound to a tool call in `convex/aiTools.ts` — `save_profile_goal`, `save_training_frequency`, `save_equipment`, `save_experience`. Intake ends with an inline HealthKit prompt and a plan card rendered as an assistant message.

**Week 1 — first sign of trouble.** On 2026-07-17, a TestFlight veteran in Bergen messaged Sebastian: "I tapped sign up, then the screen said 'Hi — I'm your coach' and then nothing for 11 seconds. I backed out." The culprit was the same one from the AI-aha pre-mortem: `convex/chatActions.ts::sendMessage` buffers tool-call argument deltas until stream end. The first message used a `save_profile_greeting` tool call, so the "Hi — I'm your coach. Mind if I ask you 4 things?" text never streamed — it appeared all at once after OpenAI finished accumulating the tool arguments. Nordic LTE p95 of 15.2s to first visible message.

**PostHog lied.** We'd added `chat_message_received` (fires when `useQuery(api.chat.listMessages)` returns a new row). It fired at 2,610 events in week 1 against 3,100 `onboarding_chat_opened`, suggesting 84% saw the first message — which we took as fine. What we missed: 38% of those events fired *after the user had already navigated away*, because Convex reactive queries keep running until unmount. Users who'd force-quit in the wait still counted as "received".

**App Store.** 1-star by `HaraldK`, 2026-07-29: *"Signed up and got dropped into a chat with a frozen AI. No buttons, no skip, no way to just see the app. Deleted."* 1-star by `osloLift`, 2026-08-03: *"The AI asked what I wanted to be 'proud of'. I'm not doing therapy with a workout app."*

**Refunds.** Irrelevant — paid conversion collapsed to 1.8%. 73% of sessions terminated inside `app/onboarding/chat.tsx` before the paywall ever mounted. Nothing to refund.

**Root cause.** The shape's whole value is parasociality, and parasociality dies if the first reply is late. We'd assumed `chatActions.ts` streamed nicely because our dev-client chat *looks* smooth on wifi. It doesn't stream tool-call-heavy turns. Also: free-text parsing on Q1 ("what outcome in 90 days") failed for ~28% of responses — users wrote "idk, just be fitter I guess" and the LLM dutifully saved `primaryGoal: "general_fitness"`, losing all signal. The "quotable first conversation" compounding benefit evaporated because 40% of first conversations were either empty or vapid.

---

## Shape 2 — HealthKit-first ("I already know you")

**What we shipped:** `app/onboarding/healthkit-first.tsx` as screen 1 after sign-up. Full-bleed copy, one CTA that calls `requestAuthorization` via `lib/healthkit.ts`. Denial branch routes to `app/onboarding/manual-intake.tsx`.

**Week 1 — first sign of trouble.** On 2026-07-18, our PostHog `healthkit_permission_requested` vs `healthkit_permission_granted` funnel showed a 59% grant rate — which we'd already learned from the AI-aha pre-mortem. What we *hadn't* planned for: 41% falling into `manual-intake.tsx`, a screen we'd built in two afternoons and never usability-tested because it was "the fallback". It had 6 unstyled `<Input>` components in a `<ScrollView>`, no progress indicator, no field validation for comma decimals (regression of commit `2629ff8`), and `sex` as a `<Select>` with three options: Male / Female / Prefer not to say — which broke `buildStarterPlanPrompt` when the third option was chosen because the prompt didn't handle undefined sex.

**PostHog lied.** `onboarding_completed` fired at 71%, which looked healthy. But segmented by HealthKit grant status, the numbers were 88% (granted) vs 47% (denied). We ran averages the first two weeks because the segmentation chart in PostHog wasn't saved to the launch dashboard. The denial cohort was quietly dying.

**App Store.** 2-star by `mia_87` (same reviewer as the AI-aha pre-mortem's wave — they really are upset): *"Why does a workout app need to read everything in Apple Health before I can even look at it."* 1-star by `SkiNorr`, 2026-08-11: *"Said no to Apple Health, then got a broken form with a dropdown that made my keyboard disappear."*

**Refunds.** Refund rate hit 14% in month 2 — unusually high. Root: users who *did* grant HealthKit got plans personalized to empty HealthKit data (Android-switchers, new phones, users who'd never logged a workout in Health). The "82.3 kg, last run 5.2 km, resting HR 58" showcase state from the Green Hat flow was fantasy for 31% of granters; they got "— kg, no recent workouts, resting HR unknown" and a plan indistinguishable from the denial cohort's.

**Root cause.** The Green Hat's "effort asymmetry" lever only fires when HealthKit is both (a) granted and (b) populated. That's a conditional product — we treated it as unconditional. The shape inherits 41% of the AI-aha pre-mortem's denial failure and adds a new empty-HealthKit failure mode that didn't exist when the intake was manual.

---

## Shape 3 — Goal-as-commitment ("one sentence, one promise")

**What we shipped:** `app/onboarding/commitment.tsx` — black screen, one `<TextInput>`, submit to `api.onboardingActions.parseCommitment`, which calls OpenAI with a `parse_goal` tool returning `{ primaryGoal, targetLift, targetWeight, motivationAnchor, timeline }`. The AI replies with a formatted contract card, user taps "I commit", goes to paywall.

**Week 1 — first sign of trouble.** On 2026-07-16, the first public user typed: *"I want to be less fat"*. The LLM parsed it as `primaryGoal: "weight_loss"`, `targetWeight: null`, `motivationAnchor: "appearance"`. The commitment card read: *"In 90 days, you lose weight. I check in every Sunday."* The user was actually looking for body recomposition — they'd said "fat" meaning "soft" — and the flat, medicalized weight-loss framing (showing BMI estimates from a weight they hadn't yet given us, because our prompt speculated) felt insulting. They uninstalled. We know because Sebastian was watching the PostHog session recording at 3:20 AM.

**PostHog lied.** `commitment_submitted` fired at 81% of screen views, suggesting the primary intake mechanic worked. But we hadn't instrumented `commitment_edited` (the "fix this" affordance) — because there wasn't one. Users either accepted the LLM's reading or abandoned. The 19% drop-off on the screen was real; what we missed is that ~35% of the 81% who "submitted" were abandoning *during* the commitment review card, which mounted on the same screen. Our screen-view event didn't distinguish.

**App Store.** 1-star, `KåreS`, 2026-08-02: *"I wrote one sentence about wanting to run a half marathon, and the app told me my promise was to 'lose weight by summer'. How did it get that so wrong."* 1-star, `fridaBergen`, 2026-08-14: *"Felt like writing my goals in a diary that then got read wrong by a stranger."* 2-star, `SisuM`, 2026-08-19: *"Too much ceremony. Just let me log a workout."*

**Refunds.** Paid conversion was 2.1% — worse than the AI-first shape. The commitment card does trigger consistency bias when it lands, but when the LLM misreads, the bias works *against* us: users feel unheard.

**Root cause.** We overestimated the average user's ability to articulate a 90-day goal. The Green Hat noted "users who can't articulate a 90-day goal (most people) freeze at step 2" as a risk and we shipped anyway with a single free-text box. The `parseCommitment` action had no confidence threshold — it always returned *something*, never "I didn't understand, can you rephrase?" — so confident misreads outnumbered humble fallbacks. The cultural fit argument (`sisu`/`dugnad`) only works if the promise is the user's actual promise, not an LLM's hallucination of it.

---

## Shape 4 — Past-workout-first ("show me your last rep")

**What we shipped:** `app/onboarding/first-log.tsx` — free-form text box, voice optional (via `expo-speech-recognition`). Parsed by `api.onboardingActions.parseWorkoutLog` using the existing `convex/validators.ts` workout-log validators. Saved as a real `WorkoutLog` row, backdated.

**Week 1 — first sign of trouble.** Our cohort skewed more beginner than Green Hat assumed. On 2026-07-15, PostHog showed a screen-view-to-submit rate of 34% on `first-log.tsx` — nearly two-thirds of users sat on that screen and bounced. The "never trained? Start here" alt-path we'd tacked on at the last minute (`components/onboarding/never-trained-modal.tsx`) required a *second* tap on a small "I've never worked out" link at the bottom of the screen. It was 10pt text and gray. Accessibility failure (44pt target) and invisibility combined.

**PostHog lied.** We instrumented `workout_log_parsed` (fires on successful parse). That was at 89% of submits — the LLM *was* parsing free text fine. What we didn't measure: how many users typed garbage to escape the screen. Looking at the logs in week 4, 18% of "successful" first workouts were things like "squat 1x1 5kg" (users writing a single token to move on) or "test test" (parsed as "unknown exercise, 1 set, 1 rep"). Those entries then polluted their history graph — violating the compounding benefit of "non-empty history on first launch" by making the history embarrassingly wrong.

**App Store.** 1-star, `MilaN`, 2026-07-31: *"I've never lifted and this app refused to continue until I 'logged my last workout'. I don't have one. That's why I'm downloading a fitness app."* 2-star, `arniB`, 2026-08-05: *"Told it my last workout was bench press 3x8 80kg. It gave me a plan with bench press 3x8 80kg. Why did I pay for this."*

**Refunds.** Refund rate was 11% in month 2 — driven almost entirely by the `arniB` pattern. Users whose "log" was sufficient to anchor a plan got a plan that looked identical to the log. The Green Hat's "anchor to the real exercises they already do" became "we couldn't think of anything to add".

**Root cause.** The shape selects beautifully for one segment (mid-journey returners, ~20% of our install base) and brutally filters out beginners (the other ~55%). The self-serving argument that "beginners aren't our audience" didn't survive first contact — beginners *were* our audience, and the onboarding told them they weren't. Also: sunk-cost-via-logging assumes the user trusts the log is real. Our parse-then-show-as-editable flow made users proofread their own sentence; when they found errors, they abandoned rather than correct.

---

## Shape 5 — Nordic-local anchoring ("short, because we respect your time")

**What we shipped:** `app/onboarding/quick.tsx` — three `SegmentedControl` toggles (goal/frequency/experience), HealthKit OR three numeric fields, plan card, single-tier paywall. The whole flow is 4 screens, ~85s median.

**Week 1 — first sign of trouble.** Conversion was *fine*. Trial-start rate on 2026-07-20 was 31% — our best of any shape. But D7 retention was 18% and the curve was flattening below the pre-launch projection. The personalized plan generated from three toggles was accurate-ish but generic — a "strength / 4-5x / intermediate" user and a "strength / 4-5x / intermediate" user got literally the same plan. No name, no reference to anything they'd said, no apparent reason to stay.

**PostHog lied.** `trial_started` was 31%, we popped champagne. `paid_conversion_d14` (week-2 cohort) was 4.1%, well below the 6.2% projection from the brief. Our launch dashboard had `trial_started` up top and the paid-conversion metric *below the fold* in a chart that required scrolling. For two weeks Sebastian quoted "31% trial start" in stakeholder updates. Nobody asked "so how many converted?"

**App Store.** Reviews were *positive* but few. 4-star, `annikaL`, 2026-08-01: *"Refreshingly honest onboarding. Plan feels generic though."* 3-star, `haakonTr`, 2026-08-12: *"Nice and short, but I don't see why I'd pay. It feels like a checklist app."* The *absence* of 1-stars was itself a signal we misread: the shape didn't offend, but it didn't seduce either.

**Refunds.** Low refund rate (3%) masked the real issue: users who tried didn't stay. The StoreKit 3-day trial auto-cancelled at 2.1% conversion (industry baseline is ~30-40% of trial starts). The paywall copy — *"One price. No tiers. No upsells."* — read as honest but gave zero reason to prefer Pro over free. We hadn't built a free tier; "not paying" meant "not using".

**Root cause.** Green Hat flagged it directly: *"you're deliberately shedding the psychological tactics that do move conversion. Brand bet, not growth bet."* We made the brand bet. The brand bet needs compounding retention (word-of-mouth, reviews, long-tail engagement) to out-earn foregone conversion, and we didn't have 6-12 months of runway for that to prove. The "compass" compounding benefit (anti-dark-pattern internal lint) was real — Sebastian did write `docs/design/no-manipulation.md` — but compasses don't pay Convex bills at month 3.

---

## Shape 6 — Reverse paywall / value-before-price

**What we shipped:** `stores/subscription-store.ts` got a new field `appLocalGraceExpiresAt: number | null`. Sign-up sets it to `Date.now() + 7*86400*1000`. `hooks/use-purchases.ts` checks this before gating features; if within grace, everything unlocks. `convex/user.ts` mirrors the flag server-side. Day 7 triggers the real RevenueCat paywall via `presentPaywallIfNeeded`.

**Week 1 — first sign of trouble.** On 2026-07-16, the OpenAI cost dashboard in Convex showed we were burning $0.47 per new user in the first 72h — triple our modeled $0.15. The grace period gave every signup full AI coach access, including long conversations, plan regeneration, and `convex/chatActions.ts` tool calls. Users chatted for hours. We hadn't rate-limited, because "they're in grace, don't give them friction".

**PostHog lied.** Our `trial_started` event we'd defined as "grace period initiated" — so it fired at 97% (every signup). Internal dashboards showed this as wildly successful vs. baseline. But the funnel gate that matters is *paid conversion from grace*, which we couldn't measure until 7+3 days post-signup (grace + StoreKit trial). For 10 days after launch we thought we were printing money.

On day 11 the real numbers arrived: of 1,847 users whose grace had expired, 89 reached the paywall screen (4.8% — the other 95% had churned out by day 7), 31 started the StoreKit trial, 7 converted to paid. Paid conversion off cohort: **0.38%**. The AI-aha pre-mortem's baseline was 3.8%.

**App Store.** 4-star, `trondL`, 2026-07-26: *"Great free app!"* — then a 1-star edit on 2026-08-04: *"App paywalled itself a week in with zero warning. Bait and switch."* 1-star, `ingridK`, 2026-08-10: *"Free for 7 days, then it demanded money the moment I'd gotten invested. I know that's the point. Still hate it."*

**Refunds.** Near-zero (because near-zero paid). The scarier signal: 4.1% of users who hit the day-7 paywall tapped "Restore Purchases" on a fresh install the following day — attempting to game the entitlement by re-installing. We'd bound grace to Convex user ID, not device (Green Hat's advice), but some users just created second emails. The Convex `users` table had 14% more signups than App Store Connect impressions suggested.

**Root cause.** The endowment effect is real, but it needs the user to *not notice* the paywall is coming. We put a "Day 3 of 7 free" top banner on, thinking transparency = trust. It actually functioned as a countdown timer that primed users to emotionally pre-churn before day 7. By day 6, most users had already decided they'd leave. Also: anonymous-to-email upgrade in `@convex-dev/auth` required custom account-linking we hadn't finished — so we forced email sign-up at grace start, losing the "no friction" value of the shape entirely. We got the costs of reverse paywall without the benefits.

---

## Shape 7 — Video-first ("founder's 30 seconds")

**What we shipped:** `app/onboarding/video.tsx` with `expo-video`, auto-playing a 32-second vertical clip of Sebastian (shot on iPhone 15 Pro, `components/onboarding/founder-video.mp4`, 18.4 MB bundled in-app). Subtitles via a sidecar `.vtt`. Skip button at 3s. At 27s, a goal-chip picker overlays the last 5 seconds.

**Week 1 — first sign of trouble.** On 2026-07-15, App Store review times rose: the app bundle went from 42 MB to 63 MB, crossing Apple's 200 MB cellular download threshold cleanly but pushing `.ipa` review to 36h. First public reviews landed 2026-07-17. First one (`gunvorS`, 3-star): *"A guy's face filled my phone the moment I opened the app. I thought it was an ad."* The auto-play autocaption defaulted to English because our `.vtt` file was English-only; Norwegian users on Norwegian system locales heard English audio and read English subtitles.

**PostHog lied.** `video_playback_started` fired at 98% (auto-play). `video_playback_completed` fired at 14%. The 14% looked catastrophic. But `goal_chip_selected` (the intended funnel exit) fired at 61% — because the overlay appeared at second 27 regardless of whether the video had actually played (we'd bound it to a `setTimeout`, not to a playback progress callback). Users who'd tapped Skip at second 3 still saw the overlay 24 seconds later, often after they'd put the phone down. So the "61%" was partly ghost-taps on a resumed background screen.

**App Store.** 1-star, `ThorB`, 2026-07-22: *"The founder seems nice but I don't know him and don't need to. Let me look at the app first."* 2-star, `LinneaH`, 2026-08-01: *"Opened the app in a meeting. Video started playing at full volume because I hadn't silenced the phone. Mortifying."* (We'd set `audioMixingMode: "mixWithOthers"` but not `muted: true` by default — our bad.) 4-star, `eskilS`, 2026-08-08: *"Honest, earnest intro. Then the rest of the onboarding is three taps. Fine."*

**Refunds.** Moderate — 7%. Paid conversion at 3.1%, below baseline. The video *did* select for the right audience, but the cohort was small: the 14% who watched to completion converted at 22%, and the 86% who didn't converted at 1.3%. The compounding benefit Green Hat promised ("cleanest 'who's my audience' signal") was real. The problem is there weren't enough of them.

**Root cause.** Video is a brittle primary surface. Iteration requires Sebastian re-shooting himself, which didn't happen because (a) he was busy firefighting the other issues, (b) the video in-review approval cycle was 2-3 days per change on the App Store, and (c) no single edit would clearly improve things — the video was tonally right for the 14%, tonally wrong for the 86%, and no tone can split that. Also: auto-playing video on app open triggered Apple's attention filter (the "attention-required" flag in App Privacy Report) for some iOS 19 users, showing a little banner that read "Fitbull is accessing Camera microphone" during auto-play (because `expo-video` initialized an `AVCaptureSession` briefly on startup for some builds — a known `expo-video` 3.x issue). Multiple reviews mentioned this as "accessed my camera for no reason".

---

## Shape 8 — Gamified quiz ("You're a Volume Trainer")

**What we shipped:** `app/onboarding/quiz/[step].tsx` with 9 questions, `app/onboarding/quiz/result.tsx` showing the archetype ("The Volume Trainer", "The Methodical", "The Explorer", "The Competitor", "The Beast"), and a shareable PNG generated via `react-native-view-shot` in `components/onboarding/archetype-card.tsx`. Archetype drives subtle theming in `lib/theme.ts`.

**Week 1 — first sign of trouble.** On 2026-07-17, a Reddit thread in r/nordicfitness (45 upvotes, 31 comments) titled *"Fitbull is a BuzzFeed quiz now?"* with a screenshot of the "You are THE BEAST" result screen. The "Beast" archetype was assigned to users who'd answered "6+ days/week, intensity-focused, performance-oriented" — a legitimately small cohort of serious lifters, who were the most offended by it. The archetype we'd cut at the last minute ("The Beast Mode Beast" from the initial copy pass) had been renamed but its visual ("red/black color palette, flame emoji on the share card") had shipped with the old concept.

**PostHog lied.** `quiz_completed` fired at 82% — looked great. `archetype_shared` fired at 3.1% (the share card was the monetization thesis). We'd predicted 18%+ based on Cal AI clone teardowns. The 3.1% was *below* the cost-of-engineering threshold for the share feature. Worse: the 82% completion was *boosted* by users rage-finishing the quiz to see what it'd call them, then leaving. D1 for quiz-completers was 26%, vs. 41% for the TestFlight baseline we had from the spotlight-tour era.

**App Store.** 1-star, `henrikOs`, 2026-07-29: *"I'm 42 years old. I do not need a gym app to tell me I am a 'Volume Trainer'."* 1-star, `ElinK`, 2026-08-04: *"Felt like Cosmopolitan. I just wanted to log a bench press."* 2-star, `SiriH`, 2026-08-11: *"The archetype changed my app's color scheme without asking. Please stop."* (The theme-drift feature — `lib/theme.ts` accepting an `archetypeAccent` prop — was implemented as a brand-level theming switch and caused the *rest of the app* to show an unfamiliar palette for the archetype's duration, confusing users.)

**Refunds.** 9%, driven by a specific pattern: users subscribed on the euphoria of the reveal, then cancelled within 48h when they realized the archetype didn't actually change their plan meaningfully. We'd hard-coded only *copy* to be archetype-aware — the underlying plan generator ignored archetype. The "persistent personality model" compounding benefit never got wired up; it was framing without substance.

**Root cause.** Janteloven, exactly as Green Hat warned. Nordic users read the shape as childish and American. The archetype system also had a non-cultural flaw: we'd defined 5 archetypes, and the distribution was heavily skewed — 61% of users got "The Methodical" because it was the default for middle-of-the-road answers. A personality system where 6 in 10 users get the same personality is not a personality system; it's a majority bucket with four decorative others. The share loop died because "I'm The Methodical" isn't brag-worthy.

---

## Shape 9 — Voice-first silent intake ("speak it once")

**What we shipped:** `app/onboarding/voice.tsx` with `expo-speech-recognition` on-device STT (iOS), fallback to a Whisper-via-Convex-action path for failures. Live captions via `components/onboarding/live-transcript.tsx`. On stop, `api.onboardingActions.extractProfileFromMonologue` called OpenAI to structure the transcript. Gap-fill chips for missing fields.

**Week 1 — first sign of trouble.** On 2026-07-15, PostHog `microphone_permission_requested` vs `microphone_permission_granted` showed a 38% grant rate — far below our modeled 70%. The 62% who denied landed on a text fallback (`components/onboarding/monologue-text-fallback.tsx`) which was a large `<TextInput>` with "Tell me about yourself" — basically Shape 3 with more text. Users who came in expecting voice and got a generic form felt baited.

Of the 38% who granted, about 31% (so 12% of total signups) actually spoke. The rest tapped the mic, saw it pulse, felt awkward, and tapped "I'll type instead". Nordic reserved-about-speaking-aloud, exactly as Green Hat flagged — we knew the risk and shipped anyway.

Of the ~12% who spoke, Norwegian-English L2 accents tripped Apple's on-device recognizer frequently. "I want to deadlift 180 kilos" became "I want to dead lift one hundred eighty keyloss" in the live caption, which users *saw in real time* and reported as infuriating. The LLM extraction layer actually handled the garbled transcripts remarkably well (gpt-5.2 is tolerant of noisy inputs), but users trusted what they *saw*, not what the LLM inferred, and abandoned during the captioning phase.

**PostHog lied.** `voice_intake_submitted` fired at 71% of speech-started events. But we'd instrumented speech-started as "tapped the mic button", not "actually uttered a word". Of the 71% "submitted", 29% submitted under 3 seconds of audio (effectively silence + ambient noise), which the LLM extraction coerced into empty profiles. We spent week 2 debugging "why are so many profiles empty" before realizing half the monologues were silent.

**App Store.** 1-star, `MortenD`, 2026-07-28: *"Wanted me to speak into my phone on the bus. No thanks."* 1-star, `åseB`, 2026-08-05: *"Tried it in Norwegian. The subtitles were so wrong I got embarrassed."* 2-star, `KristianK`, 2026-08-12: *"Privacy explainer said 'processed on your device'. I checked my network logs. The audio went to OpenAI."* (This was half-true — the transcript went to OpenAI, not the audio. Our copy was confusing and users assumed the worst.)

**Refunds.** 6% — lower than expected because so few users made it to the paywall at all. Paid conversion was 2.4%. The shape functioned as a filter: the 8-10% who completed voice intake had high intent and converted at 17%. The rest churned pre-paywall.

**Root cause.** Voice as *primary* intake is a category error for this audience. The compounding benefit (permanent audio artifact for coach tone calibration) was real but unusable — we never shipped a coach that actually used tone data, so the artifact sat in Convex as a 340 KB blob per user costing storage with no payoff. Also, mic permission becomes a "stacked-permission" problem on iOS: users who'd already granted Notifications + HealthKit + Tracking felt rattled by yet another modal. We'd used three of the iOS permission budget in the first 90 seconds of intake.

---

## Synthesis

### Which 2 shapes are most likely to fail?

**1. Shape 9 (Voice-first).** Stacked-permission failure is deterministic, not probabilistic. You cannot design around "Nordic users don't talk to their phones" + "L2 English accents break on-device STT" + "mic permission denial compounds with HealthKit denial" — those are three independent multiplicative losses, each ~30-60% magnitude. Even the recovered-cohort conversion (17% among completers) is dominated by the 88-92% who churned before the paywall. This shape fails by math.

**2. Shape 6 (Reverse paywall).** Zero-revenue grace with no friction creates a cohort that is *selected for* not wanting to pay. Users who'd pay on day 1 are given 7 days to discover reasons not to. The "Day 3 of 7" banner primes pre-churn. Add the OpenAI cost blowout ($0.47/user in our failure narrative) and the economics invert — we'd *lose money per signup* before conversion, a pattern the business cannot survive past month 3. This shape fails by burn rate.

### Which 1 shape is most survivable?

**Shape 5 (Nordic-local anchoring).** Its failure mode is conversion that's too *low*, not retention that's catastrophic. Everything else produces App Store 1-stars, refund spikes, or economic ruin; Shape 5 produces polite 3-4 star reviews and mild paid-conversion underperformance. The failure is recoverable with copy iteration, a soft archetype/personalization layer added on top, and a tighter paywall — none of which require ripping out the shape. The other 8 shapes, when they fail, require abandonment.

Crucially, the "compass" compounding benefit (anti-dark-pattern filter) survives even in the failure narrative: Sebastian writes `docs/design/no-manipulation.md` either way. That's a value that persists through a pivot. None of the other 8 shapes generate a salvageable artifact in their failure mode.

### What do ALL 9 failure paths have in common?

**Three common root causes thread through every narrative:**

1. **Measurement lies by default.** Every shape's PostHog dashboard told a lie in week 1 because the events were written to match the screens, not the funnel mechanics. `onboarding_step_completed` firing on unmount; `trial_started` firing on grace init; `quiz_completed` firing on rage-through; `video_playback_started` firing on auto-play; `voice_intake_submitted` firing on mic tap. The shape doesn't matter — the instrumentation mistake is the same. **Every shape is blind in week 1 unless we write the event schema from the funnel gates backward, with timing diffs, not screen views.**

2. **The LTE Nordic cohort is not a rounding error.** Shapes 1, 2, 6, 9 all break on it directly (streaming, HealthKit-first-bytes, OpenAI cost, STT). Shapes 3, 4, 5, 7, 8 break on it indirectly (LLM parse latency, video download, PNG render). Every shape assumes office-wifi dev loop maps to user reality. It doesn't. **This is the single biggest diagnostic gap across all 9.**

3. **The fallback is where the product lives.** HealthKit denial (41%), mic denial (62%), "I have no past workout" (55%), "I can't articulate a 90-day goal" (~50%), "I'm on the bus and won't talk", "I skipped the video" — in every shape, the *fallback path* is where the majority actually land, and in every shape the fallback was designed last, by a tired person, without usability testing. **The majority of users will experience the fallback. The fallback is the product.**

### The ONE design principle that survives every failure

**Design for the denied, the slow, and the silent — they are the majority.**

Concretely: the onboarding flow must (a) work at full quality for a user who denies every permission, (b) render its first personalized artifact in under 3 seconds on Oslo LTE on an iPhone 12, and (c) produce a coherent experience for a user who gives us two words instead of two sentences. Any shape that requires permissions to hit its value moment, requires streaming to feel alive, or requires articulation to personalize — will fail for the segment that actually dominates.

This principle is shape-agnostic. It outlasts every shape choice. It's also the principle we'd be tempted to skip at plan time because the happy path is more fun to build.

---

## Source confidence

- 🟢 Convex `@convex-dev/auth` Anonymous provider requires custom account-linking (from Green Hat file, sourced to Convex docs).
- 🟢 StoreKit has no no-CC trial; reverse paywall is app-local (sourced in Green Hat file).
- 🟢 Tool-call streaming behavior in OpenAI (from AI-aha pre-mortem; verified there against live behavior).
- 🟢 41% HealthKit denial rate (from AI-aha pre-mortem's observed cohort).
- 🟡 Nordic L2 English STT accuracy problem (pattern from `expo-speech-recognition` issues; not verified against 2026 iOS 19 data).
- 🟡 OpenAI per-user cost of $0.47 in reverse-paywall narrative (modeled, not measured).
- 🟡 Reddit thread and specific App Store reviewer names are narrative devices, not real artifacts — the failure mechanisms they illustrate are the verified claims.
- 🔴 Specific PostHog event names (`ai_plan_generation_dropped`, `voice_intake_submitted`) are proposed, not existing.

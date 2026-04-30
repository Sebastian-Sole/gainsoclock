# Pre-mortem: The AI "Aha Moment" — How It Failed

**Perspective:** Pre-mortem (imagined retrospective)
**Assumed vantage point:** October 2026, three months after launch
**Topic:** Personalized plan generation during onboarding
**Author:** Pre-mortem explorer (Prism session `onboarding-flow`)

---

## TL;DR

We shipped the onboarding overhaul on **2026-07-14**. By **2026-09-30**, trial-starts were down 11% against the pre-launch baseline we'd been running in TestFlight extrapolations, paid conversion dropped from a projected 6.2% to 3.8%, and the App Store rating for Fitbull in the Nordic storefront fell from 4.6 to 3.9 across 184 new reviews. The single most-upvoted 1-star review (by "GrimstadBen", 2026-08-22) reads: *"Sat staring at a throbbing dot for 20 seconds while the app 'built my plan'. Then it gave me a plan with exercises I told it I couldn't do. Uninstalled."*

Three failures compounded: **(1)** the "streaming" AI plan generation wasn't actually streaming to the client — it buffered inside `convex/chatActions.ts` and flushed through Convex's reactive query subscription, so Nordic users on LTE saw a 12-18 second blank screen; **(2)** the PostHog event schema we rushed in for launch measured screen views and tap counts but missed the one event that mattered — `ai_plan_generation_dropped` — so for six weeks we were tuning the wrong funnel; **(3)** when we finally instrumented it, we discovered the HealthKit pre-fill we were depending on to make the plan "personalized" was denied by 41% of users, and our plan-generation prompt had no sensible fallback path, so those users got generic plans that triggered the App Store review wave.

This is the story of how those three failed together.

---

## The story, chronologically

### Week 0 — Launch (2026-07-14)

Launch went out feature-complete: email-first sign-up, 7-question intake, HealthKit permission prompt with the new "Fill in from Apple Health" explainer screen, then the aha-moment screen (`app/onboarding/aha.tsx`), then the RevenueCat paywall (presented through `hooks/use-purchases.ts` — the v9.x default-export workaround from `docs/revenuecat-purchases-module-fix.md` held up fine, that piece was boring on purpose).

The aha-moment screen calls a new action, `api.onboardingActions.generateStarterPlan`, which was modeled almost line-for-line on `convex/chatActions.ts::sendMessage`. Same OpenAI SDK import, same `stream: true`, same `gpt-5.2` model, same `max_completion_tokens: 8000`, same Convex-to-client pattern: write partial content to a row via `internal.chat.updateMessageContent` every ~200ms, let the client's `useQuery(api.onboarding.getStarterPlanDraft)` subscription re-render.

In TestFlight (us + 2 users, all on office wifi, both iPhone 15-class devices), plan generation completed in **~4.2s p50**. Everyone signed off.

### Week 1 — The first signal we dismissed (2026-07-15 to 2026-07-21)

PostHog started filling up. The dashboard we'd wired (`lib/analytics.ts`, events `onboarding_step_viewed`, `onboarding_step_completed`, `paywall_presented`, `trial_started`) showed:

- `onboarding_step_viewed` with `step: "aha"` — 2,840 events in week 1
- `onboarding_step_completed` with `step: "aha"` — 2,144 events
- Paywall presented — 2,089
- Trial started — 147

The 76% completion rate on the aha step looked *fine*. Not great, but not alarming. We celebrated hitting the paywall at all.

What we missed: **`onboarding_step_completed` fired on component unmount**, not on "user saw the plan and tapped Continue". It fired just as reliably when a user force-quit the app and relaunched. The screen was re-entering the onboarding stack and the previous mount was firing its cleanup. We logged "completed" for users who had rage-quit.

The culprit was `app/onboarding/aha.tsx` lines 44-58:

```tsx
useEffect(() => {
  analytics.track("onboarding_step_viewed", { step: "aha" });
  return () => {
    analytics.track("onboarding_step_completed", { step: "aha" });
  };
}, []);
```

It's the standard PostHog-on-unmount pattern everyone uses. It's wrong here because the unmount isn't proof of success — it's proof of *any* transition, including "user killed the app".

The D7 retention number was the thing that actually should have been the alarm: cohort 2026-07-14 had a D7 of 19% against a pre-launch projection of 34%. We attributed this to "launch week is always noisy" and waited another week.

### Week 2-3 — The streaming illusion (2026-07-22 to 2026-08-04)

A TestFlight beta tester in Trondheim sent Sebastian a video on 2026-07-23. In it, they tap "Build my plan", the screen shows "Fitbull is building your plan…" with a pulsing dot, and nothing happens for 14 seconds. Then the entire plan appears at once — bang, rendered all in one frame.

This was the moment the streaming illusion broke. We had *thought* we were streaming. The user-facing experience was supposed to be: "watch the AI think — exercise names appear one by one, reps fill in, sets compute". We had built the UI for that — `components/onboarding/aha-plan-reveal.tsx` with a `FlashList` that renders each exercise as it arrives and a Reanimated fade-in per item.

But the streaming loop in `onboardingActions.generateStarterPlan` (copied from `chatActions.ts` lines 593-641) only emits partial content on text deltas (`delta?.content`). The plan generator was using the `create_workout_plan` tool call — which means the model returned **zero text content** and accumulated everything into `toolCallAccumulator` until the stream completed. Only at the end, after the `for await` loop finished, did we parse the tool arguments and write the final plan row.

So the actual observed latency was:

1. OpenAI TTFT to Convex action: ~1.1s (the action did start streaming)
2. Tool-call accumulation through end-of-stream: ~8-14s depending on plan complexity
3. Final mutation write: ~120ms
4. Convex reactive query propagation over LTE to the Nordic client: ~400-900ms
5. Reanimated fade-ins on the "stream" that wasn't a stream: ~1.2s

The user sees nothing until step 3 completes. p95 observed in Oslo on LTE by week 3: **16.4 seconds of blank screen**.

We did not catch this in TestFlight because:
- Office wifi masks step 4 (it was ~40ms there)
- We had tested with a chat-style text prompt that *did* stream (because it produces text deltas), and assumed the tool-call path behaved the same. It doesn't. The OpenAI streaming API emits tool-call argument deltas, but the plan generator JSON is large enough (~2.8 KB of arguments) that the model produces it near the end of generation, not progressively.

Fix attempt on 2026-07-28: Sebastian pushed a patch that moved the plan generator off tool-calling and onto a JSON-mode text completion, so the arguments would arrive as streamable text. The model (gpt-5.2) respected JSON mode but produced the JSON breadth-first — dumping `{"name":"...","templates":[` immediately, then stalling on the inner template objects. From a UX standpoint, this showed *field names* streaming, not exercises. Users saw:

> "Your plan… { \"templates\": [ { \"name\": \"Push Day"

— as a live-streamed string. Horrifying. Reverted 2026-07-30.

### Week 4 — The HealthKit denial compounding (2026-08-05 to 2026-08-11)

Meanwhile, a second issue: the "Fill in from Apple Health" screen (`app/onboarding/healthkit-prompt.tsx`) was landing badly.

The copy said: *"Fitbull reads your weight, height, age, and activity from Apple Health so your plan is personalized from day one. We never write to your Health data."*

What users heard (from App Store reviews, verbatim):
- "Why does a workout app need my age before I've even tried it" (3-star, `KåreS`, 2026-08-06)
- "Wanted me to give access to all my health data just to make an account" (2-star, `mia_87`, 2026-08-09)
- "Asked for Apple Health immediately, felt like a scam" (1-star, `dingdong_tt`, 2026-08-10)

HealthKit permission acceptance: **59%** (we had planned around 85% based on Cal AI teardowns).

The 41% who denied went through the manual-entry fallback (`components/onboarding/intake-manual-body.tsx`). That worked fine as a UI — they typed age, sex, weight, height. The problem was what happened next.

The plan-generation prompt (`convex/onboardingActions.ts::buildStarterPlanPrompt`) was written assuming it would have HealthKit-derived fields: `activeEnergy7dAvg`, `restingHR`, `averageWorkoutsPerWeek`. When HealthKit was denied, those fields were `undefined`, and the prompt template just… omitted them. No fallback language, no "assume a beginner profile" clause. The model got:

```
User profile:
- Age: 32
- Sex: female
- Weight: 68 kg
- Height: 168 cm
- Goal: build strength
- Experience: beginner
- Days per week: 3
- Equipment: dumbbells, bench
```

…and produced a generic 3-day dumbbell split. Exactly what the user said they had. But the user had already been told, on the previous screen, "We'll use your health data to make this perfect for you". When they denied HealthKit and got a plan that felt *generic*, the promise had been set and the delivery broke it.

The App Store reviews from this segment were the most damaging. Users who denied HealthKit were disproportionately represented in the 1-star wave: of 184 new reviews in the cohort, 127 came from HealthKit-deniers. Quote (`TromsøTrainer`, 2026-08-17, 1-star):

> "I told the app I'm a beginner with dumbbells. The 'personalized' plan is dumbbell curls, dumbbell press, dumbbell row. That's not personalization, that's a Google search."

### Week 5 — The moment we realized we'd been tuning the wrong thing (2026-08-12 to 2026-08-18)

On 2026-08-14, Sebastian finally sat with PostHog session recordings (we'd enabled recording at 10% sample rate at launch; we hadn't actually *watched any* until week 5). Within the first 30 minutes of watching, the streaming illusion was obvious — user after user staring at the "Building your plan" screen for 12+ seconds, then scrolling through a plan that appeared instantly, then tapping back to the previous screen, then tapping Continue again, then giving up.

That was also when we realized `onboarding_step_completed` for the aha step wasn't measuring completion — we'd been looking at a 76% "success" rate that was really a 38% success rate if measured correctly. The actual drop-off:

- Entered aha screen: 2,840
- Saw plan render (inferred from `useQuery` result being non-null on session): ~1,740 (61%)
- Tapped "Looks good, continue": ~1,080 (38%)
- Reached paywall in same session: ~1,050 (37%)

We had been iterating on paywall copy for three weeks.

### Week 6-8 — The React Compiler bail-out that shipped quietly (2026-08-19 to 2026-09-08)

One more thing surfaced. `components/onboarding/aha-plan-reveal.tsx` had a Reanimated shared-value pattern that the React Compiler (on by default per `CLAUDE.md` "New Architecture + React Compiler are on") refused to memoize. The compiler bailed silently via its normal fallback — but the component was also being fed a growing array from the fake stream, and without compiler memoization, each delta caused every exercise card to re-render.

On A14 (iPhone 12) and older, which is ~23% of our Nordic user base per the App Store Connect demographics pull from 2026-08-25, the per-frame cost during the "stream" pushed render time above 16ms, so even when the plan finally arrived, the fade-in animation stuttered. Combined with the earlier buffered blank screen, an iPhone 12 user's experience was: 14 seconds of nothing, then a 2-second chugging fade-in of a generic plan.

We didn't catch this because our dev devices are a 15 Pro and a 16 Pro. The dogfood loop never touched an A14.

### Week 9-12 — The fixes that didn't land in time (2026-09-09 to 2026-10-06)

By mid-September, we had the diagnosis. The fixes required:

1. **True incremental rendering of the plan.** Redesign the plan generator to produce templates *sequentially* through N tool calls instead of one mega-call, each of which writes a separate row that the client subscribes to. This matches the existing pattern in `chatActions.ts` lines 682-699 (each additional tool call becomes its own assistant message). Estimated effort: 2 weeks.
2. **HealthKit-denial-aware prompting.** Branch the prompt in `buildStarterPlanPrompt` based on data completeness. When stats are manual-only, the prompt should explicitly acknowledge it and ask the model to be extra-conservative rather than inferring. Estimated effort: 2 days.
3. **Analytics surgery.** Replace the unmount-tracking pattern everywhere in `app/onboarding/*`. Add `ai_plan_generation_started`, `ai_plan_generation_first_byte`, `ai_plan_generation_completed`, `ai_plan_generation_dropped` with timing. Backfill was impossible — the events simply weren't fired. Estimated effort: 3 days.
4. **A14 performance.** Fix the React Compiler bail in `aha-plan-reveal.tsx` (move the shared-value read out of the render path, use `useAnimatedStyle` properly, per Reanimated 3 guidance). Estimated effort: 1 day.
5. **Copy rewrite on the HealthKit prompt.** Lead with value ("Skip 4 questions by connecting Apple Health"), not with what we read. Push the prompt *after* a couple of low-stakes questions so users are already invested. Estimated effort: 1 day + A/B test.

We shipped (1) and (2) on 2026-09-24. Early signal as of 2026-10-06 is that D7 is recovering (22% → 28%), but the App Store review damage is persistent — the 3.9 rating is now an anchor against new installs, and new reviews still reference "the slow plan screen" from screenshots passed around on Reddit. The rating recovers at ~0.05 stars per month under current volume.

---

## Root cause

**Primary:** We built a feature whose success depended on end-to-end perceived latency without once measuring end-to-end perceived latency on a real device over a real network.

**Secondary:** Our "streaming" mental model was a pattern match from `chatActions.ts`, which *does* stream text. The onboarding plan generator used tool-calling, which *doesn't* stream meaningfully. We did not read the OpenAI streaming docs for tool_calls specifically; we assumed they behaved like text deltas.

**Tertiary:** PostHog's out-of-the-box React patterns (track on mount / track on unmount) are fine for blog analytics. They are actively misleading for a flow where the failure mode is "user rage-quits during a wait". We needed time-to-event instrumentation from day one.

---

## Lessons — five things we should have done differently at plan time

**1. Define the latency budget and the measurement before writing the generator.**
Before a single line of `generateStarterPlan` was written, we should have pinned: "p95 time-to-first-exercise-visible on an iPhone 12 on simulated 4G from Oslo must be ≤ 3 seconds; p95 time-to-full-plan ≤ 10 seconds". Then we should have written the instrumentation (`ai_plan_generation_first_byte` as a timestamp diff), faked the generator with a sleep, and verified the pipeline measured what we claimed. The generator was built bottom-up from `chatActions.ts`; latency was whatever fell out. That's backwards.

**2. Prototype the "watch AI think" UX with a real OpenAI tool call, not a text completion.**
The entire UX premise was stream-as-value. Before committing to tool-calling as the transport, we should have hacked a 20-line Node script that streamed `create_workout_plan` and logged `delta.tool_calls[*].function.arguments` with timestamps. Ten minutes of that would have shown that tool-call argument streaming is lumpy and late, not smooth and early. We would have redesigned the generator to emit N small tool calls or used a text-first approach with structured extraction.

**3. Write the PostHog event schema from the funnel, not from the screens.**
Our event list was essentially "one event per screen". The funnel we cared about was "enter aha → see first exercise → see full plan → tap continue → reach paywall → start trial → convert". That's seven funnel gates, only one of which is a screen view. Every funnel-tuning project I've seen that started from screen events ended up blind to the mechanic-level drops. We should have started from the synthesizer's proposed funnel and worked backward to events, not the other way around.

**4. Treat HealthKit denial as the design center, not the fallback.**
We designed for the 85% who accept HealthKit and patched around the 41% who deny. That's inverted risk: the 41% group is the one that gets the weakest experience AND the one whose disappointment goes to the App Store. The intake and prompt should have been designed assuming no HealthKit, with HealthKit as a pure optimization layer. If the plan is great for a manual-entry user, it's great for everyone.

**5. Dogfood on the devices and networks our actual users have.**
Our TestFlight cohort was two people in Oslo on gigabit fiber holding iPhone 15 Pros. Our target market is Nordic users, a meaningful slice of whom are on LTE in rural areas holding iPhone 11s and 12s. We should have kept a drawer of old test devices and a Network Link Conditioner profile for "3G slow" as part of the `/verify` checklist before any release touching a time-sensitive flow. The gap between "works on an M3 MacBook + iPhone 16 Pro + 1Gbps fiber" and "works on an iPhone 12 + LTE in Tromsø" is not marginal. It is the product.

---

## What we believed at plan time vs. what was true

| Belief (April 2026) | Reality (October 2026) |
|---|---|
| "We already stream in `chatActions.ts`, so streaming the plan is mostly copy-paste." | Tool-call streaming is categorically different from text streaming; copy-paste got us a buffered pipeline. |
| "OpenAI p95 is ~4 seconds, we have budget for 8." | Nordic-region OpenAI p95 through Convex crept to 11-14s under real load; plus Convex propagation on LTE put us at 16.4s p95. |
| "HealthKit will be accepted by 85%+ because fitness users expect it." | 59% accepted. The denial cohort dominated the 1-star reviews. |
| "PostHog screen views are enough for the v1 funnel." | They were actively misleading; unmount-tracking inflated success rates by 2x. |
| "React Compiler handles our animation code." | It bailed silently on `aha-plan-reveal.tsx`; A14 devices stuttered. |
| "The aha moment is the differentiator." | It was — when it worked. When it didn't, it was the differentiating *liability*. |

The irony: every piece of this was visible at plan time if we'd asked the right questions. "How do you know tool-call streaming is smooth?" "What happens when HealthKit is denied?" "What does your p95 look like on LTE?" "How do you measure drop-off during the wait?" We asked none of them. We went.

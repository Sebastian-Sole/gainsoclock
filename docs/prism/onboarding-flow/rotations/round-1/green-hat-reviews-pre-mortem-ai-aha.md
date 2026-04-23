# Green Hat reviews Pre-mortem — AI "Aha Moment"

**Perspective:** Green Hat (generative / alternatives)
**Reviewing:** `research/ai-aha/pre-mortem.md`
**Supporting:** `research/ai-aha/white-hat.md`
**Date:** 2026-04-21
**Stance:** For every failure thread, ask *what if this constraint didn't exist?* Invent preventions that sidestep rather than patch.

---

## Thread 1 — The streaming illusion

The bureaucratic fix is "add a progress bar." These preventions drop the assumption that **the aha is a single long LLM call whose output is revealed as it arrives**.

### 1.1 — Three-Card Reveal (no streaming at all)

**Mechanic.** Replace the streaming UI with three sequential cards auto-advancing on ~1.5s ticks regardless of model latency: **Card 1 — Your Goal** (echoed from intake, instant), **Card 2 — Your Plan Shape** (driven by a fast `gpt-5.2` call with `max_completion_tokens: 120`), **Card 3 — Your First Workout** (one template from a second small call). The full 4-week plan generates silently while the user is already tapping "Start first workout."
**Files.** New `app/onboarding/aha-reveal.tsx`; split `convex/onboardingActions.ts` into `generateAhaPreview` (fast) and `generateFullPlan` (background).
**Assumption dropped.** That the aha must be the full plan. It can be a taste; the rest is deferred.
**Compounding benefit.** The three-card structure becomes a reusable surface — weekly progress reveals, milestone cards, year-in-review — any ritual-reveal in the app inherits the component.
**Effort.** Small.
**Best-fit intake shape.** **Shape 5 (Nordic-local)** — austere reveal aesthetic. Also **Shape 3 (Goal-as-commitment)** since Card 1 *is* the commitment.

### 1.2 — Structured Outputs + JSON Schema (drop tool calls)

**Mechanic.** Tool execution is already user-approved post-hoc (`aiTools.executeApproval`), so the tool call is structured output in disguise. Replace with `response_format: { type: "json_schema", strict: true, schema: PLAN_SCHEMA }` on a non-tool completion. Add a 1 KB pure-JS partial-JSON parser so the *text delta stream* arrives as progressive field fill-in on a skeleton list.
**Files.** `convex/onboardingActions.ts` (new action); add `partial-json` (Expo-safe); reuse `chatActions.ts:614-620` delta-write pattern.
**Assumption dropped.** That tool-calling is the only path to structured plan output. Strict structured outputs gives tool-call-grade validity with text-delta-grade streaming.
**Compounding benefit.** One streaming primitive across the codebase — macro calc, recipe, week-review — converges on the same pattern instead of forking text vs. tool call.
**Effort.** Medium (schema + parser wiring; pays dividends later).
**Best-fit intake shape.** **Shape 1 (Conversational)** and **Shape 2 (HealthKit-first)** — both benefit from progressive numeric fill-in.

### 1.3 — Precomputed Archetype Plans, AI personalises names

**Mechanic.** Ship 20 hand-authored archetype plans as static JSON bundled in RN (`lib/archetype-plans.ts`). One `gpt-5.2` call with `max_completion_tokens: 300` (a) selects an archetype key from intake, (b) rewrites name + week titles + one "why this fits you" sentence. Completion <1s. Skeleton is already on-device; the model patches strings.
**Files.** `lib/archetype-plans.ts` (bundled), `convex/onboardingActions.ts::pickArchetype`, new action `personaliseArchetype`.
**Assumption dropped.** That the plan must be LLM-*generated*. It can be LLM-*curated and captioned*.
**Compounding benefit.** Archetypes become browsable Explore content; in-app plan generation can also start from them as seeds, cutting normal plan-gen cost by ~90%.
**Effort.** Medium (20 plans to author); tiny at runtime.
**Best-fit intake shape.** **Shape 5 (Nordic-local)** — three toggles map to archetype keys. Also **Shape 8 (Gamified quiz)** — archetype result *is* the identity card.

### 1.4 — Background Pre-generation via Convex Scheduler

**Mechanic.** When intake is complete (before the HealthKit prompt), fire-and-forget `ctx.scheduler.runAfter(0, api.onboardingActions.generateFullPlan, ...)`. Write to a `starterPlanDrafts` row. By the time the user taps "Build my plan," the row is already 80–100% populated; `useQuery` resolves instantly.
**Files.** `convex/onboardingActions.ts` scheduler call from intake-complete mutation; new `starterPlanDrafts` table in `schema.ts`.
**Assumption dropped.** That generation starts when the user presses "Build." It can start ~20–40s earlier, masked by the HealthKit flow.
**Compounding benefit.** Same pattern for any computed personalisation (macro calc, first-week adjustments) — onboarding latency becomes free background time. Also offline-friendly: a reconnect finds the result already waiting.
**Effort.** Small (Convex scheduler is first-party).
**Best-fit intake shape.** **Shape 2 (HealthKit-first)** — the Apple sheet is free latency mask. Also **Shape 4 (Past-workout-first)**.

### 1.5 — Narrated Analysis (the wait becomes the value)

**Mechanic.** During any irreducible wait, run a Reanimated timeline of 3–5 personalised lines pre-filled from intake: *"Comparing your stats to 412 similar lifters in Norway…"* → *"Matching 3 training days to weekday gaps…"* → *"Writing your first session…"*. No model call. `reduceMotion: 'system'` respected. If generation exceeds 14s, a sixth line appears and on timeout falls back to an archetype (1.3).
**Files.** `components/onboarding/analysis-narration.tsx`, content strings in `lib/onboarding-narration.ts`.
**Assumption dropped.** That the wait has to feel like a wait. It can feel like work being done *for* the user.
**Compounding benefit.** Reusable for every future long-running AI surface (plan regen, recipe search, form-check). Becomes a brand motion signature.
**Effort.** Tiny.
**Best-fit intake shape.** **Shape 8 (Gamified quiz)** ("Analyzing…" is native) and **Shape 7 (Video-first)**.

### 1.6 — HTTP stream via `httpAction` with optimistic first-chunk

**Mechanic.** Abandon the DB-delta relay for this flow. Use `httpAction` that returns a `ReadableStream<Uint8Array>` (white-hat §3 confirms first-class support). Emit a *first chunk* hand-written from intake (`"Hi Sebastian — here's what I've got…"`) before OpenAI is even called, so the client sees bytes in <200ms. No WebSocket hop, no 200ms throttle ceiling.
**Files.** New route in `convex/http.ts`; auth via `auth.addHttpRoutes`. RN uses `fetch` + `Response.body.getReader()` (no new deps).
**Assumption dropped.** That every write must flow through the reactive query system. One-shot streams are lower-latency over HTTP.
**Compounding benefit.** The `httpAction` skeleton becomes the template for any latency-critical surface — voice upload (Shape 9), live form-check. Also escapes the throttled-DB-write cost tax forever.
**Effort.** Medium (auth wiring).
**Best-fit intake shape.** **Shape 9 (Voice-first)** (audio upload + streaming STT on the same surface) and **Shape 1**.

---

## Thread 2 — PostHog instrumented the wrong thing

The bureaucratic fix is "move tracking to onPress." These preventions drop the assumption that **events are derived from the component tree**.

### 2.1 — Funnel-first event schema

**Mechanic.** Define events as *funnel gates*, not screens: `intake_started → intake_goal_set → … → plan_generation_started → plan_first_byte → plan_first_exercise_visible → plan_continue_tapped → paywall_presented → trial_started → paid_converted`. The full list lives as a TypeScript union in `lib/analytics-events.ts`; `track()` is generic-constrained by the union so adding an event outside the funnel won't compile.
**Files.** `lib/analytics-events.ts`, `lib/analytics.ts`.
**Assumption dropped.** That PostHog events are a backend-of-the-UI. They're a *model of the user's decision tree*.
**Compounding benefit.** Analytics become typechecked — refactors can't accidentally rename or drop events. Only prevention that makes the funnel a compile-time concern.
**Effort.** Tiny (schema) + small (discipline).
**Best-fit intake shape.** All; pairs especially with **Shape 6 (Reverse paywall)** where the funnel is long and drift is expensive.

### 2.2 — Rage-quit as a first-class event

**Mechanic.** `AppState` + a short-lived mount timestamp. If the app backgrounds within 3s of a screen mount, fire `rage_quit_<screen>`. If it backgrounds during plan generation and doesn't return within 60s, fire `abandoned_during_generation`. Implemented once in `hooks/use-rage-quit-tracking.ts`.
**Files.** New hook; applied in `(auth)/_layout.tsx` and onboarding screens.
**Assumption dropped.** That success and abandonment are the only two outcomes. *Furious abandonment within 3s* is a third category — the one correlating with 1-star reviews.
**Compounding benefit.** Catches rage outside onboarding too (rest-timer mis-fire, paywall). Becomes a product-wide annoyance detector.
**Effort.** Tiny.
**Best-fit intake shape.** All, especially ones with a long wait (Shape 1, Shape 6, Shape 9).

### 2.3 — Forward-only instrumentation

**Mechanic.** Fire only positive events (next-button tap, mutation success, paywall presentation). Compute drop-off as PostHog funnel query: `users(step_{n+1}) / users(step_n)`. Never fire "completed" events; silence *is* drop-off, not success.
**Files.** Remove `onUnmount`-style helpers from `lib/analytics.ts`; onboarding screens fire on explicit user actions only.
**Assumption dropped.** That you need both "entered" and "completed" events. "Entered n" + "Entered n+1" already encodes completion by subtraction.
**Compounding benefit.** Halves event volume (and PostHog bill). Removes a class of double-fire bugs.
**Effort.** Tiny (removing code).
**Best-fit intake shape.** **Shape 5 (Nordic-local)** — minimalist all the way down.

### 2.4 — A/B the event schema itself

**Mechanic.** For the first two weeks, ship two parallel schemas: `v1_*` (screens) and `v2_*` (funnel gates). Both fire. Compare which surfaces divergence first; deprecate the loser. Add a nightly Convex cron (`internal.analytics.validateSchema`) that compares event counts to invariants ("count(intake_started) ≥ count(paywall_presented)") and alerts on violation.
**Files.** `lib/analytics.ts` dual-dispatch; `convex/analytics.ts` nightly cron; Slack webhook.
**Assumption dropped.** That schema is decided once. It's a hypothesis, testable against its own data.
**Compounding benefit.** Validator becomes a permanent immune system — any PR that double-counts or breaks ordering invariants trips the alarm.
**Effort.** Medium.
**Best-fit intake shape.** Any.

### 2.5 — Canary Walker (synthetic weekly user)

**Mechanic.** A Maestro flow (`.maestro/onboarding-canary.yaml`) runs weekly from CI, walking onboarding as a fixed fake user with a `canary_run_id` super-property. A Convex cron compares observed counts to expected; divergence emails Sebastian. Product or analytics changes that break the funnel are detected within 7 days, not 6 weeks.
**Files.** `.maestro/onboarding-canary.yaml`, `scripts/canary-validate.ts`, GitHub Action.
**Assumption dropped.** That you'll notice funnel drift by eyeballing dashboards. You won't. Machines will.
**Compounding benefit.** Doubles as a release smoke test. Any Expo SDK bump that silently breaks onboarding is caught before users see it.
**Effort.** Medium (Maestro already installed per `CLAUDE.md`).
**Best-fit intake shape.** **Shape 5 (Nordic-local)** — simplest flow, most reliable canary.

### 2.6 — Session-replay-first event design

**Mechanic.** For the first 50 real users, sample session replay at 100%. *Watch the recordings manually* before authoring any new event. Events are derived from observed behaviour — if half of users tap back after seeing the plan, `plan_back_tapped` is an event. `docs/analytics/events-and-why.md` cites a recording or metric for every event.
**Files.** PostHog config; `docs/analytics/events-and-why.md`.
**Assumption dropped.** That analytics is an engineer-authored abstraction. It's a summary of things users actually do, derived from watching them.
**Compounding benefit.** Every future analytics PR must cite a recording; arbitrary additions get gated. The doc becomes a user-behaviour knowledge base for the team.
**Effort.** Small (mostly discipline + ~4 hours/week of watching).
**Best-fit intake shape.** **Shape 4 (Past-workout-first)** and **Shape 9 (Voice-first)** — novel enough you can't guess their events.

---

## Thread 3 — HealthKit denial blind spot

The bureaucratic fix is "add a fallback prompt branch." These preventions drop the assumption that **HealthKit is a prerequisite for personalisation**.

### 3.1 — Design for the denier; accepter is a bonus

**Mechanic.** Invert the design centre. Assume 0% HealthKit acceptance. Build a 5-question manual intake that alone produces a plan worth shipping. Then bolt HealthKit on as an *optimisation layer* after the plan is already shown: "Connect Apple Health so I can auto-adjust each week from your actual workouts."
**Files.** Reorder `app/onboarding/*.tsx`; remove HealthKit from prerequisites; rewrite copy.
**Assumption dropped.** That HealthKit is the personalisation engine. It's a *refinement* engine.
**Compounding benefit.** Manual cohort is first-class, which means the Android port (post-MVP) is 90% designed — HealthKit was the iOS-only risk factor.
**Effort.** Small.
**Best-fit intake shape.** **Shape 5 (Nordic-local)** (three toggles already design for manual) and **Shape 3 (Goal-as-commitment)**.

### 3.2 — Fitbull-owned Preview sheet before Apple's

**Mechanic.** Before invoking Apple's permission sheet, show a Fitbull-owned screen listing each read category with a one-line reason: *"Weight — so progression charts use real numbers" / "Heart rate — so rest days detect overtraining" / "Workouts — so we don't double-count your runs."* Two buttons: **Continue — connect Apple Health** and **Not now — enter manually**. Apple's sheet only fires on Continue.
**Files.** New `app/onboarding/healthkit-preview.tsx`; replace direct `requestAuthorization()` call.
**Assumption dropped.** That Apple's sheet is where you sell the value. Apple's sheet is terse by design; we need our own surface to explain *why*.
**Compounding benefit.** Reusable for any future platform permission (Notifications, Microphone for Shape 9) — one pattern for "explain, then ask." Reduces accidental deny rate.
**Effort.** Tiny.
**Best-fit intake shape.** **Shape 2 (HealthKit-first)** — the literal reason this exists.

### 3.3 — Symmetry of quality (denial is an equal path)

**Mechanic.** Copy is rewritten symmetric: *"Your plan is personalised either way — connecting Apple Health just saves you 4 questions."* The manual fallback takes ~45s (4 numeric fields + segmented sex). `buildStarterPlanPrompt` takes a `dataSource: "healthkit" | "manual"` branch; the manual branch instructs the model *"stats entered manually — do not infer activity levels, prefer explicit questioning."*
**Files.** `buildStarterPlanPrompt` refactor; `components/onboarding/intake-manual-body.tsx`; copy rewrite.
**Assumption dropped.** That the denier's experience must be worse. If the prompt branch knows, the model can ask for what it's missing.
**Compounding benefit.** The `dataSource` pattern generalises — any piece of personalisation that sometimes lacks input (no RHR yet, no VO2Max yet) gets its own branch. Prompt becomes modular.
**Effort.** Small.
**Best-fit intake shape.** Any with HealthKit (**2**, **7**).

### 3.4 — Delay the ask to day 3 (trust before permission)

**Mechanic.** Don't ask for HealthKit during onboarding. Ship manual-only intake. On Day 3 (after the first logged workout), a coach-message suggests: *"Now that we've got one workout in — want me to pull the rest from Apple Health? It'll auto-log future ones."* Ask at *highest demonstrated intent*, not lowest.
**Files.** Remove HealthKit from onboarding; `hooks/use-healthkit-nudge.ts` triggered by first-workout-logged; seed message in `convex/chatActions.ts`.
**Assumption dropped.** That HealthKit is needed for the *first* plan. It's needed for the *second* onwards.
**Compounding benefit.** Day-3 acceptance is dramatically higher than day-0 (users who already logged have demonstrated the behaviour HealthKit enhances). Future *write* permission ("write workouts back") is a much smaller ask when read is already granted.
**Effort.** Small.
**Best-fit intake shape.** **Shape 6 (Reverse paywall)** — the 7-day window houses the day-3 nudge. Also **Shape 4**.

### 3.5 — Trade: HealthKit = skip 4 questions

**Mechanic.** Frame HealthKit as a shortcut, not a tax: *"Connect Apple Health and skip the next 4 questions. Or enter them yourself — your call."* The manual path is visibly 4 screens; the HealthKit path collapses to 1. Accepting becomes the *faster* path; denial is not punished, just takes 4 screens.
**Files.** Copy rewrite; "skip 4 screens" indicator UI.
**Assumption dropped.** That HealthKit permission is a tax on the user. It's a convenience exchange — permission traded for time.
**Compounding benefit.** Every future permission (Notifications, Microphone) can use the same "skip this workflow by granting" framing. Becomes a design pattern.
**Effort.** Tiny.
**Best-fit intake shape.** **Shape 5 (Nordic-local)** (the 90-second promise gives HealthKit a concrete shortcut value) and **Shape 8**.

### 3.6 — MVI (Minimum Viable Inputs) only

**Mechanic.** Identify the smallest set that produces a genuinely good first plan: **goal, days/week, experience, and one of {HealthKit OR weight+sex+age}**. Height is optional (used only for BMI, which doesn't gate the plan). Equipment is deferred to the first workout ("tap what you have" in-context). Intake collapses to 3 questions + 1 permission-or-stats screen.
**Files.** `convex/schema.ts` splits profile fields into `required` / `optional`; `buildStarterPlanPrompt` treats optional as "infer conservatively."
**Assumption dropped.** That data completeness equals plan quality. The 5th data point adds <5% to plan quality.
**Compounding benefit.** Shorter intake → higher completion → more users reach paywall. Optional-field model is how new fields get added later without re-onboarding (injuries can appear weeks in via coach message).
**Effort.** Small.
**Best-fit intake shape.** **Shape 5**, **Shape 3** — already minimal; this is their data model.

---

## Compound stack — reinforcing preventions across all three threads

**(A) 1.4 Background pre-generation** — plan is generated *while* intake happens, eliminating most of the wait.
**(B) 1.3 Precomputed archetypes** — deterministic fallback if the scheduler or OpenAI fails; also the shape the scheduler's output slots into.
**(C) 1.1 Three-Card Reveal** — whatever generation state exists when the user arrives, three cards mask it with always-instant content.
**(D) 2.1 Funnel events + 2.2 rage-quit** — now measure perceived latency via `time_between(plan_generation_started, plan_continue_tapped)` and `rage_quit_aha`. Stack's success becomes quantifiable from day 1.
**(E) 3.1 Design for the denier** — archetype + three-card both function perfectly with manual inputs. HealthKit becomes optimisation, not prerequisite.

**Why they compound.** Background pre-gen removes ~10–14s of latency; archetype fallback removes the remaining long tail; three-card reveal removes perceived wait; funnel events detect if any of this regresses; designing-for-the-denier means the archetype pool doesn't need HealthKit-enriched variants, keeping it small and maintainable. Net: time-to-first-exercise-visible <2s regardless of HealthKit, network, or model latency.

---

## The "alternative future" prevention

**1.3 — Precomputed archetype plans.** If we adopt it, Fitbull's identity shifts from *"AI generates for you"* to *"AI guides you through a curated library."* That re-shapes:

- **Aha moment** — a plan *match* in 600ms, not a plan *generation* in 14s.
- **Explore tab** — first-class browsable content from day one (archetypes with philosophies).
- **Paywall framing** — "Unlock 20 plans designed by coaches, AI-personalised to you" is a stronger value prop than "Unlock AI plan generation."
- **OpenAI cost** — drops ~90%; only the name/caption call is LLM-driven per user.
- **Reliability** — if OpenAI is down, onboarding still completes with the unmodified archetype.
- **Nordic positioning** — curated-by-humans beats LLM-generated-from-scratch in a market skeptical of AI theatre.

This is the prevention that stops asking "how do we make the generator fast?" and asks "why are we generating?"

---

## The single most non-obvious prevention

**2.6 — Session-replay-first event design.**

Non-obvious because it inverts the engineering instinct (define events up front, instrument as you build). Every other analytics prevention starts from a model of what we think users do; this one starts from *watching what they actually do* and derives the events.

It would have caught the pre-mortem's failure cold: watching 50 recordings in week 1 would have revealed the 14-second blank screen immediately. You don't need a correct event schema to *see* a user sitting in silence — you need to watch them. The bureaucratic version of analytics insists on metrics; the non-obvious version insists on watching humans.

Its compounding benefit is cultural. Once the team habitually cites a session recording when proposing an event, analytics stops being a tax on shipping and becomes an evidence-based discipline. That is a quiet re-wiring of how the product gets built.

---

## Summary by thread

| Thread | Tiny | Small | Medium |
|---|---|---|---|
| 1 — Streaming illusion | 1.5 Narrated Analysis | 1.1 Three-Card · 1.4 Scheduler · 1.3 Archetypes¹ | 1.2 Structured Outputs · 1.6 httpAction |
| 2 — Wrong events | 2.1 Funnel schema · 2.2 Rage-quit · 2.3 Forward-only | 2.6 Session-replay-first | 2.4 Schema A/B · 2.5 Canary Walker |
| 3 — HealthKit denial | 3.2 Preview sheet · 3.5 Trade framing | 3.1 Design for denier · 3.3 Symmetry · 3.4 Day-3 · 3.6 MVI | — |

¹ Archetypes are medium if you count authoring 20 plans; tiny at runtime.

**Intake-shape convergence (aggregated fits).** Shape 5 (Nordic-local) appears in 9 prevention fits; Shape 2 (HealthKit-first) in 4; Shape 3 (Goal-as-commitment) in 3. The Green Hat view converges: the onboarding that survives the pre-mortem looks more like **Shape 5 stacked with elements of Shape 2 and Shape 3** than like Shape 1, 8, or 9.

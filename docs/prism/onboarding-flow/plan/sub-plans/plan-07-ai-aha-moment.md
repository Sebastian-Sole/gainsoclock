# Sub-Plan 07: AI Aha Moment (S7 narrated analysis + S8 aha plan card)

## Dependencies
- **Requires:**
  - plan-00 — OpenAI model abstraction in `convex/openai-config.ts`
  - plan-01 — `onboardingAha` table, `aiSafetyIncidents` table, `userProfile.ahaGenerationCount` + `lastAhaAt`, `ai_coach_inference` consent gate, `internal.onboardingInternal.writeAhaDelta` stub
  - plan-02 — subscription state machine fields consumed by downstream paywall
  - plan-03 — analytics + server `captureServer`
  - plan-06 — `userProfile` populated with sanity-bounded stats + `dataSource`
- **Blocks:**
  - plan-08 — paywall interstitial routes from S8 Continue; `plan_visible` feeds funnel measurement
  - plan-09 — post-paywall activation checklist depends on aha being ready when user lands on `/(tabs)`

## Objective
Ship the single-workout Structured Outputs streaming "aha" moment — the conversion payoff after the intake. The server action `generateAhaWorkout` composes a safety-hardened prompt from the user's profile, calls OpenAI with `response_format: json_schema` and `strict: true` (no tool calls), streams the generated workout into the dedicated `onboardingAha` row at a 250ms throttle with full-JSON overwrite each tick, enforces moderation + sanity bounds + 16+ + rate limits + medical boundaries + no-tools-discipline, and falls back to a static safety-net session on repeated failure. The client ships S7 (narrated analysis) and S8 (aha reveal with carousel tiles, editable intake chips, medical disclaimer), both VoiceOver-aware and Reduce-Motion-aware. Three-phase latency budget (p50 3.5s / p95 8s / p99 14s) is enforced on the client with graceful degradation.

## Context

### Stack facts
- **Backend:** Convex. New file `convex/onboardingActions.ts` (NOT `convex/chatActions.ts` — chat has a subscription gate; aha is free during onboarding). Actions use `"use node"` directive to access the OpenAI SDK.
- **OpenAI SDK:** `openai` npm package, already a project dependency via chat. Structured Outputs + streaming via `client.chat.completions.create({ stream: true, response_format: { type: "json_schema", json_schema: { ..., strict: true } } })`.
- **Moderation:** `openai.moderations.create()` — a separate small model that returns flagged categories.
- **Runtime:** Expo SDK 54, React Native 0.81, React 19, React Compiler on. Reanimated v3 for S7 animated lines. `useAnimatedStyle` / `useSharedValue` must obey worklet contract — `useSharedValue` declarations above any conditional branches (Performance #2).
- **Streaming consumer:** `useQuery(api.onboarding.getAha, { generationId })` — single row; reactive; reads `status: "streaming" | "complete" | "failed"`.

### Coding conventions that apply here
- No `any` outside the explicit `onboardingAha.workout: v.any()` from plan-01's schema. Client parses that value through a runtime narrow (`parseAhaWorkout`) into a typed shape.
- No `enum`. Status + reasons are literal unions.
- Every Convex public handler opens with `getAuthUserId`. `userId` is never a client arg. Internal mutations called by actions/crons may accept `userId`.
- Wrapper-only imports: OpenAI is only imported in `convex/onboardingActions.ts` and `convex/chatActions.ts`. Never in app code.
- Accessibility: S7 `announceForAccessibility` queued via `isScreenReaderEnabled` (NOT `accessibilityLiveRegion` — Android-only). S8 skeleton-until-complete; single summary announcement on `status: "complete"`.
- Stable keys on React lists (React Compiler + Performance #2).
- Reduce-Motion hook from plan-03 consumed by every animated component.

### Gate decisions + themes that apply
- **D5:** single-workout aha. No multi-week plan here (plan-09 owns that in-app experience).
- **Theme G (AI safety):** system prompt verbatim; sanity bounds; goal literal union; schema safety; 16+ gate; rate limit; safety-net; no tools; model abstraction; moderation; medical disclaimer.
- **Theme H (latency):** three-phase p50/p95/p99 with 14s hard-kill.
- **Theme I (streaming):** 250ms throttle; full JSON overwrite each tick; `generationId` idempotency; dedicated `onboardingAha` row.
- **AI-Safety #1:** schema adds `exerciseId` enum bound to library, warmup+cooldown required, volume cap per tier, duration cap per tier.
- **AI-Safety #2:** full system prompt committed verbatim as a file-level constant.
- **AI-Safety #3 / Security CR5:** profile passed to OpenAI as a JSON user-message block, NOT interpolated into the system prompt. `goalValidator` literal-union inputs.
- **AI-Safety #4:** sanity bounds re-verified at action entry before prompt build.
- **AI-Safety #5:** aha action MUST NOT pass `tools` / `tool_choice`. Do not import `TOOLS` from `chatActions.ts`. Phase 10 code-review gate checks this.
- **AI-Safety #6:** medical disclaimer persistent on aha card + methodology page. System prompt forbids "cure/prevent/treat" language.
- **AI-Safety #7:** hard 16+ age gate; defense-in-depth clause in system prompt for `<18`.
- **AI-Safety #8:** rate limit — lifetime 5 on `userProfile.ahaGenerationCount`; per-user-per-30s on `userProfile.lastAhaAt`. On cap-hit return last completed row.
- **AI-Safety #9:** static safety-net session in `lib/onboarding-fallback-session.ts`. Served on 2× retry failure OR p99 14s hard-kill.
- **AI-Safety #10:** `convex/openai-config.ts` exports `OPENAI_AHA_MODEL` + `OPENAI_AHA_FALLBACK_MODEL` (plan-00 shipped). Retry on fallback before surfacing failure.
- **AI-Safety #11:** `openai.moderations.create()` on `intro` before commit. Flagged → replace with static intro + log to `aiSafetyIncidents`.
- **AI-Safety #12:** `generateAhaWorkout` action gates on `ai_coach_inference` consent row.
- **Convex-Realtime C1:** streaming 250ms throttle; full-overwrite; payload ~500-800 tokens.
- **Convex-Realtime C4:** `generationId` idempotency — in-flight < 60s → return row; ≥ 60s → mark failed and proceed; `"complete"` → return existing.
- **Convex-Realtime C11:** skeleton-until-complete render on client. No partial-JSON parser.
- **Mobile-A11y #1:** `announceForAccessibility` queued; gated on `isScreenReaderEnabled`. VO-active → skip animation, render all lines immediately with single polite live region; extended timeout.
- **Mobile-A11y #2:** S8 no live region during stream; single announcement on `status: "complete"`.
- **Mobile-A11y #7:** S8 error state uses `accessibilityLiveRegion="assertive"` + `announceForAccessibility` + `setAccessibilityFocus` on retry button.
- **Mobile-A11y #10:** Reanimated text via `Animated.createAnimatedComponent(Text)` where `Text` is theme-token. Dynamic Type + Accessibility XXL.
- **Mobile-A11y #14:** Reduce Transparency → opaque `bg-background` fallback on `BlurView`.
- **Security #6:** OpenAI `refusal: "..."` shape → treat as failure; serve safety-net.
- **Security #7:** assert `process.env.OPENAI_API_KEY` at action entry with typed error; never log keys.
- **Performance #2:** `react-compiler-healthcheck` gate on `components/onboarding/*`.
- **Performance #9:** first pixel ≤ 500ms after `plan_first_byte`; ≥ 55fps avg animation.
- **UX #5:** LLM intro — 2-3 sentences, recommend-register, references input, no possessive ownership, no body-shaming, no medical framing.
- **UX #7:** carousel reintroduced — three collapsed tiles below aha (calorie target / training schedule / plan summary).

### Files this sub-plan touches
- **New (Convex):**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/onboardingActions.ts`
  - (plus filling the body of `internal.onboardingInternal.writeAhaDelta` stub from plan-01)
- **Modified (Convex):**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/onboarding.ts` — add public `getAha({ generationId })` query; add public `rekickAha({ generationId })` mutation
  - `/Users/sebastiansole/Documents/gainsoclock/convex/onboardingInternal.ts` — implement `writeAhaDelta` body; add `markAhaFailed`
- **New (routes):**
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/analysis.tsx` (S7)
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/aha.tsx` (S8)
  - `/Users/sebastiansole/Documents/gainsoclock/app/methodology.tsx`
- **New (components):**
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/aha-plan-reveal.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/aha-carousel-tiles.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/aha-intake-chip.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/narrated-line.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/medical-disclaimer.tsx`
- **New (utilities):**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/onboarding-fallback-session.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/lib/aha-schema.ts` (client-side parser + literal union types)
  - `/Users/sebastiansole/Documents/gainsoclock/lib/bmr.ts` (Mifflin-St Jeor client-side for calorie tile)
- **New (assets / data):**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/exerciseLibrary.ts` — thin enum-style export of allowed `exerciseId` strings per experience tier. If a richer library exists, import from it; otherwise this file is the source of truth for Phase 7.
- **Env vars:**
  - `OPENAI_API_KEY` (exists)
  - `OPENAI_AHA_MODEL` (optional, defaults in plan-00's config)
  - `OPENAI_AHA_FALLBACK_MODEL` (optional)

### Data contracts

**System prompt (committed verbatim as a file-level constant in `convex/onboardingActions.ts`):**

```
You are Fitbull's onboarding coach. Generate ONE training session based on the user's profile.

MEDICAL BOUNDARY: You are not a doctor. Never diagnose, prescribe medical treatment, or discuss injury rehabilitation. If the profile suggests pain, injury, pregnancy, or a medical condition, output a single gentle mobility session with coachingNote recommending the user consult a qualified professional before training.

AGE & VOLUME: If ageYears < 18, reduce volume, never prescribe heavy barbell work, and recommend coaching in coachingNote. For experience === "beginner": use RPE-based intensity cues in coachingNote (e.g. "RPE 6 — last 2 reps should feel challenging but clean"); do not prescribe absolute load (kg/lb); forbid olympic lifts, plyometrics, unspotted heavy barbell.

LANGUAGE: intro is 2-3 sentences, second-person address (not possessive), recommend-register ("I'd start with", "Given your", "Since you"). Must reference at least one user input (goal, experience, or days). No possessive ownership ("your plan"), no weight-referencing, no body-shaming, no medical framing, no superlatives, no emojis.

PRIVACY: Never repeat the user's exact weight, height, or age in intro. Never reference HealthKit-derived fields beyond what is in the profile payload.

EXERCISE SELECTION: Select exercises only from the provided allowedExerciseIds list. If empty, output an error. Warmup (2-3 movements) and cooldown (2-3 movements) are required.

VOLUME CAPS: beginner: duration 15-45 min, sets*reps <= 50 per exercise; returning: 20-60 min, <= 80; experienced: 20-90 min, <= 120.
```

**User message (JSON block, NOT prompt-interpolated):**
```json
{
  "goals": ["stronger"],
  "primaryGoal": "stronger",
  "experience": "returning",
  "trainingDaysOfWeek": [1,3,5],
  "ageYears": 32,
  "allowedExerciseIds": ["squat-barbell","deadlift-conventional", ...]
}
```
`allowedExerciseIds` is tier-filtered by `convex/exerciseLibrary.ts` helper before the call.

**Workout JSON schema (response_format.json_schema.schema):**
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["intro","warmup","workout","cooldown"],
  "properties": {
    "intro": { "type": "string" },
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
      "required": ["name","targetMuscleGroups","durationMinutes","exercises"],
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
      "required": ["exerciseId","sets","reps","restSeconds","coachingNote"],
      "properties": {
        "exerciseId": { "type": "string", "enum": [...allowedExerciseIds] },
        "sets": { "type": "integer", "minimum": 1, "maximum": 10 },
        "reps": { "type": "integer", "minimum": 1, "maximum": 30 },
        "restSeconds": { "type": "integer", "minimum": 30, "maximum": 300 },
        "coachingNote": { "type": "string" }
      }
    }
  }
}
```

**Action signature:**
```ts
export const generateAhaWorkout = action({
  args: { generationId: v.string() },
  handler: async (ctx, { generationId }) => { /* see Implementation */ }
});
export const rekickAha = mutation({
  args: { generationId: v.string() },
  handler: async (ctx, { generationId }) => { /* foreground recovery */ }
});
export const getAha = query({
  args: { generationId: v.string() },
  handler: async (ctx, { generationId }) => { /* return row */ }
});
```

**Streaming loop (action body, pseudocode):**
```ts
"use node";
const userId = await getAuthUserId(ctx); if (!userId) throw "Not authenticated";
if (!process.env.OPENAI_API_KEY) throw "OpenAI key missing";

// consent gate
const consents = await ctx.runQuery(internal.onboarding.getConsentsForUser, { userId });
if (!consents.ai_coach_inference?.granted) throw "ai_coach_inference consent required";

// profile load + sanity bounds re-verify
const profile = await ctx.runQuery(internal.onboarding.getProfileForUser, { userId });
assertSanityBounds(profile);
assertAgeGate(profile);

// rate limit
if ((profile.ahaGenerationCount ?? 0) >= 5) {
  return await findLastCompletedRow(userId); // idempotent cap-hit
}
if (profile.lastAhaAt && Date.now() - Date.parse(profile.lastAhaAt) < 30_000) {
  return await findLastCompletedRow(userId);
}

// idempotency
const existing = await findByGenerationId(userId, generationId);
if (existing) {
  if (existing.status === "complete") return existing;
  if (existing.status === "streaming" && Date.now() - Date.parse(existing.updatedAt) < 60_000) return existing;
  await markStale(existing._id);
}

// create initial row status: "streaming"
await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
  userId, generationId, status: "streaming", startedAt: nowIso(),
});
await ctx.runMutation(internal.onboarding.incrementAhaCount, { userId });

const allowedExerciseIds = filterAllowedByTier(profile.experience);
const schema = buildSchema(allowedExerciseIds);

let fullAccumulator = "";
let lastFlushAt = 0;
let modelUsed = OPENAI_AHA_MODEL;

async function tryWithModel(model: string) {
  const stream = await openai.chat.completions.create({
    model,
    stream: true,
    response_format: { type: "json_schema", json_schema: { name: "AhaSession", schema, strict: true } },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ ...profileBlock, allowedExerciseIds }) },
    ],
    // NOTE: NO tools parameter. NO tool_choice. Do not paste from chatActions.ts.
  });
  for await (const chunk of stream) {
    // handle refusal shape
    if (chunk.choices[0]?.delta?.refusal) {
      throw new RefusalError(chunk.choices[0].delta.refusal);
    }
    const delta = chunk.choices[0]?.delta?.content ?? "";
    fullAccumulator += delta;
    // parse attempt — tolerant; wait for valid JSON shape
    const parsed = tryParse(fullAccumulator);
    if (parsed && Date.now() - lastFlushAt > 250) {
      await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
        userId, generationId, workout: parsed, status: "streaming", updatedAt: nowIso(),
      });
      lastFlushAt = Date.now();
    }
  }
  const final = JSON.parse(fullAccumulator);
  // post-parse safety: volume caps, duration cap, exerciseId membership
  assertPostParseSafety(final, profile);
  // moderation on intro
  const mod = await openai.moderations.create({ input: final.intro });
  if (mod.results[0]?.flagged) {
    await logAiSafetyIncident(userId, "moderation_flag", JSON.stringify(mod.results[0]));
    final.intro = "Here's your first session — let's start.";
  }
  return final;
}

try {
  const final = await tryWithModel(OPENAI_AHA_MODEL);
  await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, {
    userId, generationId, workout: final, intro: final.intro, status: "complete", completedAt: nowIso(),
  });
  await captureServer({ name: "plan_visible", props: { latencyMs: /* computed */ } }, userId);
  return;
} catch (err) {
  // retry on fallback model once
  try {
    const final = await tryWithModel(OPENAI_AHA_FALLBACK_MODEL);
    await ctx.runMutation(internal.onboardingInternal.writeAhaDelta, { ..., workout: final, intro: final.intro, status: "complete", completedAt: nowIso() });
    return;
  } catch (err2) {
    // record failure; client will serve safety-net on p99 hard-kill OR 2× retry
    await ctx.runMutation(internal.onboardingInternal.markAhaFailed, { userId, generationId, reason: String(err2) });
    throw err2;
  }
}
```

**Post-parse safety asserts:**
- `sets * reps > 50` (beginner) / `> 80` (returning) / `> 120` (experienced) → reject.
- `durationMinutes` outside tier bounds → reject.
- Any `exerciseId` not in `allowedExerciseIds` → reject.
- Rejection path: log to `aiSafetyIncidents`, replace workout with fallback session, `status: "complete"`.

**`lib/onboarding-fallback-session.ts`:**
```ts
export const FALLBACK_SESSION = {
  intro: "Here's your first session — let's start.",
  warmup: { exercises: [/* 2 bodyweight mobility */] },
  workout: {
    name: "Starter bodyweight",
    targetMuscleGroups: ["lower-body","upper-body","core"],
    durationMinutes: 20,
    exercises: [
      { exerciseId: "bodyweight-squat", sets: 3, reps: 10, restSeconds: 60,
        coachingNote: "RPE 6 — last 2 reps should feel challenging but clean." },
      { exerciseId: "push-up", sets: 3, reps: 8, restSeconds: 60,
        coachingNote: "Modify on knees if needed." },
      { exerciseId: "inverted-row", sets: 3, reps: 8, restSeconds: 60,
        coachingNote: "Use a sturdy table; keep the body straight." },
    ],
  },
  cooldown: { exercises: [/* 2 stretches */] },
};
```

**`lib/aha-schema.ts`:**
```ts
export type AhaExercise = { exerciseId: string; sets: number; reps: number; restSeconds: number; coachingNote: string; };
export type AhaWorkout = {
  intro: string;
  warmup: { exercises: AhaExercise[] };
  workout: { name: string; targetMuscleGroups: string[]; durationMinutes: number; exercises: AhaExercise[] };
  cooldown: { exercises: AhaExercise[] };
};
export function parseAhaWorkout(raw: unknown): AhaWorkout | null { /* runtime narrow */ }
```

**S7 narrated analysis — `app/onboarding/analysis.tsx`:**
- Copy (three lines, Strava-dry per UX #14):
  1. *"Looking at your inputs…"*
  2. *"Fitting 3 sessions into your week…"*
  3. *"Writing your first session…"*
- Kick off the action on S6 submit SUCCESS (plan-05 has already routed here). Generate a `generationId` client-side via `newGenerationId()` and store in draft. Call `api.onboarding.generateAhaWorkout({ generationId })` via `useAction`.
- Subscribe to `useQuery(api.onboarding.getAha, { generationId })`.
- **Latency budget (Theme H):**
  - t+3500ms (p50): if still streaming, render a fourth line *"Refining for your training days…"*.
  - t+8000ms (p95): surface a retry affordance (`Retry` button) while letting the server action continue.
  - t+14000ms (p99): abort; client-side set `aha status` to local-fallback and route to S8 with the safety-net session.
- **VoiceOver path (Mobile-A11y #1):**
  - Detect `isScreenReaderEnabled()` on mount.
  - If true: skip fade animation (render all lines immediately inside one `<View>` with `accessibilityLiveRegion="polite"` on iOS via a library polyfill OR use `AccessibilityInfo.announceForAccessibility` queued); extend timeout so SR user finishes reading before routing to S8.
  - If false: fade each line in 800ms apart via Reanimated; `useReduceMotion()` disables the fade.
- **Capture:**
  - `plan_generation_started` — on S6 submit (fire from plan-05 already); on S7 mount, `screen_render_ms { screen: "analysis", ms }`.
  - `plan_first_byte { latencyMs }` — when `useQuery` first sees a non-null `workout` (delta arrived).
  - `plan_visible` — on S8 mount (post-route).
  - `plan_generation_failed { reason }` — on hard-kill or retry exhaustion.
  - `plan_fallback_shown` — when safety-net rendered.

**S8 aha reveal — `app/onboarding/aha.tsx`:**
- Reads `useQuery(api.onboarding.getAha, { generationId })`.
- **Render strategy (Convex-Realtime C11):**
  - `status === "streaming"`: render `<AhaPlanSkeleton>` (non-parsing). `accessibilityElementsHidden={true}` on the streaming container.
  - `status === "complete"`: unmount skeleton, render `<AhaPlanReveal>` with the fully-parsed workout. Announce once via `announceForAccessibility("Your first session: {name}, {durationMinutes} minutes, {exerciseCount} exercises. Double-tap to continue.")`. `AccessibilityInfo.setAccessibilityFocus(firstHeadingRef)`.
  - `status === "failed"`: render error state with `accessibilityLiveRegion="assertive"` + `announceForAccessibility(ERROR_COPY.AHA_LLM)` + `setAccessibilityFocus(retryButtonRef)`.
- **Medical disclaimer** (persistent footer): *"General fitness guidance — not medical advice. Talk to a qualified professional before starting if you have injuries, pregnancy, or heart conditions."* Links to `/methodology`.
- **Carousel tiles (UX #7)** via `<AhaCarouselTiles>`: three collapsed tiles below the workout:
  1. Calorie target — computed client-side via `lib/bmr.ts` (Mifflin-St Jeor; requires weight + height + age; if `biologicalSex` missing, tile degrades to *"Add weight + height to see your calorie target"* — lazy-collect sex on tile tap per UX #15).
  2. Training schedule — mirrors `trainingDaysOfWeek`.
  3. Plan summary — one-sentence paraphrase of the aha intro.
  Each tile `accessibilityRole="button"`, expandable. Reduce-Motion disables expand animation.
- **Editable intake chips** via `<AhaIntakeChip>`: chips for goal, experience, days, weight, height. `accessibilityLabel` includes current value ("Goal: Stronger"). Tap navigates to the relevant intake screen to edit, then returns to S8 and re-generates via `generateAhaWorkout({ generationId: newGenerationId() })` — subject to the 30s debounce + lifetime 5 cap.
- **Continue CTA:** `router.push("/onboarding/paywall")` — plan-08 owns the paywall.
- **React Compiler healthcheck (Performance #2):** stable keys on exercises (`exercise.exerciseId`), no `.value` reads during render, `useSharedValue` declarations above conditionals. `npx react-compiler-healthcheck app/onboarding/aha.tsx components/onboarding/aha-plan-reveal.tsx` — must be green.

**Mifflin-St Jeor (`lib/bmr.ts`):**
```ts
export function mifflinStJeorBmr({ weightKg, heightCm, ageYears, sex }:
  { weightKg: number; heightCm: number; ageYears: number; sex: "male" | "female" }): number;
// BMR = 10*wKg + 6.25*hCm - 5*ageYears + (sex === "male" ? 5 : -161)
export function approxMaintenanceCalories(bmr: number, activityLevel: "sedentary" | "moderate" | "active"): number;
```
- Activity level hard-coded to `"moderate"` in V1 (per master plan §3.3 — this is a tile-display only; no funnel impact).
- Note: `activityLevel` is a ForbiddenKey in `lib/analytics.ts`; this value must never leak to PostHog.

**`convex/exerciseLibrary.ts`:**
- Export `ALLOWED_EXERCISES: Record<Experience, readonly string[]>`.
- Tier-filtered: beginners forbid olympic lifts, plyos, heavy barbell; returning allow dumbbell/barbell moderate; experienced allow full set.
- If a richer library exists elsewhere in the codebase, import and wrap. Otherwise ship a minimal seed list (50+ ids across tiers).

### Gotchas (from reviews, pulled inline)

- **AI-Safety #5:** do NOT import `TOOLS` from `chatActions.ts`. Do NOT pass `tools:` or `tool_choice:`. Pasting from chat is the dominant failure mode.
- **AI-Safety #3:** profile goes in a user-role JSON message, not interpolated into the system prompt string. `goal` is validated literal union before prompt construction (plan-01).
- **AI-Safety #11:** moderation on `intro` ONLY. Workout body is schema-constrained — moderating its free-text `coachingNote` fields is not required for V1, but log flagged incidents if observed.
- **Convex-Realtime C4:** 60s staleness rule — without it, background-to-foreground races double-spend.
- **Convex-Realtime C11:** no partial-JSON parser. Use `tryParse(fullAccumulator)` that attempts `JSON.parse` and returns null on failure. Do not ship a third-party tolerant parser.
- **Mobile-A11y #1:** `accessibilityLiveRegion` is Android-only. Use `announceForAccessibility` queued after `isScreenReaderEnabled()`.
- **Mobile-A11y #2:** no live region during stream on S8. Single announcement on completion.
- **Mobile-A11y #10:** `Animated.createAnimatedComponent(Text)` where `Text` comes from `components/ui/text.tsx` — theme tokens flow through. Do not use the RN `<Text>` directly or Dynamic Type breaks.
- **Performance #2:** compiler bails on mutated refs during render and conditional hooks. Keep `useSharedValue` declarations at the top of the function.
- **Performance #9:** first pixel ≤ 500ms after first delta; ≥ 55fps. Measure in plan-10.
- **Security #6:** OpenAI `refusal: "..."` may arrive on `delta.refusal`. Treat as failure → safety-net.
- **Security #7:** assert `OPENAI_API_KEY` at action entry; do not log keys.
- **AI-Safety #12 / HealthKit-Privacy CR3:** action refuses if `ai_coach_inference` consent is missing. The skeptic cohort (plan-04) lands here with no consents → action refuses → client renders a copy path that explains + routes back to Settings to enable. Plan-09's Mural item 1 for the skeptic cohort.

## Implementation

1. **Create `convex/exerciseLibrary.ts`.**
   - **What:** `ALLOWED_EXERCISES` per tier. If a library already exists, import + wrap; otherwise ship ≥50 ids.
   - **Test:** `pnpm convex:dev`.

2. **Create `lib/aha-schema.ts`.**
   - **What:** `AhaWorkout` type + `parseAhaWorkout` runtime narrow.
   - **Test:** `npx tsc --noEmit`.

3. **Create `lib/onboarding-fallback-session.ts`.**
   - **What:** static `FALLBACK_SESSION` conforming to `AhaWorkout`.
   - **Test:** `npx tsc --noEmit`.

4. **Create `lib/bmr.ts`.**
   - **What:** Mifflin-St Jeor + maintenance helper.
   - **Test:** `npx tsc --noEmit`; hand-calc one sample value.

5. **Implement `internal.onboardingInternal.writeAhaDelta` + `markAhaFailed` + `incrementAhaCount`.**
   - **File:** `convex/onboardingInternal.ts` (plan-01 shipped the stub).
   - **What:**
     - `writeAhaDelta({ userId, generationId, status?, workout?, intro?, startedAt?, completedAt?, updatedAt? })`: upsert by `(userId, generationId)`. Patch provided fields; always set `updatedAt = nowIso()`.
     - `markAhaFailed({ userId, generationId, reason })`: patch `status: "failed"`, `error: reason`, `updatedAt`.
     - `incrementAhaCount({ userId })`: patch `userProfile.ahaGenerationCount += 1`, `lastAhaAt = nowIso()`.
   - **Test:** `pnpm convex:dev`; REPL.

6. **Extend `convex/onboarding.ts` with `getAha` + `rekickAha`.**
   - **What:**
     - `getAha({ generationId })`: `getAuthUserId`; query by `(userId, generationId)`; return row or null.
     - `rekickAha({ generationId })`: `getAuthUserId`; schedule `ctx.scheduler.runAfter(0, internal.onboardingActions.generateAhaWorkout, { generationId })`.
   - **Test:** `pnpm convex:dev`.

7. **Create `convex/onboardingActions.ts`.**
   - **What:** the full action per Data contracts. Include:
     - `"use node"` directive.
     - `assertEnv("OPENAI_API_KEY")` helper.
     - `SYSTEM_PROMPT` file-level constant — committed verbatim.
     - `assertSanityBounds(profile)` + `assertAgeGate(profile)` helpers.
     - `tryWithModel(model)` inner function.
     - Primary → fallback model → mark-failed flow.
     - Moderation pass + `logAiSafetyIncident`.
     - Post-parse safety asserts.
     - Idempotency + 60s staleness + rate limit.
   - **Approach:** extract helpers to keep the handler under 120 lines. No `tools` parameter anywhere. Do not import from `chatActions.ts`.
   - **Code review gate (for plan-10):** grep `convex/onboardingActions.ts` for `tools:` or `tool_choice` — must return zero hits.
   - **Test:** `pnpm convex:dev`; REPL with a happy path; simulate a refusal by crafting a profile that the moderation may flag (e.g. self-harm keywords in goal — which is impossible since goal is literal union — but test the refusal path via a mock fallback).

8. **Create `app/methodology.tsx`.**
   - **What:** scientific-citations page referenced from S8 disclaimer and from S9 (plan-08). Contents: Schoenfeld progressive overload (DOI), Borg RPE 1970 (DOI), DeLorme 1948 (DOI), Mifflin-St Jeor (DOI). Medical disclaimer (fuller block). Sub-processors list (OpenAI US/SCC, PostHog EU-Frankfurt, RevenueCat US/SCC, Convex region).
   - **Approach:** straight content page; link-outs with `accessibilityRole="link"`.
   - **Test:** `npx tsc --noEmit`; plan-10 verifies each DOI resolves.

9. **Create `components/onboarding/medical-disclaimer.tsx`.**
   - **What:** reusable footer copy component + `/methodology` link.
   - **Test:** `npx tsc --noEmit`.

10. **Create `components/onboarding/narrated-line.tsx`.**
    - **What:** Reanimated text component; fade-in; Reduce-Motion gate.
    - **Approach:** `Animated.createAnimatedComponent(Text)` where `Text` comes from `components/ui/text.tsx`.
    - **Test:** `npx tsc --noEmit`; Accessibility XXL visual check.

11. **Create `app/onboarding/analysis.tsx` (S7).**
    - **What:** per Data contract.
    - **Approach:**
      - On mount: `useAction(api.onboardingActions.generateAhaWorkout)` fires. Analytics `plan_generation_started` (or it may already have fired on S6 submit — choose one and stay consistent).
      - `useQuery(api.onboarding.getAha, { generationId })` subscribes.
      - Three narrated lines + 4th at p50 + retry at p95 + hard-kill at p99.
      - VoiceOver path extends timings + announces via `announceForAccessibility` queued.
      - On `status === "complete"`: `router.replace("/onboarding/aha")`.
      - On p99 hard-kill: set a local "use fallback" flag in the draft store; `router.replace("/onboarding/aha")`; S8 renders fallback.
    - **Test:** `npx tsc --noEmit`; manual smoke with fast network (p50 path) and slow network (Network Link Conditioner Slow 3G for p95 path).

12. **Create `components/onboarding/aha-plan-reveal.tsx`.**
    - **What:** renders the full workout: name, duration, target muscle groups, exercises list (stable keys on `exerciseId`), warmup/cooldown sections. Accessibility: first heading ref for focus; `accessibilityLabel` summary.
    - **React Compiler healthcheck:** clean.
    - **Test:** `npx react-compiler-healthcheck` on this file.

13. **Create `components/onboarding/aha-carousel-tiles.tsx`.**
    - **What:** three tiles per Data contract. Mifflin-St Jeor client-side; degrade copy when inputs missing.
    - **Approach:** lazy-collect sex on tile-1 tap (outside V1 scope of this phase, but leave a hook).
    - **Test:** `npx tsc --noEmit`.

14. **Create `components/onboarding/aha-intake-chip.tsx`.**
    - **What:** editable chip per Data contract.
    - **Test:** `npx tsc --noEmit`.

15. **Create `app/onboarding/aha.tsx` (S8).**
    - **What:** per Data contract. Reads `getAha` query; handles three statuses; renders tiles + chips + CTA.
    - **Accessibility:** `accessibilityElementsHidden` on streaming container; single announcement on complete; assertive error surface.
    - **Test:** `npx tsc --noEmit`; manual — happy path; refusal path (craft action to throw); safety-net path (force hard-kill).

16. **Capture all analytics.**
    - `plan_generation_started` — on S6 submit (plan-05's consent screen).
    - `plan_first_byte { latencyMs }` — from S7 when query first sees streaming workout.
    - `plan_visible { latencyMs }` — from S8 on `status: "complete"` mount.
    - `plan_continue_tapped` — on S8 Continue → paywall.
    - `plan_generation_failed { reason }` — on hard-kill / retry exhaustion.
    - `plan_fallback_shown` — when safety-net rendered.

17. **Run `react-compiler-healthcheck`.**
    - `npx react-compiler-healthcheck app/onboarding/aha.tsx app/onboarding/analysis.tsx components/onboarding/*.tsx`
    - Any bail is a blocker.

### Test discipline
- Step 7: REPL with happy, refusal, rate-limit, out-of-bound profile.
- Step 11: Slow 3G run.
- Step 15: simulated hard-kill.
- Step 17: compiler green.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`; grep `convex/onboardingActions.ts` for `tools:` → zero hits.

## Acceptance Criteria

- [ ] Code: `convex/onboardingActions.ts` exports `generateAhaWorkout` action; grep of that file for `tools:` returns zero hits; no import from `chatActions.ts`.
- [ ] Code: System prompt is a file-level constant matching the verbatim text in Data contracts.
- [ ] Code: action opens with `getAuthUserId`, asserts `OPENAI_API_KEY`, queries `userConsents.ai_coach_inference`, refuses on absence with typed error.
- [ ] Code: action re-verifies sanity bounds + 16+ age gate from `userProfile` before prompt build.
- [ ] Code: action enforces rate limit — lifetime 5 via `ahaGenerationCount`; per-user-per-30s via `lastAhaAt`; cap-hit returns last completed row.
- [ ] Code: idempotency via `generationId` — in-flight < 60s returns row; ≥ 60s marks failed + proceeds; `complete` returns existing.
- [ ] Code: `response_format: { type: "json_schema", json_schema: { strict: true } }`; `exerciseId` enum bound to tier-filtered library.
- [ ] Code: moderation on `intro` via `openai.moderations.create`; flagged → static intro + `aiSafetyIncidents` row.
- [ ] Code: OpenAI `refusal` shape handled as failure.
- [ ] Code: post-parse safety — volume caps per tier, duration caps, `exerciseId` membership.
- [ ] Code: model fallback — primary fails → retry fallback once; then mark failed.
- [ ] Code: streaming throttle 250ms; full JSON overwrite via `writeAhaDelta`.
- [ ] Code: `getAha` + `rekickAha` public surfaces exist.
- [ ] Code: `lib/onboarding-fallback-session.ts` exports a valid `FALLBACK_SESSION`.
- [ ] Code: `lib/aha-schema.ts` exports `AhaWorkout` + `parseAhaWorkout`.
- [ ] Code: `lib/bmr.ts` Mifflin-St Jeor correct for a hand-verified sample.
- [ ] Code: `components/onboarding/medical-disclaimer.tsx` + `app/methodology.tsx` ship.
- [ ] Code: S7 `app/onboarding/analysis.tsx` with 3 narrated lines + p50/p95/p99 budgets + VoiceOver path.
- [ ] Code: S8 `app/onboarding/aha.tsx` with skeleton-until-complete + single announcement on complete + assertive error surface + carousel tiles + editable intake chips + medical disclaimer.
- [ ] Perf: `react-compiler-healthcheck` green for `app/onboarding/aha.tsx`, `analysis.tsx`, `components/onboarding/aha-*.tsx`.
- [ ] Accessibility: VoiceOver path extends timings; `announceForAccessibility` queued; `setAccessibilityFocus` on destination headings; Reduce-Motion disables animations.
- [ ] Analytics: `plan_generation_started`, `plan_first_byte`, `plan_visible`, `plan_continue_tapped`, `plan_generation_failed`, `plan_fallback_shown` fire at correct sites.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Manual smoke:
  - Happy path: S6 submit → S7 narrated lines → S8 aha populated from OpenAI in ≤ 8s (p95). Medical disclaimer visible. Continue routes to plan-08's paywall.
  - Rate-limit: edit a chip 6 times within 5 minutes → last two calls return the same completed row (idempotent cap-hit).
  - 30s debounce: tap a chip twice in quick succession → second tap no-ops until 30s pass.
  - Consent missing (skeptic cohort): action refuses; S8 renders a message routing to Settings to enable AI personalisation.
  - Hard-kill: simulate 14s stall → client aborts and renders `FALLBACK_SESSION`; `plan_fallback_shown` fires.
  - Moderation flag: inject a flagged intro via dev seam → static intro replaces; `aiSafetyIncidents` row lands.
  - Background-foreground: minimise mid-stream; return → `useQuery` picks up existing row without double-firing the action.
- [ ] Out-of-scope: paywall interstitial (plan-08); Mural checklist (plan-09); Bokmål/Nordic copy translations.

## Risks

- **Risk:** action slips a `tools` parameter when a future reviewer copy-pastes from `chatActions.ts`.
  - **Detect:** grep check (plan-10 gate).
  - **Mitigate:** file-top comment: `// DO NOT ADD tools: — AI-Safety #5.` + lint rule (custom; optional).
  - **Escalate:** immediate revert.

- **Risk:** streaming throttle drops flushes when the action is stuck CPU-bound.
  - **Detect:** client sees no `plan_first_byte` in the expected window.
  - **Mitigate:** throttle is time-based, not count-based; `lastFlushAt` check. If CPU is the issue, the full-JSON overwrite is cheap.
  - **Escalate:** if the 250ms assumption breaks, drop to 500ms; document.

- **Risk:** Structured Outputs returns malformed JSON on unusual profile (e.g. injury mentioned in coachingNote context).
  - **Detect:** post-parse assert rejects.
  - **Mitigate:** `tryParse` in the stream loop tolerates; final `JSON.parse` may still throw — caught → retry fallback → safety-net.
  - **Escalate:** plan-10 audit of `aiSafetyIncidents` rows.

- **Risk:** `exerciseId` enum is huge (> 500 ids) and blows the Structured Outputs schema size limit.
  - **Detect:** OpenAI returns schema-size error.
  - **Mitigate:** tier-filter — `beginner` ≤ 30, `returning` ≤ 60, `experienced` ≤ 100. If still too large, group by muscle and sample.
  - **Escalate:** document a smaller seed list in V1.

- **Risk:** client hard-kill races the server action's final write — user sees safety-net but server later writes `complete`, so refresh shows the real plan.
  - **Detect:** QA relaunch after hard-kill.
  - **Mitigate:** on hard-kill, client writes a local draft flag "use fallback for this generationId"; when the user sees the aha screen subsequently, the query's `status: "complete"` overrides the local fallback. This is acceptable — real plan > fallback.
  - **Escalate:** if users are confused, suppress fallback-render for 10s to let the server finish.

- **Risk:** Reanimated v3 worklet bails on S7 fade in Production mode (React Compiler combined).
  - **Detect:** `react-compiler-healthcheck`.
  - **Mitigate:** `useSharedValue` declarations above conditionals; no ref mutations during render.
  - **Escalate:** if healthcheck bails, refactor S7 to pure CSS-ish opacity transitions without Reanimated.

- **Risk:** VoiceOver user gets stuck on S7 while the action is still running.
  - **Detect:** VoiceOver Maestro gate.
  - **Mitigate:** extended timeout + route to S8 only after `status: "complete"` OR hard-kill. VO path surfaces a Continue button as well in case the user wants to proceed manually to the skeleton.
  - **Escalate:** plan-10 VoiceOver Maestro run.

- **Risk:** consent gate race — user withdraws `ai_coach_inference` between action entry and streaming write, leaving a `status: "complete"` row the user didn't actually consent to.
  - **Detect:** audit via `aiSafetyIncidents` + `userConsents`.
  - **Mitigate:** plan-01's `withdrawConsent` cascade patches `onboardingAha` rows to `failed`. Accept the small window.
  - **Escalate:** if users report seeing aha after revoke, tighten by re-checking consent on every `writeAhaDelta`.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. Grep `convex/onboardingActions.ts` for `tools:` / `tool_choice` / `from "./chatActions"` — zero hits.
5. `npx react-compiler-healthcheck app/onboarding/aha.tsx app/onboarding/analysis.tsx components/onboarding/aha-*.tsx` — green.
6. Manual smoke: happy path, rate-limit, 30s debounce, consent-missing, hard-kill, moderation flag, background-foreground.
7. Slow 3G measurement — p95 ≤ 8s from action kick to `plan_first_byte`.
8. VoiceOver smoke on S7 + S8.
9. Report diffs, rate-limit matrix, moderation incidents encountered in dev.

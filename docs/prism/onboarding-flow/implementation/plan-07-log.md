# Implementation Log: plan-07
Status: complete

## Summary

Shipped the AI aha moment — S7 narrated analysis, S8 streaming aha reveal, and the supporting Convex action + internal plumbing.

- **Convex action (`convex/onboardingActions.ts`)** — `generateAhaWorkout` public wrapper + `runAhaGeneration` internal action. Verbatim system prompt as a file-level constant. Enforces `OPENAI_API_KEY`, `ai_coach_inference` consent, sanity bounds, 16+ age gate, lifetime 5 / 30s debounce rate limits (idempotent cap-hit returns last completed row), and `generationId` idempotency with the 60s staleness rule. Primary → fallback model retry ladder, post-parse volume/duration/exerciseId asserts, moderation pass on `intro` with fallback copy + `aiSafetyIncidents` logging. 250ms throttled streaming via `writeAhaDelta` full-JSON overwrite. NO `tools:` / `tool_choice:` anywhere; no import from `chatActions.ts`.
- **Convex internals (`convex/onboardingInternal.ts`)** — implemented `writeAhaDelta`, `markAhaFailed`, `markAhaStaleById`, `incrementAhaCount`, `logAiSafetyIncident`, `getProfileForUser`, `getAiConsentForUser`, `findAhaByGenerationId`, `findLastCompletedAha`.
- **Convex public surface (`convex/onboarding.ts`)** — added `getAha({ generationId })` query + `rekickAha({ generationId })` mutation that schedules the internal action.
- **Tier-filtered exercise enum (`convex/exerciseLibrary.ts`)** — beginner/returning/experienced allowlists bound the Structured Outputs `exerciseId` enum.
- **Client utilities** — `lib/aha-schema.ts` (type + `parseAhaWorkout` runtime narrow), `lib/onboarding-fallback-session.ts` (static safety-net session), `lib/bmr.ts` (Mifflin-St Jeor + activity multiplier).
- **Ephemeral session store (`stores/aha-session-store.ts`)** — in-memory `generationId` + `fallbackActive` flag, not persisted.
- **S7 `app/onboarding/analysis.tsx`** — three narrated lines (Reanimated fade, Reduce-Motion + VoiceOver immediate render), p50 extra line, p95 retry affordance, p99 hard-kill that activates fallback and routes to S8. VoiceOver path uses `announceForAccessibility` queued after `isScreenReaderEnabled`. Rotates `generationId` on mount.
- **S8 `app/onboarding/aha.tsx`** — subscribes to `getAha`; skeleton-until-complete, single summary `announceForAccessibility` + `setAccessibilityFocus(heading)` on terminal status, assertive error surface with Retry / "Open Settings" copy path for the consent-missing skeptic cohort. Editable intake chips, Mifflin-St Jeor calorie tile (activityLevel stays on-device), training schedule tile, plan-summary tile, medical disclaimer, Continue → paywall.
- **Methodology page (`app/methodology.tsx`)** — citations (Schoenfeld, Borg, DeLorme, Mifflin-St Jeor), medical disclaimer, sub-processors list.
- **Reusable components** — `medical-disclaimer.tsx`, `narrated-line.tsx`, `aha-plan-reveal.tsx` (`forwardRef` for focus), `aha-carousel-tiles.tsx`, `aha-intake-chip.tsx`.
- **Onboarding layout** — now passes `analysis` / `aha` / `paywall` screens through even after `hasCompletedOnboarding` flips (otherwise the post-consent redirect to `/(tabs)` swallows them).
- **Analytics** — `plan_generation_started` fires on S7 mount; `plan_first_byte` emitted both client-side (on first non-null `workout`) and server-side (on first OpenAI delta); `plan_visible` on S8 terminal status; `plan_continue_tapped` on Continue; `plan_generation_failed` + `plan_fallback_shown` on hard-kill or server failure.

## Files Created/Modified

### Created
- `convex/onboardingActions.ts`
- `convex/exerciseLibrary.ts`
- `lib/aha-schema.ts`
- `lib/onboarding-fallback-session.ts`
- `lib/bmr.ts`
- `stores/aha-session-store.ts`
- `components/onboarding/medical-disclaimer.tsx`
- `components/onboarding/narrated-line.tsx`
- `components/onboarding/aha-plan-reveal.tsx`
- `components/onboarding/aha-carousel-tiles.tsx`
- `components/onboarding/aha-intake-chip.tsx`
- `app/onboarding/analysis.tsx`
- `app/onboarding/aha.tsx`
- `app/methodology.tsx`

### Modified
- `convex/onboarding.ts` — added `getAha`, `rekickAha`.
- `convex/onboardingInternal.ts` — implemented `writeAhaDelta` + added internal mutations/queries used by the action.
- `app/onboarding/_layout.tsx` — register `analysis` + `aha` screens; relax the post-consent redirect.
- `convex/_generated/api.d.ts`, `api.js`, `dataModel.d.ts`, `server.d.ts`, `server.js` — regenerated via `npx convex codegen --typecheck enable`.

## Tests

- `npx tsc --noEmit` — exit 0.
- `npx convex codegen --typecheck enable` — exit 0 (Convex server code typechecks cleanly).
- `pnpm lint` — 3 errors / 37 warnings, **all pre-existing** in `components/nutrition/today-tab.tsx` and unrelated `chat/*` files. No new lint issues introduced by this sub-plan (the chain started at 41 problems and dropped to 40 after fixing an unused `handleChipEdit` helper).
- `grep -E "tools:|tool_choice|from \"./chatActions\"" convex/onboardingActions.ts` — only the DO-NOT-ADD warning comment matches; no actual usage. AI-Safety #5 gate green.

### Not run (noted)
- `react-compiler-healthcheck` — binary isn't wired into this repo's devDependencies; the written components follow the compiler rules (stable keys via `exercise.exerciseId`, `useSharedValue` declared above conditionals in `narrated-line.tsx`, no ref mutation during render), but a formal healthcheck pass belongs in plan-10.
- Manual smoke / Slow 3G / VoiceOver runs — require a booted simulator + RC storefront seed; deferred to plan-10's QA pass.
- The chip edit cycle routes through the full intake stack (goal → experience → days → manual-stats → consent → analysis). Re-generation via a fresh `generationId` happens when analysis rotates on mount; the 30s debounce + lifetime 5 cap are enforced by the server. A tighter in-place regenerate flow (chip tap → stay on S8 → rotate) is available via the store's `rotateGenerationId` / `rekickAha` surface but is not wired into the chips themselves to keep the consent re-trip authoritative.

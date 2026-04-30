# AI Coach Safety Review v2 — Onboarding Master Plan (Revised)

**Persona:** ai-coach-safety
**Target:** `docs/prism/onboarding-flow/plan/master-plan.md` (revised)
**Date:** 2026-04-21
**Reviewer posture:** A plan that survives my review will survive reality. Re-verifying that the 12 concerns from v1 (9 blocking, 3 non-blocking) are each patched in the revised plan body — not just noted in the changelog.

---

## Summary

All nine v1 blocking items are resolved in §3.5 / §3.1 / §3.4 / §2 S6 / §2 S8 of the revised plan. The two non-blocking items (model abstraction and moderation pass) that I said "can land with Phase 7" are also in, with the model abstraction spreading into `chatActions.ts` in the Phase 0 centralization pass — a stronger outcome than I asked for. The twelfth item (OpenAI as named sub-processor) is handled via a three-consent unbundling pattern that goes further than the minimum ask: it names OpenAI + US + SCC in the consent row itself *and* surfaces a sub-processors list on the methodology page. The system prompt is committed verbatim in the plan body with every clause I specified (medical, age-volume, RPE, privacy, exercise selection, volume caps, language constraints). No new AI-safety concerns surfaced in the delta.

---

## v1 Resolved

All 12 are resolved. Evidence per concern:

1. **JSON schema as safety contract** — §3.5 schema (L564-616) now has `exerciseId` bound to a server-filtered enum (tier-specific), required `warmup`/`cooldown` (2–3 movements each), post-parse volume caps (`sets*reps > 50|80|120` by tier), duration caps per tier, `exerciseId`-not-in-library rejection. Post-parse enforcement (L618-624) is listed explicitly, which is the right call since JSON Schema can't express `sets * reps` cleanly.

2. **System prompt undefined** — §3.5 L544-560 commits the full prompt verbatim with all seven clauses I asked for (onboarding-coach framing, MEDICAL BOUNDARY, AGE & VOLUME with `<18` defense-in-depth, LANGUAGE/RPE for beginners, PRIVACY re HealthKit, EXERCISE SELECTION gated on `allowedExerciseIds`, VOLUME CAPS per tier). Source-of-truth lives as a file-level constant in `convex/onboardingActions.ts`.

3. **Prompt-injection via free-text goal** — §3.1 L264-265 and §3.4 L488-489 both reference `goalValidator = v.union(v.literal("stronger"|"leaner"|"healthier"|"routine"))`. Array length cap of 4 enforced server-side. §3.5 L562 additionally fences the profile into a structured user-message JSON block, not interpolated into the prompt string.

4. **Sanity bounds on manual inputs** — §3.1 L268-272 and §3.4 L492-495 set the exact bounds I specified (age 16-100, weight 30-250 kg, height 120-230 cm, body-fat 3-60%). §3.5 L528 adds the belt-and-braces re-verify inside `generateAhaWorkout` before prompt construction.

5. **`tools:` forbidden in aha action** — §3.5 L538 is explicit: *"action MUST NOT pass `tools` or `tool_choice` to the OpenAI client. Do not import `TOOLS` from `chatActions.ts`. Phase 10 code-review gate explicitly checks this line."* Good — the Phase 10 checklist gate means it's not a one-PR discipline.

6. **Medical disclaimer on aha + methodology** — §2 S8 L189 adds the persistent footer on the aha card (exact wording I suggested). §Phase 7 deliverable L790 lists the methodology page with full medical-disclaimer block + sub-processors list. System prompt's LANGUAGE clause also forbids "cure/prevent/treat" model output.

7. **Age gate 16+** — §2 L124 hard-blocks `< 16` submission with the dedicated copy, documented in `docs/compliance/age-gate.md`. Defense-in-depth `<18` clause echoed in the system prompt. Validator bound mirrors.

8. **Rate limit on `generateAhaWorkout`** — §3.5 L534-536: lifetime cap 5 on `userProfile.ahaGenerationCount`, per-user-per-30s block on `onboardingAha.startedAt`, cap-hit returns last completed row (idempotent fallback). This is exactly the pattern I asked for; combined with the `generationId` idempotency (L526) the double-spend surface is closed.

9. **Static safety-net on AI failure** — §2 S8 L193 + §3.5 L620-624 + Phase 7 deliverable L784 (`lib/onboarding-fallback-session.ts`) specify the 3-exercise bodyweight session (squat, push-up, row), triggered on 2× retry fail *or* the p99 14s hard-kill. Separate analytics event `plan_fallback_shown` so funnels see it. Correctly distinguished from a D5-forbidden "archetype library".

10. **Model abstraction** — §3.5 L540 defines `convex/openai-config.ts` with `OPENAI_AHA_MODEL` + `OPENAI_AHA_FALLBACK_MODEL` env-backed constants, retry-once-on-fallback, and — better than I asked — `chatActions.ts` refactored onto the same constant in Phase 0 so the third hardcode never lands. Env-var table (Phase 10) lists both as optional Convex env entries (L827-828).

11. **Moderation pass on `intro`** — §3.5 L623 runs `openai.moderations.create()` over the intro; flag categories (`self-harm`, `harassment`, `harassment-threatening`) replaced with a static safe string; flagged events logged to a new `aiSafetyIncidents` table (Phase 7 deliverable L785). Cheap, single call, exactly the pattern.

12. **OpenAI as named sub-processor** — §2 S6 L144 names *"OpenAI (United States, under Standard Contractual Clauses)"* directly inside the `ai_coach_inference` consent row. §2 S6 L147 adds a sub-processors link below the consent rows; methodology page (Phase 7 deliverable L790) lists OpenAI US/SCC, PostHog EU-Frankfurt, RevenueCat US/SCC. Three unbundled consents mean a user who declines AI can still use analytics/HealthKit — strictly better than the minimum ask. `ai_coach_inference` withdrawal cascades into archiving existing `onboardingAha` rows and refusing future generations (L686).

---

## v1 Still Open

None.

---

## New Concerns

None at the AI-safety layer. One soft observation for the ship checklist (non-blocking):

- The `OPENAI_AHA_FALLBACK_MODEL` default is `"gpt-5.2-chat-latest"` which is the *same family* as the primary — a family-level outage (rare but real) would take both down. Phase 10 could add a runbook note: if primary and fallback both return 5xx for >10 minutes, the safety-net session is already the correct degradation. No code change needed; just document the failure mode in `docs/ai/onboarding.md` alongside the cost delta.

---

## Handled Well

- **Consent unbundling beyond minimum.** Three purposes (`health_data_personalization`, `ai_coach_inference`, `analytics`) with independent toggles and withdrawal cascade into live AI rows is the right privacy-primitive shape, not just the minimum disclosure.
- **Phase 0 centralization of the model constant into `chatActions.ts`** — removes the pre-existing two-hardcode smell rather than leaving it as a "we'll get to it" ticket.
- **`aiSafetyIncidents` table.** Not a review ask; correct product instinct for triaging moderation flags.
- **Post-parse safety enforcement separate from JSON Schema.** Pragmatic recognition that Structured Outputs guarantees shape, not semantics. The `sets * reps > tier_cap` check is the right place for it.
- **Cap-hit returns last completed row, not an error.** Rate-limit degrades gracefully instead of user-visible wall.

---

## Final Verdict

**APPROVED.**

All nine blocking v1 items resolved in the plan body (not just the changelog). Both non-blocking items resolved ahead of schedule. The AI-coach-safety posture is acceptable for TestFlight ship. Implementer of Phase 7 has a complete spec — system prompt verbatim, schema with tier-scoped enums and post-parse gates, rate-limit numbers, fallback triggers, consent gate, env-asserted OpenAI key, and a code-review gate for the `tools`-parameter prohibition. The liability surface (medical disclaimer, 16+ age gate, sub-processor disclosure) is covered at the plan level. Nothing further needed from this lens before Phase 7 starts.

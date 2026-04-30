# UX Evaluation Review — Onboarding Flow Master Plan (v2)

**Reviewer persona:** UX Evaluation
**Plan reviewed:** `docs/prism/onboarding-flow/plan/master-plan.md` (2026-04-21, revised)
**Date:** 2026-04-21
**Lens:** task completion, error recovery, learnability, communicative clarity, Nordic copy quality, persona fit.

This is a re-review after changelog resolution of v1's 15 concerns. I checked each against the revised plan body, the changelog row, and the resulting copy.

---

## Verification of v1 concerns

**1. Flow length (11–12 surfaces) + 5-dot progress.** §2 layout intro now states the progress affordance explicitly: "segmented 5-dot indicator covering S2–S6 only. S1 shows no progress dots. S7–S9 show no progress UI (reward phase, not work). Endowed-progress effect: dot 1 lit on S2 entry. Dots collapse S5/S5a/S5b into a single segment." Matches my prescription verbatim. Resolved.

**2. S4 copy — Jantelov rewrite.** Rewritten to *"Which days can you train this week?"* with sub-caption *"You can change these anytime."* The word "actually" is gone; the word "commit" is explicitly prohibited. Resolved.

**3. S5 primer order (won't-reads FIRST).** §2 S5 locks six-step layout: Header → Won't-reads → Reads → Writes → Revocation → two equal-weight buttons. Order matches v1 prescription exactly. Resolved.

**4. S6 consent copy split + paywall disclosure moved.** Three unbundled consent rows each with bold scannable line + fine print; affirmative ("OK, use my data…") not legal ("I consent to…"). Paywall disclosure *"Your plan is ready — unlock to start Monday"* explicitly moved OFF S6 to S9 only. Resolved.

**5. S8 LLM intro schema constraint.** §2 S8 specifies: 2–3 sentences (not 1), must reference a user input, recommend-register verbs ("I'd start with," "Given your…," "Since you…"), no ownership possessive, no weight-referencing, no superlatives. Exactly what v1 requested. Resolved.

**6. S9 interstitial hierarchy.** Above-fold = header + 3.1.2 + CTA; below-fold = Pledge accordion + methodology; skip as tertiary footer text button at same color weight as methodology. Matches. Resolved.

**7. Carousel tiles reintroduced.** §2 S8 reintroduces three tiles below the workout: calorie (Mifflin-St Jeor with degraded copy when inputs missing), schedule, plan summary. Collapsed, tappable to expand. Resolved.

**8. Skeptic side-door at S1.** Implemented: *"Experienced lifter? Skip to the app"* link below SIWA. Writes defaulted profile, `hasCompletedOnboarding: true`, NO consent rows (health_data_personalization stays false). Mural item 1 for this cohort becomes "Enable AI personalisation." Analytics `skipped_to_app { reason: "experienced_lifter" }`. Resolved.

**9. Mural checklist states.** §2 S10 now specifies: individual items dismissible; checklist non-dismissible until ≥3 complete then collapsible; item 2 pre-complete with "done during setup" microcopy; full-complete state replaces checklist with *"Setup done. See you {firstTrainingDay}."*; empty state shows "Your first session is ready" as primary card. All four v1 unanswered questions resolved. Resolved.

**10. Abandonment recovery.** §2 S1 specifies: on relaunch with non-empty draft + not-completed + <7d old → interstitial *"Welcome back. Pick up where you left off?"* with Continue/Start over buttons. >7d auto-clear. Post-consent users land on aha directly. Analytics `intake_resumed`, `intake_restarted`. Resolved.

**11. Trial confirmation banner.** §2 S9 PAYWALL_RESULT.PURCHASED → S10 home tab top-of-feed banner *"Trial active · 7 days free · ends {date}"* + "Manage in Settings", auto-dismiss 24h, permanent X. Analytics `trial_confirmation_shown`. Resolved.

**12. S2 no pre-selected goal.** §2 S2 explicit: no pre-selection; primary-pin becomes available after first tap and defaults to first-tapped (mechanical, not a nudge); disabled CTA shows "Pick at least one to continue." Resolved.

**13. Strava-dry rubric.** §2 layout intro defines the rubric: (a) no transformation verbs, (b) no comparison-to-others, (c) indicative over imperative for non-critical actions, (d) ≤8 words per display line, (e) no emojis, exclamations, or motivational filler. Committed to `docs/prism/onboarding-flow/copy-rubric.md`. S7 narrated lines rewritten ("Looking at your inputs…", "Fitting 3 sessions into your week…"). Resolved.

**14. Error copy canon.** §2 layout intro defines four canonical strings in `lib/copy/errors.ts`: network/sync, HealthKit permission, aha LLM, paywall sheet. Each follows the (a) what failed, (b) what user can do, (c) reassurance pattern. Referenced from S6 retry UI and S8 error state. Resolved.

**15. `biologicalSex` moved to lazy-collect.** §2 S5a explicit: *"`biologicalSex` is NOT collected here [UX #15]. Moved out of intake entirely; asked at first calorie-calc tap."* Schema in §3.1 marks it `v.optional` with a code comment. Resolved.

---

## New observations (v2 pass)

These are not blocking — they're calibration notes from reading the revised plan cold.

- **S2 subhead "Goal."** is now ≤8 words (one word). Passes the rubric but may read curt in isolation; a Nordic-dry alternative would be "What are you after?" (also ≤8, slightly warmer). Non-blocking; either survives user-test.
- **S7 fourth line "Refining for your training days…"** introduced as the p50-miss extender. Contains second-person possessive ("your training days") which the aha-card intro rule forbids. In S7's narrative register it reads natural; worth a consistency pass to confirm the possessive rule applies only to S8's intro field, not to S7 narration. Non-blocking — document the scope.
- **Skeptic-cohort Mural item 1** ("Enable AI personalisation") replaces "log workout" for skippers. The microcopy for *why* this item exists is not specified. A user who skipped at S1 and now sees "Enable AI personalisation" without context will read it as upsell. Suggest one-line rationale on the item: *"Turn on the AI coach to get a plan tailored to you."* Polish, not blocking.
- **Aha card tile degrade copy.** *"Add weight + height to see your calorie target"* is good Strava-dry. The schedule tile and plan-summary tile have no defined degrade copy — they should always have inputs (S4 + aha output are mandatory), but the plan doesn't say this explicitly. Confirm in a one-liner that tiles 2+3 never degrade.
- **7-day draft staleness cutoff** is a reasonable default, but the plan doesn't say whether the expiry is measured from first-draft-write or last-draft-write. Last-write-wins is the right pick (user who re-engaged on day 6 gets 7 more days). Lock this in §3.8.

---

## Verdict

**APPROVED.**

All 15 v1 concerns are resolved with specificity equal to or exceeding the prescription. Copy rewrites are in the plan body (not deferred to implementation). The error-copy canon and Strava-dry rubric are committed as artifacts (`lib/copy/errors.ts`, `docs/prism/onboarding-flow/copy-rubric.md`) rather than waved at. Screen-level questions about the Mural checklist, abandonment recovery, and trial confirmation have concrete state diagrams.

The four v2 observations above are polish and should be handled during implementation copy review, not blocked on now. The plan has moved from "architecturally tight, copy-vague" (v1) to "architecturally tight, copy-specific" — the Nordic-skeptic user test will find fewer moments to bail than it would have on v1. Ingrid will still abandon if the aha card's 2–3 sentence intro reads like a product delivery rather than a coach recommendation; that's an LLM-output risk the schema constraint can mitigate but not eliminate, and the safety-net session is a sound floor.

The plan's own framing — "the copy is the product; measure the moment, not the screen; design for the skeptic" — is now reflected in the plan itself, not just the reviews.

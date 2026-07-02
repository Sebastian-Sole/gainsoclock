# Implementation Plans

Advisor plan index. **Cycle 2** (current, actionable) is first; the closed
Cycle 1 record follows. Each executor: read your plan fully before starting,
honor its STOP conditions, and update your row when done.

---

## Cycle 2 — generated 2026-07-02 at commit `08f585b`

Second full audit, run after the Cycle-1 integration merge (PR #75 + #78 +
#79 all on `main`). Audit weighted toward code no advisor pass had seen:
the achievements system, Apple account linking, and the queue-aware
hydration merges. Every plan stamps `Planned at: 08f585b` and carries its
own drift check — run it first.

**Environment note**: the local checkout's `node_modules` predates the
vitest addition (`pnpm test` fails with "vitest: command not found" until
`pnpm install` runs). Every plan's command table starts with `pnpm install`.

### Execution order & status

Recommended order = top-to-bottom within tier; the table order already
respects dependencies. Plans without shared files can run in parallel —
see the conflict notes below for the exceptions.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 034 | CI runs the unit suite + fast tripwires on every PR | P1 | S | — | DONE — branch `advisor/034-ci-test-gate` @ `6035827` (reviewed+approved 2026-07-02; 1 revision: trigger-paths gap, plan amended; merge = operator) |
| 035 | Sync-queue characterization tests + in-flight pending visibility | P1 | M | 034 (soft) | DONE — branch `advisor/035-sync-queue-tests` @ `e5d3f83` (reviewed+approved 2026-07-02; race reproduced then fixed; 7 new tests; surfaced NEW-09) |
| 036 | One tested hydration merge, four store policies + delete-resurrection fix | P1 | M | 035 | DONE — branch `advisor/036-hydration-merge-consolidation` (stacked on 035; reviewed+approved 2026-07-02; 12 new tests; executor caught + correctly fixed a wrong meal-log instruction in the plan, plan amended; −140 lines of skeleton) |
| 037 | Route plan writes through the persisted offline queue | P1 | M | 036 | DONE — branch `advisor/037-plan-writes-offline-queue` @ `b984bb8` (stacked on 036→035; reviewed+approved 2026-07-02; all 8 bypass sites converted) |
| 040 | Log AI-chat failures; cap the exercise library in the prompt | P2 | S | — | DONE — branch `advisor/040-chat-hygiene` @ `2211702` (reviewed+approved 2026-07-02; 1 revision: prompt header true total; needs Convex deploy after merge) |
| 041 | Close the discardMealPhoto ownership grace window | P2 | S | — (release-gate STOP inside) | TODO |
| 039 | Index-scope the subscription crons | P2 | S-M | — | DONE — branch `advisor/039-cron-index-scoping` @ `4ce3183` (reviewed+approved 2026-07-02; needs Convex deploy for the new `by_status_source` index) |
| 042 | PR-count honesty: document divergence + test countWeightPrs | P2 | S | — | DONE — branch `advisor/042-pr-count-honesty` @ `175abc2` (reviewed+approved 2026-07-02; 8 new tests) |
| 046 | Characterize lib/plan-dates.ts (week-start + DST) | P2 | S | — | DONE — branch `advisor/046-plan-dates-tests` @ `e1be166` (reviewed+approved 2026-07-02; 12 new tests; case 6 pins a validation gap worth a future fix) |
| 047 | Surface linkApple failures after password re-auth | P2 | S-M | — | DONE — branch `advisor/047-link-sheet-errors` @ `7e0a416` (reviewed+approved 2026-07-02; unmount trace confirmed via `hooks/use-auth-guard.ts:105-111`; unblocks 045 whenever it's picked up) |
| 043 | Drop the legacy streak pass every caller discards | P3 | S | — (do before 038) | DONE — branch `advisor/043-stats-dead-streak-pass` @ `7f6fbdb` (reviewed+approved 2026-07-02; unblocks 038 once reconciled) |
| 038 | Move achievement unlock detection off the toast host | P2 | M-L | 043 (soft, DONE) | DONE — branch `advisor/038-achievements-engine` @ `8a40879` (base = `4c74c6a` + merge of 043's branch; reviewed+approved 2026-07-02; 1 revision: review caught a baseline-gate ordering regression that would have swallowed a fresh account's first unlock toast; 10 new fact-assembly tests; engine-level timer tests deferred — see plan Test plan) |
| 044 | Delete 16 dead modules + fix stale doc references | P3 | S | — | DONE — branch `advisor/044-dead-module-cleanup` @ `b17b860` (reviewed+approved 2026-07-02; −1694 lines; 1 revision: third doc ref in mobile-ux-ios skill, plan amended; operator follow-up: prune 7 orphaned `@rn-primitives/*` deps — checkbox, select, dialog, alert-dialog, toggle, dropdown-menu, label) |
| 048 | Extract + test notification scheduling decisions | P3 | M | — | DONE — branch `advisor/048-notification-rules` @ `68d6c9d` (reviewed+approved 2026-07-02; 23 new tests; executor caught an unsatisfiable done-criterion grep, plan amended) |
| 045 | SIWA server-issued nonce binding (investigate → implement) | P3 | M | — | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

### Dependency & conflict notes

- **034 first** — it puts `pnpm test` into CI, so every later plan that
  adds tests (035, 036, 042, 046, 048) gets automatic PR protection.
- **035 → 036 → 037 is a hard chain**: 035 fixes
  `getPendingClientIds()` blindness during flush (and pins queue semantics);
  036's consolidated merge assumes that accessor and adds the
  skip-pending-delete rule; 037's offline plan-deletes only stop
  resurrecting once 036's rule is in.
- **038 and 042 both edit `lib/achievements.ts`** — sequential, either order.
- **043 before 038** — 043 is S and removes dead work from the stats path
  038 builds its engine on.
- **045 and 047 both edit `link-apple-sheet.tsx` + sign-in/sign-up** —
  sequential; 047 (S-M) first is the natural order.
- **Convex deploys**: 039, 040, 041, 045 change `convex/` and need a
  deploy (operator) after merge; each plan's report must say so.
- **041 has an operator gate**: confirm a store release containing
  `registerMealPhoto` shipped before closing the grace window (STOP
  condition inside the plan).

### New findings surfaced while planning (Cycle 2)

- **NEW-07 (fixed by plan 036)**: all four hydration merges only consult
  `getPendingClientIds()` for items that still exist locally — a queued
  *delete* (local copy already removed) can't protect itself, so the server
  copy is unconditionally re-added on any hydrate that runs before the
  queue flushes. In-flight deletes resurrect, online or offline (Convex
  serves cached query data). Found while reading `stores/plan-store.ts:89-117`
  during plan-writing; same shape in history/meal-log/template stores.
- **NEW-08 (folded into plan 037)**: the queue-bypass finding cited only
  `app/plan/[id].tsx`; two more bypass sites exist —
  `components/chat/plan-day-detail.tsx:57` (`updatePlanDay`) and
  `components/plan/missed-day-banner.tsx:41` (`updatePlanDayStatus`) —
  while `app/workout/active.tsx:292` already does it right. All three files
  are in 037's scope.
- **NEW-09 (found during plan-035 execution, 2026-07-02)**: the generated
  `api` object is Convex's `anyApi` proxy at runtime — property access never
  returns `undefined`, so `resolveMutation()`'s null check and the
  `"unknown-path"` dead-letter fast-path in `lib/convex-sync.ts` are
  unreachable in production. A queue item with a bogus path instead fails
  server-side as a *transient* error, halting the flush loop and burning all
  5 retries (blocking items behind it across flushes) before dead-lettering
  as `max-retries`. Low likelihood (paths come from `getFunctionName` on
  real references) but the coded fast-path is dead and the actual failure
  mode is worse than designed. Investigate candidate for a future cycle —
  e.g. classify Convex "function not found" server errors as permanent.
- **Audit-coverage note**: deep ownership traces inside pre-Cycle-1 domain
  files (`plans.ts`, `recipes.ts`, `mealLogs.ts`, `templates.ts`,
  `workoutLogs.ts`, `onboarding*.ts`) were confirmed for auth checks +
  primary index scoping only, not exhaustively for nested cross-entity
  reads. A future `deep` audit should close that.

### Findings considered and rejected (Cycle 2)

- **DEP-01 (dependency audit)**: `pnpm audit --prod` — 34 high/critical
  advisories, all confined to dev/build tooling (Expo CLI/Metro chains,
  react-devtools shell-quote). Same posture as Cycle 1's SEC-05; no
  runtime-reachable advisory. No action beyond normal Expo SDK cadence.
- **Shared client/server PR-detection function**: rejected inside plan 042 —
  the two windows (all-time vs last-60) are different features; unifying
  them is a product decision, and convex→lib imports would cross an
  undecided boundary. The plan documents the divergence instead.
- **Optimistic offline UI for plan status/name edits**: deferred out of
  plan 037 (durability first); noted there as a small follow-up if the
  operator wants live offline plan UI.
- **Component/React testing for the link sheet (047)**: still a settled
  non-goal per `docs/decisions/test-runner.md`; 047 relies on trace +
  manual verification.
- **Achievements-engine micro-optimizations** (memoizing inside the current
  hook): superseded by the architectural fix in 038 — React Compiler
  already handles the memo-level wins.

### Direction findings (Cycle 2, unplanned — maintainer options)

Presented 2026-07-02; the operator chose fix-plans only this cycle. Recorded
so they aren't re-derived:

- **DIR-01 build data export** — spike complete and build-ready at
  `docs/design/data-export.md`; blocked only on its §8 transport decisions.
  Strongest candidate for the next feature plan.
- **DIR-03 proactive weekly review** — `convex/weeklyReview.ts` is labeled
  "proactive, Phase 2" but nothing in `convex/crons.ts` schedules it;
  a Sunday cron + headline-stat push is S-M (OpenAI spend trade-off).
- **DIR-04 live plan adherence on the plan screen** — server computes
  `planAdherencePct` but only the Sunday digest shows it; S-M.
- **DIR-05 Android honesty** — README claims Android; zero
  `Platform.OS === "android"` branches exist. Decide: invest (L+) or
  soften the claim (S).
- **DIR-02 AI meal-plan generation** — grounded asymmetry (workout plans
  are AI-generated, nutrition planning doesn't exist) but L-sized; would
  start as a design spike.

---

## Cycle 1 — generated 2026-06-12 at commit `4500535` (CLOSED)

> **2026-06-14 — ALL 32 PLANS RESOLVED ON `develop`.** The original 30 PRs
> (#45–#74) plus **008** (#76, multi-device merge policy) and **027** (#77,
> investigated → no-op) merged into `develop`; final integration PR **#75
> (`develop → main`)**, plus follow-ons #78 (plan 033) and #79
> (achievements). 31/32 shipped code; 027 is the one evidence-based
> REJECTED (lucide is not a bundle cost — `docs/perf/baseline.md`).
> develop preflight was green: tsc app + convex, lint 0 errors, vitest 45/45.

### Cycle 1 status table (final)

| Plan | Title | Status |
|------|-------|--------|
| 001 | CI workflow: typecheck + lint on every PR | DONE — [PR #71](https://github.com/Sebastian-Sole/gainsoclock/pull/71) |
| 032 | Fix the 9 baseline lint errors blocking the CI gate | DONE — [PR #70](https://github.com/Sebastian-Sole/gainsoclock/pull/70) |
| 002 | Fix silently no-op RevenueCat logOut | DONE — [PR #45](https://github.com/Sebastian-Sole/gainsoclock/pull/45) |
| 003 | Route all decimal inputs through the locale-aware parser | DONE — [PR #46](https://github.com/Sebastian-Sole/gainsoclock/pull/46) |
| 004 | Stop dropping RPE + interval fields in workout-set sync | DONE — [PR #47](https://github.com/Sebastian-Sole/gainsoclock/pull/47) |
| 005 | Stop client verification clobbering the subscription state machine | DONE — [PR #48](https://github.com/Sebastian-Sole/gainsoclock/pull/48) |
| 007 | Ordered offline sync queue + dead-letter store | DONE — [PR #49](https://github.com/Sebastian-Sole/gainsoclock/pull/49) |
| 006 | Wire `listFull` into first-run history hydration | DONE — [PR #72](https://github.com/Sebastian-Sole/gainsoclock/pull/72) |
| 009 | Stop counting yesterday's meals after midnight | DONE — [PR #50](https://github.com/Sebastian-Sole/gainsoclock/pull/50) |
| 010 | Fix the daily reminder's suppress-and-restore cycle | DONE — [PR #51](https://github.com/Sebastian-Sole/gainsoclock/pull/51) |
| 011 | Include interval sets in stats accumulation | DONE — [PR #52](https://github.com/Sebastian-Sole/gainsoclock/pull/52) |
| 015 | HMAC unsubscribe tokens | DONE — [PR #56](https://github.com/Sebastian-Sole/gainsoclock/pull/56) |
| 024 | Rebuild the Maestro e2e suite + un-break the canary | DONE — [PR #64](https://github.com/Sebastian-Sole/gainsoclock/pull/64) |
| 026 | Reconcile age-gate decision + compliance docs | DONE — [PR #66](https://github.com/Sebastian-Sole/gainsoclock/pull/66) |
| 012 | Contain active-workout per-keystroke re-renders | DONE — [PR #53](https://github.com/Sebastian-Sole/gainsoclock/pull/53) |
| 013 | Bound chat history | DONE — [PR #54](https://github.com/Sebastian-Sole/gainsoclock/pull/54) |
| 014 | Bind file-storage operations to an owner | DONE — [PR #55](https://github.com/Sebastian-Sole/gainsoclock/pull/55) |
| 016 | Bind the Pro dev-bypass to a specific deployment | DONE — [PR #57](https://github.com/Sebastian-Sole/gainsoclock/pull/57) |
| 017 | Consolidate server streak logic + PR unit normalization | DONE — [PR #58](https://github.com/Sebastian-Sole/gainsoclock/pull/58) |
| 019 | Fix convex/ manifest drift | DONE — [PR #59](https://github.com/Sebastian-Sole/gainsoclock/pull/59) |
| 021 | Real README + .env.example + server env docs | DONE — [PR #61](https://github.com/Sebastian-Sole/gainsoclock/pull/61) |
| 029 | Instrument AI-coach context cost + define the trigger | DONE — [PR #74](https://github.com/Sebastian-Sole/gainsoclock/pull/74) |
| 030 | Ship the "Generate Macros with AI" recipe button | DONE — [PR #68](https://github.com/Sebastian-Sole/gainsoclock/pull/68) |
| 031 | Finish the HealthKit re-ask eligibility gate | DONE — [PR #69](https://github.com/Sebastian-Sole/gainsoclock/pull/69) |
| 008 | Queue-aware hydration merge policy | DONE — [PR #76](https://github.com/Sebastian-Sole/gainsoclock/pull/76) |
| 018 | Type the syncToConvex chokepoint generically | DONE — [PR #73](https://github.com/Sebastian-Sole/gainsoclock/pull/73) |
| 020 | Pin @convex-dev/auth + upgrade procedure doc | DONE — [PR #60](https://github.com/Sebastian-Sole/gainsoclock/pull/60) |
| 022 | Make the perf baseline real | DONE — [PR #62](https://github.com/Sebastian-Sole/gainsoclock/pull/62) |
| 023 | Validator-derived types drift tripwire + decision | DONE — [PR #63](https://github.com/Sebastian-Sole/gainsoclock/pull/63) |
| 025 | Test-runner decision + characterization baseline | DONE — [PR #65](https://github.com/Sebastian-Sole/gainsoclock/pull/65) |
| 027 | Lucide barrel bundle cost | REJECTED (measured; no code) — [PR #77](https://github.com/Sebastian-Sole/gainsoclock/pull/77) |
| 028 | Data-export design spike (GDPR portability) | DONE — [PR #67](https://github.com/Sebastian-Sole/gainsoclock/pull/67) |
| 033 | Apple ↔ password account linking | DONE — [PR #78](https://github.com/Sebastian-Sole/gainsoclock/pull/78) |

### Cycle 1 findings record (kept for reconciliation)

New findings from Cycle 1 planning and their outcomes:

- **NEW-01** (deleteAllData table coverage) → investigated in plan 026.
- **NEW-02** (canary could never reach Maestro) → fixed in plan 024.
- **NEW-03** (dead paywall components) → **now deleted by Cycle 2 plan 044**.
- **NEW-04** (`generateAhaWorkout` orphaned) → still open; cleanup candidate
  (not re-planned; fold into a future dead-code pass if it survives).
- **NEW-05** (apple-review-notes misattribution) → corrected by plan 026.
- **NEW-06** (`bulkUpsert` is insert-only) → recorded; relevant to future
  migrations.

Findings considered and rejected in Cycle 1 (still standing — do not
re-audit): SEC-05 (dev-toolchain audit noise; re-checked in Cycle 2 as
DEP-01, same posture); DEBT-07 (settings-screen split — change-cost only);
SEC-04 (AI prompt self-injection — robustness, revisit only if shared/coach
content enters prompts); backlog.md items #1/#3/#7 (maintainer-triaged;
LATER #2 instrumented by plan 029 and gated on the `ai_context_size`
PostHog trigger — see backlog.md); smoke-test rewrite over deletion
(plan 024).

# Plan 050: Ship the built-but-benched paywall interstitial + decide the aha pipeline's fate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- components/paywall app/onboarding/paywall.tsx hooks/use-purchases.ts lib/analytics.ts convex/onboardingActions.ts convex/onboarding.ts hooks/use-consent.ts`
> **Known planned drift**: PR #88 (plan 044, approved) DELETES
> `components/paywall/paywall-interstitial.tsx` and
> `components/paywall/paywall-fallback.tsx` as dead code. Step 1 handles
> both states (files present / files deleted). Any OTHER mismatch with the
> "Current state" excerpts is a STOP condition.

## Status

- **Priority**: P1 (highest-leverage conversion change available)
- **Effort**: M (Part 1 build) + S (Part 2 decision memo)
- **Risk**: MED — touches the onboarding pricing step; a regression here
  blocks new-user completion. The soft-skip escape must be preserved.
- **Depends on**: 049 (soft — same `lib/analytics.ts` union; merge 049 first)
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

A conversion-designed paywall interstitial — above-the-fold trial
disclosure, a "what we promise" accordion, a founder letter, a methodology
link — was fully built at `components/paywall/paywall-interstitial.tsx`
(226 lines, with a11y and testIDs) and then never wired in: it has **zero
import sites**, and its impression event `paywall_interstitial_shown` is
defined in `lib/analytics.ts:61-63` but never fired. Every user instead
gets RevenueCat's generic native sheet, presented directly. Plan 044
(PR #88) is about to delete the component as dead code. This plan (Part 1)
wires the interstitial in as a pre-RC step so its conversion value can be
measured against the status quo, and (Part 2) produces a decision memo on
the *other* benched conversion asset — the orphaned "aha workout"
generation pipeline — so the operator can consciously revive or retire it.

## Current state

- `app/onboarding/paywall.tsx` — the onboarding pricing step. A spinner
  screen that logs into RevenueCat, then immediately calls
  `presentPaywall(ONBOARDING_OFFERING_ID)` (line 183). Soft paywall: every
  outcome routes to `/(tabs)` via the idempotent `finish()` (lines 70–93).
  A manual "Continue" escape appears after 6s (`MANUAL_ESCAPE_DELAY_MS`,
  line 21) to satisfy Apple 2.1(a). Analytics fired today:
  `paywall_presented` (line 119), `trial_started` on purchase (186),
  `revenuecat_ui_unavailable` on error (189/197), `paywall_dismissed` on
  cancel (191) and on manual escape (224).
- `components/paywall/paywall-interstitial.tsx` — the unused component.
  Props (lines 20–31):

  ```ts
  export type PaywallInterstitialProps = {
    priceString: string | null;
    introPriceString?: string | null;
    trialLength: string;
    trialEligible: boolean;
    subscriptionPeriod: { unit: SubscriptionPeriodUnit; numberOfUnits: number };
    ctaDisabled?: boolean;
    offlineMessage?: string | null;
    onCta: () => void;
    onSkip: () => void;
    onMethodology: () => void;
  };
  ```

  It imports `FounderLetter` and `NonPromisePledge` from the same folder
  (both alive only through it). `components/paywall/paywall-fallback.tsx`
  (106 lines) is a related unused fallback.
- `hooks/use-purchases.ts` returns (lines 474–483): `presentPaywall`,
  `presentCustomerCenter`, `restore`, `checkStatus`, `getOfferings`,
  `checkTrialOrIntroDiscountEligibility`, `isLoading`. So offering price
  data and trial eligibility are already fetchable for the props above.
  Module-level exports also include `getOfferings()` (line 137) and
  `checkTrialOrIntroDiscountEligibility(...)` (line 149).
- `lib/analytics.ts:61-63` — the pre-defined impression event:

  ```ts
  | { name: "paywall_interstitial_shown"; props: { trialEligible: boolean } }
  ```

- `app/methodology.tsx` exists — target for `onMethodology`.
- The aha pipeline (Part 2 subject): `convex/onboardingActions.ts:271`
  (`generateAhaWorkout` action) and `:285` (`runAhaGeneration`
  internalAction) — an AI-consent-gated, sanity-bounded OpenAI workout
  generator writing to the `onboardingAha` table. Server-side callers:
  `convex/onboarding.ts:458-469` (`rekickAha` mutation — "client calls this
  when S7's p99 hard-kill fires") and the queries `getAha`
  (`onboarding.ts:441`). **No client code calls `generateAhaWorkout`,
  `rekickAha`, or `getAha`** (verified by grep at plan time). The GDPR
  erasure cascade in `hooks/use-consent.ts:41` still maintains the aha
  branch. Design intent lives in `docs/prism/onboarding-flow/` (the
  master plan's centerpiece was an LLM-voiced aha card before the paywall);
  the shipped onboarding uses canned demo screens
  (`app/onboarding/demo-chat.tsx` etc.) after a documented
  "demo-onboarding pivot".
- Conventions: NativeWind classes via `cn()`, theme tokens only; every
  Pressable needs `accessibilityLabel` + `accessibilityRole`;
  `react-native-purchases` is only touched through `hooks/use-purchases.ts`
  (the interstitial itself is pure UI — keep it that way).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**:
- `app/onboarding/paywall.tsx` (present the interstitial before the RC sheet)
- `components/paywall/paywall-interstitial.tsx`,
  `components/paywall/paywall-fallback.tsx`,
  `components/paywall/founder-letter.tsx`,
  `components/paywall/non-promise-pledge.tsx` (restore if deleted; minimal
  prop adjustments only)
- `docs/design/aha-onboarding-decision.md` (create — Part 2 memo)

**Out of scope** (do NOT touch):
- `components/paywall.tsx` (the per-feature hard gate) — different surface,
  measured separately.
- `hooks/use-purchases.ts` internals, RevenueCat SDK wiring, offering IDs.
- Any Convex code, including the aha pipeline itself — Part 2 is a MEMO,
  not an implementation. Reviving or deleting the pipeline is a follow-up
  plan after the operator decides.
- `finish()` / `markOnboardingComplete` logic — the completion invariants
  (see PR #80's dead-end fix) must stay byte-identical.

## Git workflow

- Branch: `advisor/050-paywall-interstitial`
- Commits: one for restore/wire, one for the memo. Imperative subjects.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reconcile with plan 044's deletion

Check `ls components/paywall/`. Two cases:

- Files present (PR #88 not merged yet): coordinate — the operator must drop
  the two paywall deletions from that PR, or you rebase after it merges and
  restore. Report which case applies before continuing.
- Files deleted: restore them from history:
  `git checkout 4c29928 -- components/paywall/paywall-interstitial.tsx components/paywall/paywall-fallback.tsx components/paywall/founder-letter.tsx components/paywall/non-promise-pledge.tsx`

**Verify**: `ls components/paywall/` → all four files present; `npx tsc --noEmit` → exit 0.

### Step 2: Wire the interstitial into the onboarding paywall screen

In `app/onboarding/paywall.tsx`, restructure the flow so the interstitial
renders as the screen's content **instead of the bare spinner**, and the RC
sheet presents only when the user taps the CTA:

1. Keep the existing RC `logIn` effect (lines 106–177) unchanged — it must
   still complete before any present.
2. Fetch offering data for the props: use `getOfferings()` and
   `checkTrialOrIntroDiscountEligibility` from `hooks/use-purchases.ts` to
   derive `priceString`, `introPriceString`, `trialLength`,
   `trialEligible`, `subscriptionPeriod`. On timeout, rely on the
   interstitial's built-in `priceString: null` graceful state.
   *(Amended 2026-07-02 during execution review: the original text said to
   render `PaywallFallback` here, but that component requires an
   already-resolved `offering` and a direct-purchase path — it was built
   for the RC-UI-unavailable case, not the offerings-timeout case. Wiring
   it would introduce an unscoped purchase pathway. The executor caught
   this and correctly left it unwired.)*
3. On first render of the interstitial, fire
   `capture({ name: "paywall_interstitial_shown", props: { trialEligible } })`
   (once, ref-guarded).
4. `onCta` → the existing `presentPaywall(ONBOARDING_OFFERING_ID)` call and
   its existing result handling (purchased → `trial_started` + `checkStatus`;
   cancelled → `paywall_dismissed`; error → `revenuecat_ui_unavailable`).
   After the sheet closes, `finish()` exactly as today.
5. `onSkip` → `capture({ name: "paywall_dismissed", props: {} })` then
   `finish()`. The 6-second `MANUAL_ESCAPE_DELAY_MS` timer becomes
   redundant **only if** the interstitial's skip is always visible; keep
   the timer as a safety net unless the skip control renders unconditionally.
6. `onMethodology` → `router.push('/methodology')`.

The auth/`userId === null` early-exit and `ranRef` idempotence stay as-is.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors;
`grep -n "paywall_interstitial_shown" app/onboarding/paywall.tsx` → 1 match.

### Step 3: Manual flow check (simulator, if available)

Run the app (`pnpm ios`) with a fresh onboarding state and confirm: the
interstitial renders with real price copy; CTA opens the RC sheet; skip
lands on `/(tabs)` without looping back into onboarding (the PR #80
regression). If no simulator is available in your environment, state that
in your report and list this as the operator's manual QA step.

**Verify** (static fallback): `grep -n "finish()" app/onboarding/paywall.tsx`
→ present in both CTA-completion and skip paths.

### Step 4: Part 2 — the aha decision memo

Write `docs/design/aha-onboarding-decision.md` (~1–2 pages). Required
content, all grounded by reading the cited files yourself:

1. **What exists**: the `generateAhaWorkout`/`runAhaGeneration` pipeline,
   its safety gates, the `onboardingAha` table, `rekickAha`/`getAha`, the
   erasure-cascade branch in `hooks/use-consent.ts`, and the design intent
   from `docs/prism/onboarding-flow/synthesis.md` + `plan/master-plan.md`.
2. **Option A — revive**: what wiring is missing (client call after intake,
   an aha card UI before the paywall, retry via `rekickAha`), rough size
   (L), and how it would interact with the interstitial from Part 1
   (sequencing: aha card → interstitial → RC sheet).
3. **Option B — retire**: exact deletion list (both actions, the queries,
   the `onboardingAha` schema table + migration note, the consent-cascade
   branch, related copy), rough size (S), and what is lost.
4. **Recommendation with reasoning**, ending with "OPERATOR DECISION
   REQUIRED" — do not implement either option.

**Verify**: file exists; contains both options and an explicit
operator-decision marker: `grep -c "OPERATOR DECISION" docs/design/aha-onboarding-decision.md` → ≥1.

## Test plan

- No new unit tests required for the screen itself (component testing is
  out of scope per `docs/decisions/test-runner.md`).
- If `pnpm test` covers `lib/` modules you touched, they must stay green.
- Manual QA path (Step 3) is the acceptance test; list it in the PR body.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0; `pnpm lint` 0 errors; `pnpm test` passes
- [ ] `grep -rn "PaywallInterstitial" app/` → ≥1 import site (component no longer dead)
- [ ] `paywall_interstitial_shown` fired exactly once per screen mount (ref-guarded)
- [ ] Skip path reaches `finish()` — no dead-end (PR #80 invariant preserved)
- [ ] `docs/design/aha-onboarding-decision.md` exists with both options + recommendation
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `usePurchases()`/module exports do not expose enough offering data to fill
  `priceString`/`trialEligible` (e.g. `getOfferings` returns an opaque shape
  you cannot safely narrow) — report the actual shape instead of casting.
- The interstitial's props no longer match the excerpt (drift beyond the
  known 044 deletion).
- Preserving the soft-skip + `finish()` invariants would require changing
  `markOnboardingComplete` or the auth-guard — that's PR #80 territory.
- You are tempted to implement the aha revival or deletion — that is a
  follow-up plan, not this one.

## Maintenance notes

- This changes the onboarding funnel's shape: `paywall_presented` will now
  fire at RC-sheet time, after `paywall_interstitial_shown`. Whoever reads
  the PostHog funnel must add the interstitial step (impression → CTA rate
  → trial rate) before judging conversion movement.
- A contextual mid-funnel re-prompt (on `activation_gate_first_workout`,
  reusing this interstitial outside onboarding) was considered and
  deliberately deferred — do it only after this ships and baseline
  conversion data exists.
- If the operator chooses aha Option A (revive), that plan should sequence
  the aha card BEFORE this interstitial in the flow.
- Reviewer scrutiny: the skip path (no dead-end), the ref-guarded impression
  event, and that `react-native-purchases` is still only touched via
  `hooks/use-purchases.ts`.

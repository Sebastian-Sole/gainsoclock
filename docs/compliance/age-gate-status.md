# Age-gate status — findings memo (2026-06-12)

> **What this is**: a findings memo reconciling the recorded age-gate decision
> (`docs/compliance/age-gate.md`) and the compliance docs against the app as
> shipped at commit `4500535`. It changes no product behaviour. It exists to
> force an explicit operator decision (Option A or B below); the status quo is
> not a viable thing to leave undocumented.
>
> **Investigated at**: commit `4500535` (2026-06-12), branch
> `advisor/026-age-gate-reconcile`.

## TL;DR

- The **decision of record is 16+** with a client gate and a server re-check.
- **As shipped, the app collects no age at all** and never blocks an under-16
  sign-up. The server-side 16+ bound still exists but sits on a mutation
  (`completeOnboardingV2`) that has **zero client callers** — it is unreachable
  dead code on the live completion path.
- Separately, the live account-deletion cascade **misses three per-user tables**,
  two of which hold imported Apple Health data that a published privacy promise
  says is "deleted synchronously on account deletion."

## Decision of record: 16+

From `docs/compliance/age-gate.md`:

- Threshold (`age-gate.md:1`, `:9`): "Age gate (16+)" / "**Minimum age: 16.**"
- Enforcement model (`age-gate.md:42-48`): client intake screens swap in
  `<AgeGateBlock />` under 16; `lib/format.ts → parseAgeYears` returns `null`
  outside 16–100; server `convex/onboarding.ts → completeOnboardingV2 +
  assertBounds` re-verifies `ageYears >= 16` and throws `onboarding/age_gate`.
- Rationale (`age-gate.md:12-21`): AI coaching built on body data not validated
  for under-16s; GDPR Art. 8 digital-consent age (16 as the highest common EU
  denominator); product posture preferring to lose a small under-16 segment over
  shipping an unvalidated coach experience.

## Shipped reality at `4500535`

Evidence (each line independently re-verified this session):

1. **No age is collected in onboarding.** The shipped flow is
   `welcome → demo-chat → demo-meals → demo-workouts → founder-note → healthkit
   → paywall` (`app/onboarding/_layout.tsx:18-27`). There is no age screen.
   `grep -rn "ageYears" app/ components/` returns nothing — no shipped UI
   collects age.
2. **`parseAgeYears` is dead.** It is defined at `lib/format.ts:65` and has
   zero call sites: `grep -rn "parseAgeYears" app/ components/ hooks/ stores/
   lib/ | grep -v lib/format.ts` is empty.
3. **`AgeGateBlock` does not exist.** `components/onboarding/age-gate-block.tsx`
   is absent (`ls` → "No such file or directory"). The `age-gate.md:28,45`
   references to it are vestigial.
4. **The server 16+ bound is unreachable.** `assertBounds`
   (`convex/onboarding.ts:44-49`) only checks age `if (args.ageYears !==
   undefined)`, and is called only from `completeOnboardingV2`
   (`convex/onboarding.ts:71`). That mutation has **zero client callers**:
   `grep -rn "completeOnboarding" app/ components/ hooks/ stores/ providers/`
   is empty; the only other repo hit is a comment at
   `convex/onboarding.ts:265` that itself calls the V2 path "dead."
5. **The live completion path involves no age.** The shipped paywall calls
   `api.user.markOnboardingComplete` (`app/onboarding/paywall.tsx:52,165`),
   which carries no age field. Every paywall outcome (auth fall-through,
   purchase, dismissal) routes to the tabs via `router.replace('/(tabs)')`
   (`app/onboarding/paywall.tsx:64,181`).

## Gap statement

**The product currently neither asks for age nor blocks under-16 sign-ups.**
The recorded 16+ decision is enforced nowhere on the live path: the client UI
that would collect and gate age was removed in the onboarding rebuild, and the
server bound that "never trusts the client" guards a mutation no client calls.
The only remaining age protection is the App Store age rating (an operator
setting in App Store Connect, outside this repo and outside this memo).

## Options for the operator

Presented in rough ascending order of effort. No recommendation beyond ordering.

**Option A — Reinstate a minimal age question (restores the decision as
written).**
Add a single age input to an existing shipped step (e.g. the
`app/onboarding/healthkit.tsx` stats step or a small pre-paywall gate) and wire
it to the existing server bound. `assertBounds` already enforces 16–100; the
cheapest server change is to route the age through a mutation a client actually
calls (`api.onboarding.updateHealthStats`, `convex/onboarding.ts:361`, does not
currently accept age) or to re-point completion at `completeOnboardingV2`.
`parseAgeYears` (`lib/format.ts:65`) can be reused for the client parse. This is
a product + Convex change and therefore its own plan.

**Option B — Formally revise the decision (rely on App Store age rating only).**
Decide that the platform age rating is sufficient and that no in-app age gate
is required. This requires rewriting `docs/compliance/age-gate.md` (not just the
status addendum), updating the App Review notes, and revisiting the GDPR Art. 8
analysis the decision cites (`age-gate.md:16-18`) — i.e. documenting why
relying on the platform rating is acceptable for EU under-16 digital-consent
posture. Also its own plan.

**Option C — Status quo. Explicitly NOT viable to leave undocumented.** Shipping
a compliance doc that asserts a 16+ gate the product does not enforce is the
exact failure this memo was written to surface. This memo forces A or B.

## Deletion-coverage matrix (account deletion)

The client deletes accounts via `api.onboarding.deleteAccount`
(`app/settings/delete-account.tsx:44`), which schedules the internal cascade
`deleteAccountCascade` (`convex/onboarding.ts:500-630`). A separate, **unused-by-
the-client** action `deleteAllData` (`convex/user.ts:240-283`) exists but is not
the live path; its narrower 14-table list is noted for contrast only.

Inventory: `convex/schema.ts` defines 23 per-user tables (every one carries
`userId`) plus the `@convex-dev/auth` `authTables`.

| Per-user table (`schema.ts`) | `deleteAccountCascade` (LIVE) | `deleteAllData` (unused) |
| --- | --- | --- |
| exercises | yes (`:553`) | yes (`user.ts:259`) |
| templates | yes (`:552`) | yes (`:258`) |
| templateExercises | yes (`:520-524`) | yes (`:257`) |
| workoutLogs | yes (`:551`) | yes (`:256`) |
| workoutLogExercises | yes (`:513-517`) | no |
| workoutSets | yes (`:506-510`) | yes (`deleteWorkoutSetsBatch`, `:249`) |
| userSubscriptions | yes (`:560`) | yes (`:265`) |
| userProfile | yes (`:559`) | no |
| userConsents | yes (`:574-578`) | no |
| onboardingAha | yes (`:564`) | no |
| aiSafetyIncidents | yes (`:580-584`) | no |
| userSettings | yes (`:554`) | yes (`:260`) |
| userOnboarding | yes (`:558`) | yes (`:264`) |
| chatConversations | yes (`:561`) | yes (`:267`) |
| chatMessages | yes (`:534-538`) | yes (`:266`) |
| workoutPlans | yes (`:560`) | yes (`:268`) |
| planDays | yes (`:527-531`) | yes (`:269`) |
| recipes | yes (`:555`) | yes (`:261`) |
| mealLogs | yes (`:556`) | yes (`:262`) |
| nutritionGoals | yes (`:557`) | yes (`:263`) |
| **externalWorkouts** | **NO** | **NO** |
| **healthDailyMetrics** | **NO** | **NO** |
| **weeklyReviews** | **NO** | **NO** |
| _authTables (sessions, accounts, etc.)_ | yes (`:589-613`) | no |
| _users row_ | yes (`:617-620`) | no |

Verified absent from both deletion files:
`grep -rn "externalWorkouts\|healthDailyMetrics\|weeklyReviews" convex/onboarding.ts convex/user.ts` → no matches.

### Severity note

`externalWorkouts` (`schema.ts:359-373`) and `healthDailyMetrics`
(`schema.ts:376-386`) hold **imported Apple Health data** (HealthKit workouts,
daily sleep/HR/HRV/steps/body-mass). `docs/privacy-nutrition-label.md:49-50`
promises this category is "deleted synchronously on account deletion (5.1.1(v)
path)." At `4500535` that promise is **not met**: neither deletion path touches
these tables, so imported Apple Health rows survive account deletion.
`weeklyReviews` (`schema.ts:390-398`, AI-generated training summaries) is also
orphaned, lower-stakes but still per-user PII that escapes Art. 17 erasure.

This is the single highest-severity finding in this memo. **Fixing it is out of
scope here** (hard boundary — see `plans/026-age-gate-reconcile.md` "Out of
scope"); it should land as its own plan. This memo records only what the
deletion paths cover today.

## Note for whoever fixes deletion

When a new per-user table is added to `convex/schema.ts`, it must be added to
`deleteAccountCascade` (`convex/onboarding.ts`). The three tables above slipped
through exactly because no guard ties schema growth to the deletion cascade.

## Historical names referenced by older docs

Some prior compliance docs cited files that no longer exist at `4500535`. They
are listed here once as historical context (so future readers aren't confused),
and have been removed from the live docs by plan 026:

- `app/onboarding/aha.tsx` — deleted (the personalised-reveal screen).
- `components/onboarding/age-gate-block.tsx` — never present in this checkout.
- `app/onboarding/healthkit-prefill.tsx`, `app/onboarding/manual-stats.tsx` —
  replaced by `app/onboarding/healthkit.tsx`.
- `providers/analytics-provider.tsx` — renamed to
  `providers/posthog-provider.tsx`.

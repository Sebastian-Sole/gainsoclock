# Sub-Plan 09: Post-Paywall Activation Checklist (S10 + S11)

## Dependencies
- **Requires:**
  - plan-00 — spotlight tour deleted; Mural replaces it
  - plan-01 — schema + `userProfile.dataSource` for S11 re-ask gating + mutations
  - plan-03 — analytics events `activation_gate_*`, `healthkit_reask_*`
  - plan-06 — `HealthKitReaskCard` primitive (mounted here)
  - plan-07 — aha action produces the first plan; item-2 pre-complete logic depends on the aha/full-plan distinction
  - plan-08 — trial confirmation banner; Settings privacy route exists for the "Enable AI personalisation" item
- **Blocks:**
  - plan-10 — pre-ship polish verifies ≤ 3 concurrent `useQuery` per screen

## Objective
Replace the old spotlight tour entirely with a Mural-style activation checklist on the home tab. Five items — (1) log a workout, (2) generate a full plan, (3) send a first coach message, (4) import HealthKit if not done, (5) set a weekly target — drive the first-session experience. Item 2 resolves on the first user-requested multi-week plan, NOT the aha card (important distinction from plan-07). All five booleans come from one aggregated `api.home.getActivationState` query — not five `useQuery` hooks. The skeptic cohort (plan-04 side-door) gets item 1 replaced with "Enable AI personalisation" routing to `app/settings/privacy.tsx`. The S11 re-ask card from plan-06 mounts here with its 30-day/permanent cadence cap.

## Context

### Stack facts
- **Runtime:** Expo SDK 54, React 19, React Compiler on.
- **Router:** Expo Router 6. Home tab is `app/(tabs)/index.tsx`.
- **Convex:** one aggregated query per screen is the target (Performance #6 / Phase 10 exit criterion ≤ 3 concurrent `useQuery`).

### Coding conventions that apply here
- No `any`. Five booleans + metadata comes in one typed object.
- `getAuthUserId` on the new `api.home.getActivationState` query.
- Wrapper-only imports: RevenueCat/HealthKit/analytics routes through their wrappers from earlier phases.
- Accessibility: each checklist item is `accessibilityRole="button"` with `accessibilityState={{ disabled, selected }}` where `selected === completed`; `accessibilityLabel` includes state copy.
- Stable keys on list map.

### Gate decisions + themes that apply
- **UX #9:** checklist individual items dismissible; checklist non-dismissible until ≥3 items complete; then collapsible chip "4/5 complete — tap to expand". Full-complete → *"Setup done. See you {firstTrainingDay}."* No confetti.
- **UX #9 (item 2):** resolves on first user-*requested* full multi-week plan (chat action / plan create flow). NOT the aha. Pre-complete, greyed, microcopy *"done during setup"* for the intake cohort.
- **UX #8 (skeptic override):** skeptic cohort (users who took the S1 side-door — detectable from `userConsents` all-false OR from a stored flag on `userProfile`) gets item 1 replaced with *"Enable AI personalisation"* → `/settings/privacy`.
- **Performance #6:** one aggregated query.
- **Mobile-A11y #15:** checklist items + re-ask card role/state documented.
- **HealthKit-Privacy C2:** S11 cadence cap — plan-06 shipped the primitive; this phase just mounts.

### Files this sub-plan touches
- **New (Convex):**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/home.ts` — `getActivationState` aggregated query.
- **New (components):**
  - `/Users/sebastiansole/Documents/gainsoclock/components/home/activation-checklist.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/home/activation-item.tsx`
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/app/(tabs)/index.tsx` — compose banner (plan-08) + checklist (this phase) + re-ask card (plan-06) into a single layout; ensure aggregated query count ≤ 3.
  - `/Users/sebastiansole/Documents/gainsoclock/stores/auth-cache-store.ts` (or a new slice) — persist per-item dismiss state + checklist dismissed-until-3-complete flag.

### Data contracts

**`convex/home.ts`:**
```ts
export const getActivationState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const profile = await ctx.db.query("userProfile").withIndex("by_user", q => q.eq("userId", userId)).unique();
    const consents = await getConsentsReduced(ctx, userId); // inline helper or reuse
    const workoutLogsCount = await countByIndex(ctx, "workoutLogs", "by_user", userId);
    const workoutPlansCount = await countByIndex(ctx, "workoutPlans", "by_user", userId);
    const chatMessagesCount = await countByIndex(ctx, "chatMessages", "by_user", userId); // count of user-authored messages
    const weeklyTarget = profile?.trainingDaysOfWeek?.length ?? 0; // proxy: if user has picked days, count > 0
    const isSkeptic = consents.ai_coach_inference?.granted !== true;
    return {
      items: {
        logWorkout: workoutLogsCount >= 1,
        generatePlan: workoutPlansCount >= 1,           // full plan, not aha
        firstCoachMessage: chatMessagesCount >= 1,
        importHealthKit: profile?.dataSource !== "manual",
        setWeeklyTarget: weeklyTarget >= 1,
      },
      skepticCohort: isSkeptic,
      // Item 2 pre-complete microcopy for intake cohort:
      generatePlanMicrocopy: !isSkeptic && workoutPlansCount === 0 ? "done during setup" : null,
      firstTrainingDay: profile?.trainingDaysOfWeek?.[0] ?? null,
    };
  }
});
```

Important: `workoutPlansCount` must count user-requested plans, not the aha workout (which is in `onboardingAha`, a separate table — plan-01). The aha workout does NOT increment `workoutPlans`. When plan-07's follow-up chat flow creates a full multi-week plan in `workoutPlans`, that increments this count.

**`components/home/activation-checklist.tsx`:**
```tsx
export function ActivationChecklist(): JSX.Element | null;
```
- Reads `useQuery(api.home.getActivationState)`.
- Computes `completedCount = Object.values(items).filter(Boolean).length`.
- Reads dismiss state from Zustand: `items: Partial<Record<ActivationItemId, boolean>>` + `collapsedToChip: boolean` + `permanentlyDismissed: boolean`.
- Render states:
  - `completedCount === 5` → replace with *"Setup done. See you {firstTrainingDay}."* (firstTrainingDay formatted as "Monday"). After 48h on complete state, the component returns null (permanent).
  - `completedCount >= 3 && collapsedToChip` → render collapsed chip *"{completedCount}/5 complete — tap to expand"* with `accessibilityRole="button"`.
  - Else → expanded list of 5 items.
- Each item renders via `<ActivationItem>` with:
  - `label`, `completed`, `microcopy` (optional greyed note like "done during setup"), `onTap` (routes to the relevant flow), `onDismiss` (individual dismiss, allowed at any time).
- Analytics: on mount, no event (avoid noise). On each item flip to `completed`, fire `activation_gate_{itemName}` (template literal in the `AnalyticsEvent` union). On user-initiated reset in Settings (optional stretch; not V1 blocker), reset dismiss state.

**Item mapping (labels + routes):**
| id | label (intake cohort) | label (skeptic) | route/onTap |
|---|---|---|---|
| logWorkout | "Log your first workout" | "Enable AI personalisation" (replaces this slot) | `/workout/new` / `/settings/privacy` |
| generatePlan | "Generate your training plan" | same | `/chat` or plan-creation screen (existing) |
| firstCoachMessage | "Ask the coach a question" | same | `/chat` |
| importHealthKit | "Import from Apple Health" | same | triggers HealthKit primer (or Settings if denied) — reuse `<HealthKitReaskCard>` CTA behaviour |
| setWeeklyTarget | "Set your weekly target" | same | `/settings` (a target-setting surface exists or is trivial) |

For skeptic cohort: the FIRST slot swaps to *"Enable AI personalisation"* routing to `/settings/privacy`. Completed when `consents.ai_coach_inference.granted === true`. Plan-09's `getActivationState` doesn't directly mark this; plan-09 handles it in `<ActivationChecklist>` by replacing `items.logWorkout` with a derived boolean from `consents`.

**`components/home/activation-item.tsx`:**
```tsx
export function ActivationItem({
  id, label, completed, microcopy, onTap, onDismiss,
}: ActivationItemProps): JSX.Element;
```
- Accessibility: `accessibilityRole="button"`, `accessibilityState={{ disabled: completed, selected: completed }}`, `accessibilityLabel` = `${label}${completed ? ", completed" : ", not completed"}`.
- Visual: checkbox icon + label + (optional) microcopy + Dismiss X.
- Reduce-Motion gates any checkmark animation.
- Touch target ≥ 44pt.

**`app/(tabs)/index.tsx` composition:**
- Order (top to bottom):
  1. `<TrialConfirmationBanner />` (from plan-08).
  2. Primary content card ("Your first session is ready" when no item complete; else contextual).
  3. `<ActivationChecklist />`.
  4. `<HealthKitReaskCard />` (from plan-06 — mounts here when eligible).
  5. Existing content (feed, recent workouts, etc.).
- **Query budget:** aggregated `getActivationState` is ONE query. `subscription-store` feeds trial banner without a separate query (it's pushed via `convex-sync-provider`). `HealthKitReaskCard` reads `profile.dataSource` via `getActivationState`? No — simpler: have the card pass through the profile slice from `getActivationState` via a prop from `(tabs)/index.tsx` to avoid duplicate queries. Target: ≤ 3 concurrent `useQuery` per screen.

**Empty state copy (UX #9):**
- Before any item complete: primary card above the checklist reads *"Your first session is ready"* and links to the aha workout (plan-07's stored row) as a "Start" action.

**Full-complete behaviour:**
- `completedCount === 5` state shows *"Setup done. See you {firstTrainingDay}."* in the checklist's space for 48h (tracked via `firstCompletedAt` in local Zustand), then renders null permanently.

### Gotchas (from reviews)

- **UX #9 (item 2):** the resolution criterion is subtle. The aha workout is NOT a "plan." A full plan is a user-requested multi-week program generated via chat or a plan-create flow. Query `workoutPlans`, not `onboardingAha`. If you're tempted to mark item 2 complete on first aha, stop.
- **UX #9 (microcopy):** item 2 for intake cohort is pre-complete with *"done during setup"* greyed text. This lies gently — the user did NOT generate a full plan during setup, but the aha signals commitment. If copy review pushes back, swap to *"Generate a full plan"* without greyed microcopy.
- **Performance #6:** one aggregated query. Resist the urge to split for "readability." Convex can count across indexes cheaply.
- **UX #8 (skeptic):** skeptic detection is by consent state, not by a stored cohort flag. A skeptic who later enables `ai_coach_inference` via Settings drops out of skeptic state — the checklist recomputes.
- **HealthKit-Privacy C2:** plan-06's re-ask card already caps dismissals. Don't add another dismissal path from plan-09's checklist that would race the cap.
- **Analytics:** `activation_gate_{name}` fires on flip to complete, not on re-mount. Use `useEffect` with previous-state comparison or a one-shot flag.

## Implementation

1. **Create `convex/home.ts::getActivationState`.**
   - **What:** per Data contract. Use `count` helpers (or `collect().length` if no count helper — Convex supports `count()` in recent versions; otherwise paginate).
   - **Approach:** single query; `getAuthUserId` first; reduce consents; return the items object.
   - **Test:** `pnpm convex:dev`; REPL with seeded data.

2. **Create `components/home/activation-item.tsx`.**
   - **What:** per Data contract.
   - **Test:** `npx tsc --noEmit`.

3. **Create `components/home/activation-checklist.tsx`.**
   - **What:** per Data contract. Skeptic swap of item 1; full-complete state; collapsed chip at ≥3.
   - **Approach:** reactive via Zustand dismiss slice; memo the derived list with `useMemo`.
   - **Analytics:** `activation_gate_{name}` on flip. Use `useRef<previousItemState>` to detect transitions.
   - **Test:** `npx tsc --noEmit`.

4. **Extend `stores/auth-cache-store.ts` (or sibling slice) with dismiss state.**
   - **What:** persist `{ items: Record<ActivationItemId, boolean>; collapsedToChip: boolean; firstCompletedAt: string | null }`.
   - **Test:** `npx tsc --noEmit`; manual — dismiss an item, relaunch, verify persistence.

5. **Compose `app/(tabs)/index.tsx`.**
   - **What:** mount order per Data contract; verify `≤ 3 concurrent useQuery` (count: `getActivationState` + `subscription-store` (no query, pushed) + possibly one more for feed/recent workouts = ≤ 3 total).
   - **Approach:** if existing code on `(tabs)/index.tsx` fires >2 additional `useQuery` calls, inline those into a single aggregated query or defer to navigation into sub-screens.
   - **Test:** manual; inspect React DevTools for `useQuery` hook count.

6. **Wire HealthKitReaskCard mount.**
   - **What:** import `components/home/healthkit-reask-card.tsx` (plan-06) and mount in the home layout. Card's own render-null logic handles when to appear.
   - **Test:** manual — with a manual-data-source user + 1 workout logged, card renders.

7. **Verify skeptic cohort flow.**
   - **What:** seed a dev user who signed in via the skeptic side-door (no consents granted). Verify item 1 shows "Enable AI personalisation" routing to `/settings/privacy`. After enabling `ai_coach_inference`, verify item 1 reverts to "Log your first workout".
   - **Test:** manual.

8. **Analytics: `activation_gate_*` firing.**
   - **What:** confirm each item firing flip emits exactly once. Use a `useRef` to hold previous-state; on transition `false → true`, fire.
   - **Test:** manual — complete an item; PostHog shows one event.

### Test discipline
- Step 1: REPL with seeded data for each item state.
- Step 3: manual state transitions.
- Step 5: React DevTools hook count ≤ 3.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `convex/home.ts` exports `getActivationState` aggregated query.
- [ ] Code: `components/home/activation-checklist.tsx` + `activation-item.tsx` exist.
- [ ] Code: 5 items; individual dismissible; checklist collapsible at ≥3 complete; full-complete → "Setup done. See you {day}." then null after 48h.
- [ ] Code: item 2 pre-complete with microcopy for intake cohort; criterion = `workoutPlansCount >= 1` (NOT `onboardingAha`).
- [ ] Code: skeptic cohort (no `ai_coach_inference` consent) shows item 1 as "Enable AI personalisation" → `/settings/privacy`.
- [ ] Code: HealthKit re-ask card (plan-06) mounted on home tab.
- [ ] Perf: ≤ 3 concurrent `useQuery` on `(tabs)/index.tsx` (verified via React DevTools).
- [ ] Analytics: `activation_gate_{name}` fires exactly once on transition to complete.
- [ ] Accessibility: each item announces state; 44×44pt targets; collapsed chip has `accessibilityRole="button"`.
- [ ] Dismissal persists across relaunches.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Maestro `testID` props in place (for plan-10's `06-activation-checklist.yaml`).
- [ ] Manual smoke:
  - Fresh intake user: checklist visible with item 2 pre-complete (microcopy shown).
  - Log a workout: item 1 flips; event fires.
  - Skeptic side-door user: item 1 reads "Enable AI personalisation"; enabling toggles it.
  - 3+ items complete: checklist collapses to chip; tap expands.
  - 5 items complete: state becomes "Setup done. See you {firstTrainingDay}." for 48h then disappears.
  - HealthKit re-ask: denied user with 1 workout logged sees the card; dismiss twice → permanent suppression.
- [ ] Out-of-scope: the Settings target-setting surface (exists or is trivial — don't rewrite); pre-ship Maestro flow authoring (plan-10).

## Risks

- **Risk:** `count` across indexes is O(n) in Convex and breaks on power users with thousands of rows.
  - **Detect:** query latency.
  - **Mitigate:** use `take(1)` existence checks (cheap) instead of full counts — e.g. `await ctx.db.query("workoutLogs").withIndex("by_user", q => q.eq("userId", userId)).take(1).then(r => r.length >= 1)`. Only the boolean matters.
  - **Escalate:** if Convex exposes `count()`, use it.

- **Risk:** item 2 criterion drifts to include aha over time (copy/logic confusion).
  - **Detect:** code review.
  - **Mitigate:** comment in `getActivationState`: `// Item 2: full plan only; aha workouts live in onboardingAha and do NOT increment workoutPlans.`
  - **Escalate:** plan-10 pre-ship re-verifies.

- **Risk:** skeptic detection by consent state misfires during the brief window between account creation and Convex query settling.
  - **Detect:** flash of wrong item 1 on first home-tab mount.
  - **Mitigate:** `getActivationState` waits for consents to load (default to non-skeptic while undefined); `useOnboardingStatus` from plan-00 indicates readiness.
  - **Escalate:** if flicker persists, show a neutral placeholder while loading.

- **Risk:** dismiss state persists for an unbounded set of items if item IDs change.
  - **Detect:** future refactor.
  - **Mitigate:** only 5 stable IDs; use a typed record keyed on the literal union.
  - **Escalate:** minor.

- **Risk:** analytics fires on every mount because the previous-state ref didn't persist.
  - **Detect:** PostHog shows repeated `activation_gate_*` events for the same user/item.
  - **Mitigate:** persist last-seen-state in Zustand; compare against current.
  - **Escalate:** medium; plan-10 audit flags.

- **Risk:** full-complete state is hidden too soon because `firstCompletedAt` wasn't set atomically.
  - **Detect:** UX — "Setup done" flash.
  - **Mitigate:** set `firstCompletedAt` on the first render where `completedCount === 5`; only null out after 48h elapsed.
  - **Escalate:** minor.

- **Risk:** query count creep over time — next phase adds a `useQuery` to home tab and blows the ≤ 3 budget.
  - **Detect:** plan-10 audit.
  - **Mitigate:** doc-comment on `getActivationState` naming it the preferred aggregation point.
  - **Escalate:** any new hook must either fold into `getActivationState` or justify the budget violation.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. React DevTools: `useQuery` hooks on home ≤ 3.
5. Manual smoke: fresh intake, skeptic, mid-complete, full-complete, re-ask card.
6. Analytics verified: one `activation_gate_*` per flip.
7. Report diffs.

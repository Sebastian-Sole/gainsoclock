# Plan 053: Close the macro-targets loop — calculator "Apply", real Apple Health activity, AI set-goals tool

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 4c29928..HEAD -- app/calculator/calorie.tsx stores/nutrition-goals-store.ts convex/nutritionGoals.ts convex/chatActions.ts convex/aiTools.ts components/chat lib/healthkit.ts`
> On any mismatch with the "Current state" excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: M (three independent workstreams: S + S + M)
- **Risk**: LOW for workstreams 1–2 (additive UI); MED for workstream 3
  (touches the AI tool-calling contract — cross Expo↔Convex boundary).
- **Depends on**: none. **Convex deploy required after merge** (workstream 3).
- **Category**: direction
- **Planned at**: commit `4c29928`, 2026-07-02

## Why this matters

The app computes macro targets in two places and can save them in neither.
The calorie calculator produces a full target (calories + 30/40/30
protein/carbs/fat split) that the user must hand-copy into the Edit Goals
modal; its "Apple Health" activity option is a hardcoded placeholder that
tells the user so on screen. And the AI coach — positioned as a
macro-targets advisor — has no tool to set goals: it can create templates,
plans, recipes, and log meals via the approval flow, but "aim for 180g
protein" dead-ends as chat text. All the write plumbing exists
(`nutritionGoals.upsert`, the offline-queued store, the approval-card
dispatch). Three small wires close the loop.

## Current state

- **Calculator** — `app/calculator/calorie.tsx`:
  - Result computation (lines 155–164):

    ```ts
    const tdee = Math.round(bmr * activityMultiplier);
    const dailyAdjustment = goalDirection === 'maintain' ? 0 : Math.round((goalKgPerWeek * CAL_PER_KG) / 7);
    const target = tdee + dailyAdjustment;
    // Macro split: 30% protein, 40% carbs, 30% fat
    const protein = Math.round((target * 0.3) / 4);
    const carbs = Math.round((target * 0.4) / 4);
    const fat = Math.round((target * 0.3) / 9);
    setResult({ bmr: Math.round(bmr), tdee, target, protein, carbs, fat, activityMultiplier });
    ```

  - Activity-source placeholder (lines 144–150):

    ```ts
    if (activitySource === 'app_history' && appActivityStats) {
      activityMultiplier = estimateActivityMultiplier(appActivityStats.weeklyCalsBurned);
    } else if (activitySource === 'apple_health') {
      // Placeholder — use moderate as fallback
      activityMultiplier = 1.55;
    }
    ```

  - Visible placeholder copy (lines ~383–390): "Apple Health integration
    will use your active energy data. Using moderate estimate for now."
    guarded by a `healthKitEnabled` flag already in the component.
  - Results render at lines 456–499 (`result.target`, `result.protein`,
    `result.carbs`, `result.fat` cards) — the "Apply" button goes below this.
- **Goals store** — `stores/nutrition-goals-store.ts` (whole file is ~55
  lines): `setGoals` already routes through the offline queue:

  ```ts
  setGoals: (goals) => {
    set({ goals });
    syncToConvex(api.nutritionGoals.upsert, goals);
  },
  ```

  `NutritionGoals` = `{ calories, protein, carbs, fat }` (`lib/types.ts`).
  Writer exemplar: `components/nutrition/edit-goals-modal.tsx:29,46`.
- **Server mutation** — `convex/nutritionGoals.ts:18-40`: `upsert` takes
  `{ calories, protein, carbs, fat }` numbers, auth-checked, patch-or-insert.
- **HealthKit reads** — `lib/healthkit.ts` (iOS-only; only this file and
  `hooks/use-healthkit.ts` may import the module — repo rule):
  `queryDailyMetrics` (line 502) returns per-day metrics including
  `activeEnergyKcal`; `getLatestStats` (line 185) is the lighter
  latest-values reader. The calculator already knows `healthKitEnabled`.
- **AI tool surface**:
  - `convex/chatActions.ts:50` — `const TOOLS: ChatCompletionTool[]` with
    entries `create_workout_template` (:54), `create_workout_plan` (:127),
    `update_workout_plan` (:220), `suggest_recipe` (:298), `log_meal`
    (:347). A `getApprovalType(name)` mapping lives at :819.
  - `convex/aiTools.ts:409` — `executeApproval` mutation with per-type
    branches: `create_template` (:432), `create_plan` (:492), `log_meal`
    (:742). Payload validators live above (e.g. log_meal validation :374).
  - Client approval UI: `components/chat/approval-card.tsx` plus per-type
    preview components (`meal-log-preview.tsx`, `recipe-preview.tsx`,
    `template-preview.tsx`, ...). Follow `log_meal`'s trail end-to-end as
    the structural template — it is the closest shape (small numeric
    payload).
- Conventions: comma-decimal locale — any NEW numeric input must go through
  the shared parser in `lib/format.ts` (workstream 1 adds no inputs, only a
  button — but if you add editable fields, use it). Validators in
  `convex/validators.ts` are the enum source of truth. Theme tokens, a11y
  labels/roles on every Pressable.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |

## Scope

**In scope**:
- `app/calculator/calorie.tsx` (Apply button; apple_health branch)
- `convex/chatActions.ts` (one TOOLS entry + `getApprovalType` case + system-prompt line if the prompt enumerates tools — check)
- `convex/aiTools.ts` (payload validation + `executeApproval` branch)
- `components/chat/approval-card.tsx` + a new
  `components/chat/nutrition-goals-preview.tsx` (approval preview)
- `convex/validators.ts` — one additive literal in `approvalTypeValidator`.
  *(Amended 2026-07-02 during execution review: the original scope missed
  that `pendingApproval.type` is validated against this union at the
  `insertMessage`/`updateMessageWithToolCalls` boundary — without the new
  literal the tool fails Convex arg validation at runtime. The executor
  caught it and correctly reported the deviation.)*
- `lib/format.ts` tests only if touched (unlikely)

**Out of scope** (do NOT touch):
- `stores/nutrition-goals-store.ts`, `convex/nutritionGoals.ts` — they
  already do exactly what's needed; the AI branch reuses the same upsert
  logic server-side.
- `components/nutrition/edit-goals-modal.tsx` — stays the manual fallback.
- AI **meal-plan generation** (recorded direction finding DIR-02) — a much
  larger feature; this plan only sets the four target numbers.
- The calculator's BMR/TDEE math and the 30/40/30 split — not renegotiated
  here.

## Git workflow

- Branch: `advisor/053-nutrition-goals-loop`
- Commits: one per workstream.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (workstream 1): "Apply to my goals" on the calculator result

In `app/calculator/calorie.tsx`, below the macro cards in the result block
(after line ~499), add a primary button "Set as my nutrition goals"
(a11y label + role, 44pt target) that calls:

```ts
useNutritionGoalsStore.getState().setGoals({
  calories: result.target,
  protein: result.protein,
  carbs: result.carbs,
  fat: result.fat,
});
```

then confirms with existing feedback conventions (haptic via
`lib/haptics.ts` + a success state on the button or toast — copy whatever
`edit-goals-modal.tsx` does on save). The store's `setGoals` already syncs
offline-first; do NOT call the Convex mutation directly.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → 0 errors.

### Step 2 (workstream 2): Real active-energy multiplier for `apple_health`

Replace the placeholder branch (lines 144–150): when
`activitySource === 'apple_health'` and `healthKitEnabled`, fetch the last
14 days of `activeEnergyKcal` via `queryDailyMetrics` from
`lib/healthkit.ts` (guard `Platform.OS === "ios"` — the file's functions
no-op elsewhere, but keep the calculator's existing guard pattern), sum to
a weekly average, and reuse the SAME `estimateActivityMultiplier(weeklyCals)`
already used for `app_history`. Fall back to `1.55` when no data or the
query fails, and keep the placeholder copy ONLY for the no-data case —
update it to say a moderate estimate is being used because no Apple Health
energy data was found. Fetch on selection (async state), not during render.

**Verify**: `npx tsc --noEmit` → exit 0;
`grep -n "Placeholder — use moderate" app/calculator/calorie.tsx` → 0 matches.

### Step 3 (workstream 3): `set_nutrition_goals` AI tool

Follow `log_meal`'s implementation trail exactly:

1. `convex/chatActions.ts`: add a TOOLS entry `set_nutrition_goals` —
   description like "Set the user's daily nutrition goals (calories and
   macro grams). Use when the user asks you to set/update their targets.";
   parameters: `calories`, `protein`, `carbs`, `fat` (numbers, all
   required). Add its case to `getApprovalType` (:819) so it becomes an
   approval, not an auto-execution.
2. `convex/aiTools.ts`: add payload validation mirroring the log_meal
   validator style (:374) with sanity bounds (calories 800–10000, macros
   0–1000 — reject outside; these mirror the coach's safety posture).
   Add the `executeApproval` branch: auth user already resolved by the
   mutation; perform the same patch-or-insert as
   `convex/nutritionGoals.ts:29-38` (duplicate the ~8 lines inside
   `aiTools.ts` following how other branches inline their writes — do not
   import the public mutation).
3. Client: add `components/chat/nutrition-goals-preview.tsx` (four labeled
   numbers, modeled on `meal-log-preview.tsx`) and register the type in
   `components/chat/approval-card.tsx` where the other previews dispatch.
4. If the coach's system prompt (in `convex/chatActions.ts` or
   `chatInternal.ts`) enumerates available tools/capabilities, add one line
   for goal-setting; if it doesn't enumerate, change nothing.

**Verify**: `npx tsc --noEmit -p convex` → exit 0; `npx tsc --noEmit` →
exit 0; `pnpm lint` → 0 errors.

### Step 4: Client store consistency after AI writes

The AI branch writes `nutritionGoals` server-side, but the client's goals
live in the Zustand store hydrated via `hydrateFromServer`. Find where
nutrition goals hydrate (grep `hydrateFromServer` usage for the goals store
in `providers/convex-sync-provider.tsx`) and confirm a server-side change
reaches the store on next hydrate. If goals hydrate only at app start,
state that in your report (acceptable v1: the chat approval card can tell
the user the new goals apply after refresh — but prefer confirming the
existing `useQuery`-driven hydration picks it up live).

**Verify**: describe the observed hydration path in your report (this step
is investigation; no code change unless a one-line subscription fix is
obvious and in-scope).

## Test plan

- Convex code is outside `pnpm test` scope. Pure client logic added in
  Step 2 (weekly-average derivation) should be a small exported helper in
  `app/calculator/calorie.tsx` — if you extract it to `lib/` (e.g.
  `lib/activity-energy.ts`), add `lib/activity-energy.test.ts` with: empty
  metrics → fallback flag, 14 days of data → correct weekly average,
  partial data → averages over present days. Model on any `lib/*.test.ts`
  table style.
- Workstream 3's server-side bounds are exercised via type-check + manual
  QA (ask the coach "set my protein to 180g" in dev → approval card → row
  updated). List this in the PR body as the operator QA step.

## Done criteria

- [ ] `npx tsc --noEmit` and `npx tsc --noEmit -p convex` exit 0; lint 0; tests pass
- [ ] Calculator result screen has an apply button that routes through `useNutritionGoalsStore.setGoals`
- [ ] The `apple_health` placeholder branch and its "for now" copy are gone; fallback only on no-data
- [ ] `set_nutrition_goals` exists in TOOLS, `getApprovalType`, `executeApproval`, and has an approval preview component
- [ ] Sanity bounds reject absurd goal values server-side
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated; report states "needs Convex deploy"

## STOP conditions

Stop and report back (do not improvise) if:

- The approval-card dispatch in `components/chat/approval-card.tsx` is not
  a per-type mapping you can extend without restructuring.
- `executeApproval` branches have auth/ownership handling that differs from
  what `convex/nutritionGoals.ts` does (don't pick one — report).
- `queryDailyMetrics`'s return shape doesn't include `activeEnergyKcal`
  per day (drift from `convex/schema.ts:376`'s field set).
- The chat system prompt hard-codes a tool list that conflicts with adding
  a tool (e.g. "you have exactly five tools").

## Maintenance notes

- The 30/40/30 split is now reachable from two write paths (calculator, AI)
  plus the manual modal — if the split ever becomes configurable, all three
  converge on `setGoals`/`upsert`, which is the point of this plan.
- Protein-nudge notifications read goals (`recomputeProteinNudge` callers
  in `components/nutrition/`) — a goals change via AI now updates nudge
  math on next recompute; no action needed, but reviewers should know.
- Deferred: AI *meal-plan generation* (DIR-02, L-sized) and letting the AI
  read current goals as a tool (it may already receive them in context —
  check `chatInternal.ts` before adding).
- Reviewer scrutiny: no direct `react-native-healthkit` import outside
  `lib/healthkit.ts`; the AI branch's bounds; the apply button's offline
  behavior (queue, not direct mutation).

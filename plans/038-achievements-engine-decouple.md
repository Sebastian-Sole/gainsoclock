# Plan 038: Move achievement unlock detection off the always-mounted toast host

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- hooks/use-achievements.ts components/achievements/unlock-toast.tsx lib/achievements.ts stores/achievements-store.ts providers/convex-sync-provider.tsx app/_layout.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED (user-visible unlock timing; mitigated by keeping evaluation logic pure and reused)
- **Depends on**: plans/043-stats-legacy-streak-pass.md (soft — do the S-sized 043 first; both touch the stats path)
- **Category**: perf
- **Planned at**: commit `08f585b`, 2026-07-02; **reconciled against `4c74c6a`** (toast-flood hotfix), 2026-07-02 — see the baseline-seeding notes threaded through Current state / Step 3 / Step 4.

## Why this matters

`UnlockToastHost` is mounted unconditionally in the root navigator
(`app/_layout.tsx:216`) and calls `useAchievements()`
(`components/achievements/unlock-toast.tsx:55`). That hook is the app's
heaviest: it holds **three permanent Convex subscriptions** (a 365-day
meal-log range, external workouts, health summary) plus `useStats(ALL_TIME)`
(which itself scans all logs ~8 ways), and re-runs `countWeightPrs` +
`computeWorkoutSignals` over the entire history whenever any of ~14
dependencies changes — on every screen, for the whole session, just to feed
a toast. When the stats or achievements screen is open, a second mount
recomputes everything independently. Cost scales with history size, on the
JS thread. This plan moves unlock *detection* into an event-driven,
debounced engine that runs outside React and uses one-shot queries, while
screens keep their (transient) rich view.

## Current state

- `app/_layout.tsx:56` — `new ConvexReactClient(CONVEX_URL, ...)`; line 216
  mounts `<UnlockToastHost />` inside `RootNavigator`.
- `providers/convex-sync-provider.tsx:42` — `setConvexClient(convex);` — the
  established place where the client is handed to non-React modules. The
  engine init belongs next to it.
- `components/achievements/unlock-toast.tsx:55` —
  `const { newlyUnlocked } = useAchievements();` — the ONLY thing the host
  consumes. It enqueues toasts from `newlyUnlocked` and routes to
  `/achievements` on tap.
- `hooks/use-achievements.ts` (231 lines) — read it fully. Key structure:
  - Subscribes to 8 zustand stores (lines 105-118): history `logs` +
    `loadedRange`, plan `activePlanWithDays` + `plans`, recipes,
    grocery `items`, nutrition goals, settings `weightUnit`, achievement
    events flags, achievements-store `unlocked`/`markUnlocked`.
  - Three Convex subscriptions (lines 121-143): `listExternalWorkouts`
    (deduped with use-stats), `mealLogs.listDateRange` over a 365-day window
    computed once per mount, `getHealthSummary`.
  - `useStats(ALL_TIME)` (line 105).
  - `facts` memo (lines 145-203) assembling `AchievementFacts` — calls
    `computeWorkoutSignals(logs, ...)`, `computeMealDaySignals(meals, goals)`,
    `countWeightPrs(logs)`, `computeWeeksFullPlanAdherence(activePlan)`
    (a local function at lines 44-69), and reads `stats.totals`/`stats.streaks`.
  - Evaluate effect (**changed by hotfix `4c74c6a` — now ~lines 216-252**):
    `evaluateAchievements(facts, unlockedKeys)`, THEN a baseline-seeding
    gate: when `hasSeededBaseline` is false (fresh install signing in),
    unlocks are persisted via `markUnlocked` but NOT surfaced, and a settle
    timer (`BASELINE_SETTLE_MS = 4000`, re-armed per backfill batch via
    `baselineTimerRef`) calls `markBaselineSeeded()` once the burst goes
    quiet; only after the baseline is seeded do new unlocks flow into the
    session `newlyUnlocked` list (dedup by key). A cleanup effect clears
    the timer on unmount.
  - `groups` memo → `buildAchievementGroups(facts, unlockedMap)`.
  - `stores/achievements-store.ts` (**changed by hotfix `4c74c6a`**): now
    persist version 2 with `hasSeededBaseline: boolean` +
    `markBaselineSeeded()` (idempotent); the v2 migration marks any user
    with existing unlocks as already baselined.
- Hook consumers (all three): `app/achievements/index.tsx:23` (`groups`),
  `components/stats/records-section.tsx:40` (`groups`),
  `components/achievements/unlock-toast.tsx:55` (`newlyUnlocked`).
- `lib/achievements.ts` — pure module with `evaluateAchievements`,
  `buildAchievementGroups`, `computeWorkoutSignals`, `computeMealDaySignals`,
  `countWeightPrs`, `AchievementFacts`, `AchievementDef`. Tested in
  `lib/achievements.test.ts`.
- `stores/achievements-store.ts` — persisted `unlocked` map +
  idempotent `markUnlocked` (safe to call from two places).
- `stores/achievement-events-store.ts` — persisted one-shot flags.
- `hooks/use-stats.ts` — `useStats(filter)`: filters logs, calls
  `computeAllStats`, then overrides `streaks` with `computeStreak` from
  `lib/streaks.ts` using workout/external/rest dates (lines 37-88). After
  plan 043 the legacy streak pass inside `computeAllStats` is gone.
- Convention notes: New Architecture + React Compiler are ON — the fix is
  architectural (fewer subscriptions/mounts), not memoization. Zustand
  stores support plain `useXStore.subscribe(listener)` outside React.
  `ConvexReactClient` supports one-shot `client.query(ref, args)` promises.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `pnpm test` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/achievements.ts` (move fact assembly here as a pure function)
- `lib/achievements.test.ts` (extend)
- `lib/achievement-engine.ts` (create)
- `stores/unlock-toast-store.ts` (create — tiny, NOT persisted)
- `hooks/use-achievements.ts` (slim down)
- `components/achievements/unlock-toast.tsx` (swap data source)
- `providers/convex-sync-provider.tsx` (one init call)

**Out of scope** (do NOT touch, even though they look related):
- `app/achievements/index.tsx`, `components/stats/records-section.tsx` —
  their `useAchievements()` usage stays byte-identical.
- `stores/achievements-store.ts`, `stores/achievement-events-store.ts` —
  consumed as-is.
- `hooks/use-stats.ts`, `lib/stats.ts`, `lib/streaks.ts` — read-only here.
- `convex/` — no server changes; the engine reuses existing queries.

## Git workflow

- Branch: `advisor/038-achievements-engine`
- Commits per step: `refactor(achievements): extract pure fact assembly`,
  `feat(achievements): event-driven unlock engine`,
  `refactor(achievements): toast host reads unlock feed store`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract pure fact assembly into `lib/achievements.ts`

Move `computeWeeksFullPlanAdherence` (hook lines 44-69) into
`lib/achievements.ts` (exported), and add an exported pure function:

```ts
export interface FactSources {
  logs: WorkoutLog[];
  totals: { totalWorkouts: number; totalWeightLifted: number };
  streaks: { currentStreak: number; longestStreak: number };
  weightUnit: 'kg' | 'lbs';
  externalWorkoutCount: number;
  meals: /* the listDateRange payload element type */[] ;
  nutritionGoals: /* store type */;
  activePlan: /* plan-with-days or null */;
  allPlans: /* plan list type */;
  recipesCount: number;
  groceryItemsCount: number;
  events: { chatMessageSent: boolean; chatMealLogged: boolean; aiMacrosGenerated: boolean };
  healthDailyMetrics: /* getHealthSummary dailyMetrics type */[];
}
export function assembleAchievementFacts(src: FactSources): AchievementFacts
```

Its body is the hook's `facts` memo (lines 145-203) verbatim — same
kg-conversion, same zeroed-when-loading semantics (callers pass `[]`/`0` for
missing data). Take the exact types from the hook's current usage — do not
invent shapes; if a type isn't importable, define it structurally in
`lib/achievements.ts`. Then make the hook's memo a thin call to it.

**Verify**: `npx tsc --noEmit` → 0; `pnpm test` → 0 (pure move, no behavior
change); the hook's memo body is ≤ ~25 lines.

### Step 2: Unlock feed store

Create `stores/unlock-toast-store.ts`: a NON-persisted zustand store:

```ts
interface UnlockToastState {
  feed: AchievementDef[];              // session-scoped, append-only
  push: (defs: AchievementDef[]) => void; // dedup by def.key against feed
}
```

Match the store conventions in `stores/achievement-events-store.ts`
(file layout, comment style) minus the `persist` wrapper.

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: The engine

Create `lib/achievement-engine.ts`:

- `initAchievementEngine(client: ConvexReactClient): () => void` (returns a
  disposer). Module holds the client + a `dispose` list.
- Subscribes via plain `.subscribe(...)` to: `useHistoryStore`,
  `usePlanStore`, `useRecipeStore`, `useGroceryStore`,
  `useNutritionGoalsStore`, `useMealLogStore`, `useSettingsStore`,
  `useAchievementEventsStore`. Every notification calls `schedule()`.
- `schedule()`: trailing debounce 2000 ms, plus a floor of ≥10 s between
  evaluation *runs* (a run scheduled during the floor executes when the
  floor expires). One evaluation also runs ~3 s after init (post-rehydrate
  first pass).
- `evaluate()`:
  1. One-shot queries (`await client.query(...)`) for the three server
     facts, with the same args the hook uses today: `api.mealLogs.listDateRange`
     over trailing 365 days (`format(subDays(now,365),'yyyy-MM-dd')` →
     today), `api.healthData.listExternalWorkouts` over the history store's
     `loadedRange` (same start/end+1 conversion as hook lines 121-127),
     `api.healthData.getHealthSummary` `{}`. Wrap in try/catch — on failure
     use `[]`/`undefined` (same zeroed-facts-only-false-negatives contract
     as the hook, comment lines 207-209).
  2. Read store state via `getState()`; compute
     `totals`/`streaks` the way `hooks/use-stats.ts:37-88` does for the
     all-time filter (no date filtering; `computeAllStats` for totals;
     `computeStreak` with workoutDates/externalWorkoutDates/restDates —
     replicate that assembly here, citing use-stats as the source).
  3. `const facts = assembleAchievementFacts({...})`.
  4. `const newly = evaluateAchievements(facts, new Set(Object.keys(useAchievementsStore.getState().unlocked)))`.
  5. If non-empty, apply the **baseline-seeding rule** (moved verbatim from
     the hook, where hotfix `4c74c6a` introduced it): read
     `hasSeededBaseline` from `useAchievementsStore.getState()`. When
     `false`: `markUnlocked(keys)` but do NOT push to the toast feed, and
     (re-)arm a module-level 4000 ms settle timer that calls
     `markBaselineSeeded()` — each backfill batch re-arms it. When `true`:
     `markUnlocked(keys)` AND `useUnlockToastStore.getState().push(newly)`.
     The engine's disposer must clear this timer.
- Guard: concurrent `evaluate()` calls collapse (an `isEvaluating` flag +
  one pending re-run).

In `providers/convex-sync-provider.tsx`, next to `setConvexClient(convex)`
(line 42), call `initAchievementEngine(convex)` inside the same effect and
return its disposer alongside any existing cleanup.

**Verify**: `npx tsc --noEmit` → 0; `pnpm lint` → 0.

### Step 4: Slim the hook and the host

- `hooks/use-achievements.ts`: delete the ENTIRE evaluate block — the
  effect (~lines 216-252 after `4c74c6a`), the `baselineTimerRef` + its
  cleanup effect, the `BASELINE_SETTLE_MS` constant, and the
  `hasSeededBaseline`/`markBaselineSeeded` selectors — plus `newlyUnlocked`
  from the interface/return; all of that now lives in the engine (Step 3).
  The hook returns `{ groups, unlocked }` only. It keeps its subscriptions
  — but they now cost only while a consuming screen is mounted.
- `components/achievements/unlock-toast.tsx`: replace
  `useAchievements().newlyUnlocked` with `useUnlockToastStore((s) => s.feed)`.
  The host's internal enqueue/dedup logic stays.

**Verify**: `grep -n "useAchievements" components/achievements/unlock-toast.tsx`
→ 0 matches; `grep -rn "newlyUnlocked" app components hooks` → only
unlock-toast internals (if it kept the name for the feed) — the hook no
longer exports it. `npx tsc --noEmit` → 0.

### Step 5: Behavior check

If a simulator is available: complete a workout → unlock toast still fires
within ~15 s (debounce+floor); open Stats and Achievements screens → groups
render as before. If not runnable, say so; the static gates stand.

**Verify**: `pnpm test` → 0; `pnpm lint` → 0.

## Test plan

- Extend `lib/achievements.test.ts` with `assembleAchievementFacts` cases:
  (a) zeroed sources → zeroed facts (loading contract), (b) a populated
  fixture → spot-check `totalPrCount`, `mealsLoggedCount`, `plansCompleted`,
  kg/lbs conversion of `totalVolumeKg`, (c) `computeWeeksFullPlanAdherence`
  moved cases if the hook had none (adherent run, broken run, all-rest week).
- The engine's debounce/queries are intentionally untested (side-effectful;
  would need fake timers + client stub — deferred, note it in the PR).
- Verification: `pnpm test` → all pass including new cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "useQuery" hooks/use-achievements.ts` unchanged or lower, and `grep -c "useAchievements" components/achievements/unlock-toast.tsx` → 0
- [ ] `lib/achievement-engine.ts` exists; `grep -n "initAchievementEngine" providers/convex-sync-provider.tsx` → 1 match
- [ ] `grep -n "evaluateAchievements" hooks/use-achievements.ts` → 0 (detection no longer in the hook)
- [ ] `npx tsc --noEmit`, `pnpm lint`, `pnpm test` all exit 0; new fact-assembly tests present
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `ConvexReactClient.query` one-shot form isn't available on the installed
  convex version (check `node_modules/convex` types) — report; do not
  substitute `watchQuery` subscriptions.
- The hook's `facts` memo has drifted from the excerpt line ranges.
- Moving fact assembly forces importing React or a hook into
  `lib/achievements.ts` — the extraction is wrong; re-read Step 1.
- Store `.subscribe` fires so often in dev that the 10 s floor still yields
  visible jank — report measurements instead of tuning blindly.

## Maintenance notes

- New achievements that need a NEW data source must add it to `FactSources`,
  the engine's evaluate, AND the hook — the compiler enforces the first;
  reviewer should check the other two.
- The engine's trigger set is the eight stores listed in Step 3. A future
  feature whose achievement facts change *without* touching any of those
  stores (e.g. a pure server-side signal) needs an explicit `schedule()`
  call or it will only be noticed on the next unrelated trigger.
- Reviewer scrutiny: the one-shot query failure path (must degrade to
  zeroed facts, never throw out of `evaluate`), and that
  `initAchievementEngine` is idempotent or effect-cleanup-safe under React
  StrictMode-style double-invocation.
- Deferred: measuring the actual ms saved (docs/perf/baseline.md has the
  cold-start marker if the operator wants before/after numbers); engine unit
  tests with fake timers.

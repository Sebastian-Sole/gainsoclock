# Plan 036: One tested queue-aware hydration merge, four store policies — and stop resurrecting in-flight deletes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- stores/history-store.ts stores/meal-log-store.ts stores/plan-store.ts stores/template-store.ts lib/convex-sync.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (offline-correctness core — mitigated by tests-first ordering)
- **Depends on**: plans/035-sync-queue-tests-and-inflight-pending.md
- **Category**: tech-debt + tests + bug
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

Four stores hand-roll the same queue-aware hydration-merge skeleton: build a
local-by-id map, snapshot `getPendingClientIds()`/`isQueueLoaded()`, walk
server items with a "keep local while pending or queue-unknown" gate, walk
local-only items with a keep-unsynced-or-drop rule, then sort and `set`. The
only *intentional* differences are the per-store conflict rule and the
drop-scope. Everything else is copy-drift waiting to silently lose or
resurrect a user's write, and none of it is tested.

There is also a **live bug shared by all four copies**: the pending-ID gate
only protects items that still exist locally. A queued *delete* removes the
item from the local array first, so when a hydrate runs before the queue
flushes, the first loop finds no local copy, ignores `pending`, and re-adds
the server copy — the deleted item resurrects until the flush lands (and
Convex serves cached query data offline, so this happens offline too). This
plan extracts one pure, tested merge and fixes the delete rule in one place.

## Current state

All four merge implementations (open each before editing):

- `stores/history-store.ts:198-284` — `hydrateFromServer(serverLogs)`.
  Policy: **server-wins**, with one guard — a metadata-only payload (no
  `exercises`) must not replace a full local copy (lines 252-258). Local-only
  drop-scope: dropped only when
  `l.completedAt >= fetchedRangeFrom && l.completedAt <= loadedRange.to`
  (lines 271-273); logs outside the fetched range are kept. Sorts by
  `startedAt` desc before `set({ logs: merged })`.
- `stores/meal-log-store.ts:102-147` — `hydrateFromServer(meals, date)`.
  Policy: server-wins. Local-only scope: only same-`date` pending meals are
  kept; everything else local-only is dropped (lines 138-143). Calls
  `recomputeProteinNudgeFromStore()` after `set`.
- `stores/plan-store.ts:76-120` — `hydrateFromServer(serverPlans)`.
  Policy: server-wins (store has no local edit actions). Local-only:
  keep pending, drop the rest (unscoped query ⇒ absence is deletion).
- `stores/template-store.ts:144-200` — `hydrateFromServer(serverTemplates)`.
  Policy: **last-write-wins** — `local.updatedAt > st.updatedAt` keeps local,
  tie goes to server (line 183). Local-only: keep pending, drop the rest.

The shared skeleton in every copy (excerpt from `stores/plan-store.ts:89-117`):

```ts
for (const sp of serverPlans) {
  seenIds.add(sp.clientId);
  const local = localById.get(sp.clientId);
  if (local && (pending.has(local.id) || !queueKnown)) {
    merged.push(local);
  } else {
    merged.push({ /* toLocal mapping */ });
  }
}
for (const p of localPlans) {
  if (seenIds.has(p.id)) continue;
  if (pending.has(p.id) || !queueKnown) merged.push(p);
}
```

**The delete-resurrection bug**: in the first loop, when `local` is
`undefined` (locally deleted, delete queued — e.g.
`stores/meal-log-store.ts:95-99` removes from state then
`syncToConvex(api.mealLogs.deleteMealLog, { clientId: id })`), the branch
falls through to "take server copy" even though `pending.has(sp.clientId)`
is true. Correct behavior: a server item whose clientId is pending but has
no local copy is an **in-flight delete → skip it**.

- `lib/convex-sync.ts:189-202` — `getPendingClientIds()` / `isQueueLoaded()`
  (after plan 035, pending includes in-flight flush items).
- Conventions: pure logic lives in `lib/<topic>.ts`, one topic per file;
  tests are `lib/*.test.ts`, explicit Vitest imports, node env
  (see `vitest.config.ts`, exemplar `lib/streaks.test.ts`). Stores are
  Zustand, one per domain, no cross-store imports.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0 |
| Single file | `pnpm test -- lib/hydration-merge.test.ts` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/hydration-merge.ts` (create)
- `lib/hydration-merge.test.ts` (create)
- `stores/history-store.ts`, `stores/meal-log-store.ts`,
  `stores/plan-store.ts`, `stores/template-store.ts` — ONLY their
  `hydrateFromServer` bodies.

**Out of scope** (do NOT touch, even though they look related):
- `lib/convex-sync.ts` — consumed, not modified (plan 035 owns it).
- `stores/settings-store.ts`, `stores/recipe-store.ts`,
  `stores/subscription-store.ts`, nutrition-goals — their hydrates are
  simple replaces, not queue-aware merges; leave them.
- `providers/convex-sync-provider.tsx` — call sites stay identical.
- Store persist configs, versions, and every other store action.

## Git workflow

- Branch: `advisor/036-hydration-merge-consolidation`
- Commits: `feat(sync): pure queue-aware hydration merge + tests`, then one
  `refactor(<store>): adopt shared hydration merge` per store, finally
  `fix(sync): skip server copies of in-flight deletes` if you follow the
  recommended red/green ordering in Step 2.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the pure merge

Create `lib/hydration-merge.ts` exporting:

```ts
export interface MergeInput<L, S> {
  local: L[];
  server: S[];
  /** clientId of a local / server item (local id === server clientId). */
  localId: (l: L) => string;
  serverId: (s: S) => string;
  /** Map a server payload to the local shape. */
  toLocal: (s: S) => L;
  /** Clientids with queued/in-flight writes + whether the queue is known. */
  pending: Set<string>;
  queueKnown: boolean;
  /** Conflict rule when both sides exist and local has no pending write.
   *  Return the item to keep. Default: server-wins (return toLocal(s)). */
  resolveConflict?: (local: L, server: S) => L;
  /** For a local-only, non-pending item: true = server absence means
   *  deletion here, drop it. */
  dropLocalOnly: (l: L) => boolean;
}
export function mergeQueueAware<L, S>(input: MergeInput<L, S>): L[]
```

Semantics (must match the four stores exactly, plus the delete fix):

1. Server loop, in server order: for each `s`,
   - `local` exists and (`pending.has(id)` or `!queueKnown`) → keep local;
   - **local missing and `pending.has(serverId(s))` and `queueKnown` →
     skip the item entirely (in-flight delete — the fix)**;
   - `local` exists otherwise → `resolveConflict(local, s)` (default
     `toLocal(s)`);
   - no local, not pending → `toLocal(s)`.
2. Local-only loop, in local order: keep when `pending.has(id)` or
   `!queueKnown`; otherwise keep unless `dropLocalOnly(l)`.
3. No sorting inside — callers sort after (history does; others don't).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the pure merge (red on the delete bug first)

Create `lib/hydration-merge.test.ts` (model after `lib/streaks.test.ts`).
Use a toy shape `{ id, v }` / server `{ clientId, v }`. Cases:

1. server-only item → mapped in.
2. both, no pending → server wins (default) / `resolveConflict` invoked when provided.
3. both, pending id → local kept even when server differs.
4. both, `queueKnown=false` → local kept.
5. local-only, pending → kept.
6. local-only, not pending, `dropLocalOnly=true` → dropped.
7. local-only, not pending, `dropLocalOnly=false` → kept (history's
   out-of-range case).
8. **in-flight delete**: server has `{clientId:"x"}`, local list has no `"x"`,
   `pending={"x"}` → result contains no `"x"`.
9. LWW policy expressed via `resolveConflict` comparing `updatedAt`
   (tie → server) — mirrors template-store line 183.
10. metadata-guard policy via `resolveConflict` (server copy without content
    must not replace full local) — mirrors history-store lines 252-258.

**Verify**: `pnpm test -- lib/hydration-merge.test.ts` → all pass.

### Step 3: Adopt in each store, one commit each, in this order

Order: `plan-store` (simplest) → `template-store` → `meal-log-store` →
`history-store` (most policy). For each: replace the two loops with a
`mergeQueueAware` call passing the store's existing `toLocal`,
`resolveConflict`, and `dropLocalOnly`; keep everything around it identical
(the `pending`/`queueKnown` snapshot from `@/lib/convex-sync`, the sort in
history, `recomputeProteinNudgeFromStore()` and the `mealsDate` set in
meal-log, `set({...})` shapes). Meal-log note *(corrected 2026-07-02 during
execution review — the original instruction here was wrong)*: the same-date
guard must run as a PRE-FILTER on `local` before the merge, with
`dropLocalOnly: () => true` — NOT inside `dropLocalOnly`. The original code
dropped other-date meals *before* the pending check (even pending ones),
which `dropLocalOnly` cannot express because the merge's pending rule wins
first. Pre-filtering is safe on the server loop because meal dates are
immutable (no updateMeal action), so a local id can only match a same-date
server item. The executor caught this and implemented the pre-filter.

**Verify after EACH store**: `npx tsc --noEmit` → 0; `pnpm test` → 0;
`pnpm lint` → 0.

### Step 4: Confirm the behavior delta is exactly the delete fix

The ONLY intended behavior change vs. `08f585b` is: server copies of
pending-delete clientIds no longer resurrect. Re-read each store's new
`hydrateFromServer` against the old excerpts above and confirm every other
branch maps 1:1.

**Verify**: `git diff 08f585b -- stores/ | grep "^-" | wc -l` — the removed
lines are the four skeletons; no other store method appears in the diff.

## Test plan

Step 2's ten cases are the deliverable; they double as the missing TEST-02
coverage (the per-store policies are pinned via cases 8-10 plus the policy
callbacks each store passes). Expect ≥10 new tests in
`lib/hydration-merge.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `lib/hydration-merge.ts` + `lib/hydration-merge.test.ts` exist; `pnpm test` exits 0 with ≥10 new tests
- [ ] All four stores import `mergeQueueAware` (`grep -l "mergeQueueAware" stores/ | wc -l` → 4)
- [ ] The old skeleton is gone: `grep -c "seenIds" stores/*.ts` → 0
- [ ] `npx tsc --noEmit` exits 0; `pnpm lint` exits 0
- [ ] `git status` shows only the six in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 035 has not landed (check `grep inFlightClientIds lib/convex-sync.ts`)
  — the merge's correctness story depends on it; report and wait.
- Any store's merge contains logic not described in "Current state" (drift
  — e.g. a fifth policy appeared).
- Preserving a store's behavior 1:1 requires widening the `MergeInput`
  interface beyond one more optional callback — the abstraction is failing;
  report rather than force it.
- Any existing test breaks in a way that isn't explained by the in-flight
  delete fix.

## Maintenance notes

- Plan 037 routes plan-screen writes through the queue; its offline-delete
  correctness depends on this plan's skip-pending-delete rule. Land 036 first.
- Reviewer: the dangerous review surface is `dropLocalOnly` — history's
  range-scoped drop and meal-log's date guard are behavior-preserving only if
  the predicate direction is right (drop=true). Check cases 6/7 against the
  store wiring, not just the pure tests.
- Future stores adding hydration merges should use `mergeQueueAware` — if a
  policy doesn't fit, extend the callbacks, don't fork the skeleton.

# Plan 037: Route plan writes through the persisted offline queue

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- "app/plan/[id].tsx" components/chat/plan-day-detail.tsx components/plan/missed-day-banner.tsx stores/plan-store.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/036-hydration-merge-consolidation.md (delete-skip rule); 035 transitively
- **Category**: bug
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

The repo's offline-first contract (CLAUDE.md: "client writes go through
Zustand + convex-sync queue; assume network may be absent") is broken on the
plan surface. Eight plan mutations are called through bare `useMutation`,
which means Convex buffers them in WebSocket memory only — kill the app
while offline and the write is gone. Worst case is delete: the screen
optimistically removes the plan from the local store, the queued-nowhere
delete dies with the process, and the next hydration (server-wins) brings
the plan back from the dead. Status toggles and week edits offline appear to
do nothing. Routing these writes through `syncToConvex` makes them durable
and — combined with plan 036's in-flight-delete rule — makes offline deletes
stick.

## Current state

- The queue API: `syncToConvex(mutationRef, args)` from `@/lib/convex-sync`
  — fire-and-forget (returns `void`), queues to AsyncStorage when offline,
  fences behind queued items when online (see `lib/convex-sync.ts:215-271`).
  **The in-repo exemplar for this exact domain** is
  `app/workout/active.tsx:292`:

  ```ts
  syncToConvex(api.plans.updatePlanDayStatus, {
    planClientId: ...,
  ```

- Bypassing call sites (all direct `useMutation`):
  - `app/plan/[id].tsx:24-29`:

    ```ts
    const deletePlan = useMutation(api.plans.deletePlan);
    const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
    const updatePlanName = useMutation(api.plans.updatePlanName);
    const swapPlanDaysMut = useMutation(api.plans.swapPlanDays);
    const addPlanWeek = useMutation(api.plans.addPlanWeek);
    const removePlanWeek = useMutation(api.plans.removePlanWeek);
    ```

    Usage sites in the same file: `doDelete` (≈line 152) does
    `removePlanLocal(id); await deletePlan({ clientId: id }); ... router.back();`
    inside an `Alert.alert` flow; `handleToggleStatus` (≈line 199) calls
    `updatePlanStatus({ clientId: id, status: newStatus })`;
    `handleAddWeek` (≈line 204) calls `addPlanWeek({ clientId: id })`; there
    are similar handlers for rename, swap-days, remove-week below.
  - `components/chat/plan-day-detail.tsx:57`:
    `const updatePlanDay = useMutation(api.plans.updatePlanDay);`
  - `components/plan/missed-day-banner.tsx:41`:
    `const updatePlanDayStatus = useMutation(api.plans.updatePlanDayStatus);`
- All these mutations are already clientId-keyed (verified in
  `convex/plans.ts` — e.g. `updatePlanStatus` args
  `{ clientId: v.string(), status: planStatusValidator }` at line 219,
  `deletePlan` args `{ clientId: v.string() }` at line 517, both resolving
  the row via the `by_user_clientId` index). So the args already carry the
  clientId that `getPendingClientIds()` extracts — no server changes needed.
- `stores/plan-store.ts` — has `removePlan(id)` (lines 68-74, used by the
  delete flow) but NO local edit actions for status/name (the hydrate
  comment at lines 86-88 says so). The screen reads `planData` from
  `useQuery(api.plans.getPlanWithDays, ...)` (`app/plan/[id].tsx:23`), so
  online UI updates come from the subscription round-trip.
- Reading the plan LIST is `usePlanStore().plans` (hydrated server-wins);
  after 036, a pending `deletePlan` clientId suppresses resurrection.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `app/plan/[id].tsx`
- `components/chat/plan-day-detail.tsx`
- `components/plan/missed-day-banner.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `convex/plans.ts` — the server contract is already clientId-shaped;
  any change there is a different plan. If a mutation turns out NOT to be
  callable via the queue, STOP.
- `stores/plan-store.ts` — adding optimistic local edit actions
  (status/name mirrors) is deliberately deferred; see Maintenance notes.
- `lib/convex-sync.ts`, the hydration merges, `app/workout/active.tsx`.

## Git workflow

- Branch: `advisor/037-plan-writes-offline-queue`
- Commit style: `fix(plans): route plan writes through the offline sync queue`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Convert `app/plan/[id].tsx`

Remove the six `useMutation` hooks (lines 24-29) and the now-unused
`useMutation` import if nothing else in the file uses it. At each call site,
replace the direct call with `syncToConvex(api.plans.<fn>, args)` — import
`syncToConvex` from `@/lib/convex-sync` (match the import shape used in
`app/workout/active.tsx`). Specifics:

- `doDelete`: becomes synchronous —
  `removePlanLocal(id); syncToConvex(api.plans.deletePlan, { clientId: id }); ... router.back();`
  Drop the `await` and any `async` no longer needed. Keep the
  template-deletion branch (`deleteTemplateLocal`) exactly as-is.
- `handleToggleStatus`, `handleAddWeek`, rename, swap-days, remove-week:
  mechanical swap to `syncToConvex(api.plans.<fn>, { ...sameArgs })`. Drop
  stray `await`s; if a handler had `.catch`/try-catch around the mutation
  only, remove it (`syncToConvex` handles retry internally).

**Verify**: `npx tsc --noEmit` → 0; `grep -c "useMutation(api.plans" "app/plan/[id].tsx"` → 0.

### Step 2: Convert the two components

Same mechanical swap in `components/chat/plan-day-detail.tsx` (the
`updatePlanDay` call) and `components/plan/missed-day-banner.tsx`
(`updatePlanDayStatus` — make it byte-identical in shape to the exemplar at
`app/workout/active.tsx:292`). If either component `await`s the mutation to
sequence UI (e.g. closing a sheet after save), keep the UI action and run it
immediately after the `syncToConvex` call.

**Verify**: `grep -rn "useMutation(api.plans" app components` → no matches
(the only remaining `api.plans` writes go through `syncToConvex`).

### Step 3: Behavior check (manual, simulator if available)

If you can run the app (`pnpm ios`, requires a built dev client): create a
plan, toggle status → server round-trip still updates the UI; delete a plan
→ it disappears and stays gone after pull-refresh. If you cannot run the
app, state that in your report — the static checks above are the gate.

**Verify**: `pnpm lint` → 0; `pnpm test` → 0.

## Test plan

No new unit tests here — the queue semantics are pinned by plan 035's suite
and the merge behavior by plan 036's. The change is call-site routing.
(A Maestro flow for offline plan-delete is listed as deferred in
Maintenance notes.)

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "useMutation(api.plans" app components` → 0 matches
- [ ] `grep -c "syncToConvex(api.plans" "app/plan/[id].tsx"` → 6
- [ ] `npx tsc --noEmit` exits 0; `pnpm lint` exits 0; `pnpm test` exits 0
- [ ] `git status` shows only the three in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 036 has not landed (`grep -l mergeQueueAware stores/plan-store.ts` is
  empty) — without the delete-skip rule, queued offline deletes still
  resurrect; report and wait.
- Any of the eight call sites needs the mutation's *return value* (a
  `syncToConvex` call can't provide one) — report which, with the line.
- A handler's UX depends on awaiting server completion in a way that a
  fire-and-forget visibly breaks (e.g. navigation to a screen that
  immediately queries the not-yet-written state).

## Maintenance notes

- **Deferred**: optimistic local mirrors for status/name in
  `stores/plan-store.ts`. Offline, the plan screen still shows stale
  status/name until the queue flushes and the subscription refreshes —
  pre-existing UX, now at least durable. If the operator wants live offline
  UI here, that's a small follow-up plan (add `setPlanStatus`/`setPlanName`
  local actions + call them next to the `syncToConvex`).
- Reviewer: check no handler kept an `await` on a `void` return (tsc catches
  most, but a stray `async` handler that no longer awaits anything is smell).
- If a future plan adds new `api.plans` mutations, they must ship via
  `syncToConvex` — the Done-criteria grep is the cheap audit.

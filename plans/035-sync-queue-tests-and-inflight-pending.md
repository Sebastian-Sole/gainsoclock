# Plan 035: Characterize the offline sync queue and make in-flight writes visible to hydration merges

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- lib/convex-sync.ts providers/network-provider.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/034-ci-test-gate.md (soft — CI then runs the new tests)
- **Category**: bug + tests
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

`lib/convex-sync.ts` is the offline-first backbone: every store write goes
through its persisted queue, and the four store hydration merges decide
"keep local vs take server" by asking it which clientIds still have writes
in flight. It has **zero tests** — `docs/decisions/test-runner.md` explicitly
deferred `lib/convex-sync.test.ts` as a follow-up that never landed. And it
has a real race: during `flushSyncQueue`, the queue is emptied *before* the
mutations are awaited, so `getPendingClientIds()` returns an empty set for
items that are mid-replay. A hydration merge running concurrently (which is
exactly when merges run — Convex re-delivers subscription data on the same
reconnect that triggers the flush) can then treat an offline-created workout
or meal as "server deleted it" and drop it locally. The item reappears once
the create commits (visible flicker) or diverges permanently if that item is
later dead-lettered. This plan pins the current queue semantics with
characterization tests, then fixes the blind window.

## Current state

- `lib/convex-sync.ts` — the whole module (357 lines). Key facts:
  - Module-level state: `memoryQueue: QueuedMutation[]` (line 20),
    `memoryQueueLoaded` (line 21), a promise-chain mutex `withLock` (lines
    28-42), `convexClient` set via `setConvexClient(client)` (line 44),
    `MAX_RETRIES = 5` (line 48).
  - `QueuedMutation` = `{ path, args, queuedAt, retryCount }` (lines 50-57).
    Persisted to AsyncStorage under key `"convex-sync-queue"` (write-behind,
    `persistQueue` lines 98-108). Dead letters go to key
    `"convex-sync-dead-letter"` (`deadLetter`, lines 149-166).
  - The accessor the merges use (lines 189-196):

    ```ts
    export function getPendingClientIds(): Set<string> {
      const ids = new Set<string>();
      for (const item of memoryQueue) {
        const cid = (item.args as { clientId?: unknown })?.clientId;
        if (typeof cid === "string") ids.add(cid);
      }
      return ids;
    }
    ```

  - `isQueueLoaded()` (lines 200-202) returns `memoryQueueLoaded` — it stays
    `true` during a flush, so merges get no protection from it.
  - `syncToConvex(mutation, args)` (lines 215-271): offline → `enqueue`;
    online with a non-empty queue → append + flush (causal-order fence);
    online with empty queue → live send, `.catch` → enqueue for retry.
  - `flushSyncQueue()` (lines 290-356) — **the race**:

    ```ts
    // lib/convex-sync.ts:298-304 — snapshot then CLEAR, before any send
    const snapshot = await withLock(async () => {
      await ensureLoaded();
      const items = [...memoryQueue];
      memoryQueue = [];
      await persistQueue();
      return items;
    });
    ...
    // :311-320 — awaited sends; getPendingClientIds() sees ∅ throughout
    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i];
      const mutationRef = resolveMutation(item.path);
      if (!mutationRef) { await deadLetter(item, "unknown-path"); continue; }
      try {
        await convexClient.mutation(mutationRef, item.args);
      } catch (err) { ... }
    ```

    Failure handling in the catch (lines 322-349): permanent failure
    (`ArgumentValidationError`) → dead-letter + continue; retryable →
    `retryCount+1`; at `MAX_RETRIES` → dead-letter + continue; otherwise stop
    the loop and re-prepend `[bumpedHead, ...remainingSnapshot, ...memoryQueue]`
    under the lock (line 345).
  - `providers/network-provider.tsx` calls `flushSyncQueue()` on offline→online
    transition and on mount — the same moments Convex re-delivers subscription
    data into the hydration `useEffect`s of `providers/convex-sync-provider.tsx`
    (lines 159-208), which call the stores' `hydrateFromServer`.
  - Consumer example — `stores/history-store.ts:269-273`: a local-only log
    whose id is not in `getPendingClientIds()` and whose `completedAt` falls
    in the fetched range is treated as server-deleted and dropped.

- Conventions: tests use explicit Vitest imports (no globals), live in
  `lib/*.test.ts`, run under the node environment with the `@` alias
  (see `vitest.config.ts`). Model the file layout after `lib/streaks.test.ts`
  (characterization comments up top, small helper builders).
- `docs/decisions/test-runner.md` (the ADR this plan completes) names the
  mock surface: AsyncStorage needs a mock; `@/stores/network-store` is a
  plain zustand store usable as-is.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0, all files pass |
| Single file | `pnpm test -- lib/convex-sync.test.ts` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/convex-sync.test.ts` (create)
- `lib/convex-sync.ts` (the fix in Step 3 only — no refactors)

**Out of scope** (do NOT touch, even though they look related):
- The four store `hydrateFromServer` implementations — plan 036 consolidates
  them; here they stay as-is.
- `providers/network-provider.tsx`, `providers/convex-sync-provider.tsx` —
  read them for context, change nothing.
- The queue's ordering/retry/dead-letter behavior — this plan *pins* it,
  it does not redesign it.

## Git workflow

- Branch: `advisor/035-sync-queue-tests`
- Two commits: `test(sync): characterize offline queue semantics` then
  `fix(sync): keep in-flight clientIds visible to getPendingClientIds during flush`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the test harness

Create `lib/convex-sync.test.ts`. Harness requirements (all inside the test
file, no config changes):

- Mock AsyncStorage before importing the module under test:

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  const storage = new Map<string, string>();
  vi.mock("@react-native-async-storage/async-storage", () => ({
    default: {
      getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => void storage.set(k, v)),
      removeItem: vi.fn(async (k: string) => void storage.delete(k)),
    },
  }));
  ```

- `lib/convex-sync.ts` keeps module-level state (`memoryQueue`,
  `memoryQueueLoaded`, `isFlushing`), so each test must get a fresh module:
  use `vi.resetModules()` in `beforeEach`, clear `storage`, and load via
  `const sync = await import("@/lib/convex-sync")` inside each test (or a
  helper). Do NOT import it statically at the top.
- The generated `api` object (`@/convex/_generated/api`) is a plain proxy
  with no React Native dependency — import it for real and use real
  references like `api.mealLogs.deleteMealLog` so `getFunctionName`/
  `resolveMutation` exercise the production path.
- Network state: import `useNetworkStore` from `@/stores/network-store` and
  set state directly (`useNetworkStore.setState({ isConnected: false, ... })`)
  to simulate offline/online. Check the store's actual field names before
  writing (open `stores/network-store.ts`).
- Fake Convex client: an object with a `mutation` mock. `setConvexClient`
  types its parameter as `ConvexReactClient`; in the test, build
  `{ mutation: vi.fn() }` and pass it with a single documented
  `as unknown as ConvexReactClient` cast, commented as test-only stub
  (the repo's no-`as` rule targets production narrowing; note it in the PR).

**Verify**: `pnpm test -- lib/convex-sync.test.ts` runs (even with 1 trivial
test) → exit 0.

### Step 2: Characterization tests — pin CURRENT behavior

Write these cases (names indicative; keep one behavior per test):

1. **offline enqueue persists**: offline → `syncToConvex(api.X, {clientId:"a"})`
   → AsyncStorage `convex-sync-queue` contains one item with the right path;
   `getPendingClientIds()` contains `"a"`.
2. **flush replays in order**: queue 3 items offline, go online, await
   `flushSyncQueue()` → client mutation mock called 3 times in enqueue order;
   queue storage removed.
3. **transient failure halts and re-prepends**: mock the 2nd mutation to
   reject with a generic error → flush stops; mock called twice;
   `getPendingClientIds()` afterwards contains ids of items 2 and 3;
   item 2's `retryCount` is 1 in storage.
4. **permanent failure dead-letters and continues**: 2nd mutation rejects
   with an error whose string contains `ArgumentValidationError` → mock
   called 3 times; dead-letter storage has 1 entry with that item's path;
   queue empty after.
5. **max-retries dead-letters**: an item with `retryCount` pre-seeded at 4
   (write the storage JSON directly) whose send rejects transiently →
   dead-lettered with reason `"max-retries"`, flush continues.
6. **unknown path dead-letters**: seed storage with an item whose path is
   `"nonexistent:fn"` → dead-lettered with reason `"unknown-path"`.
7. **THE RACE (this will FAIL before Step 3 — write it, observe the failure,
   then fix)**: queue one item with `clientId:"a"`; make the client's
   `mutation` return a promise you resolve manually; start
   `flushSyncQueue()` without awaiting; while the mutation is pending, assert
   `getPendingClientIds()` **contains `"a"`**; then resolve and await the
   flush; assert it no longer contains `"a"`.

**Verify**: `pnpm test -- lib/convex-sync.test.ts` → tests 1-6 pass, test 7
fails on the mid-flight assertion (empty set). That failure is the bug.

### Step 3: Fix — track in-flight clientIds

In `lib/convex-sync.ts`, add module state near `memoryQueue`:

```ts
let inFlightClientIds = new Set<string>();
```

In `flushSyncQueue`, immediately after the snapshot is taken (after line
304), populate it from the snapshot's args (same clientId extraction as
`getPendingClientIds`); in the `finally` (line 353-355, next to
`isFlushing = false`), reset it to a new empty Set. Then make
`getPendingClientIds()` return the union of queue-derived ids and
`inFlightClientIds`.

This is deliberately coarse: for the duration of a flush, everything in the
snapshot counts as pending even after its own mutation committed. Over-keeping
a local copy is always safe (the next hydrate settles it); under-keeping is
the data loss this plan fixes. Do not attempt per-item removal.

**Verify**: `pnpm test -- lib/convex-sync.test.ts` → all 7+ pass, including
test 7. `npx tsc --noEmit` → exit 0. `pnpm lint` → exit 0.

## Test plan

Covered by Steps 1-2 (the test file IS the deliverable), plus the
regression test (case 7) that pins the fix. Model file structure after
`lib/streaks.test.ts`. Expect ≥7 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `lib/convex-sync.test.ts` exists with ≥7 tests; `pnpm test` exits 0
- [ ] `grep -n "inFlightClientIds" lib/convex-sync.ts` → ≥3 matches (declare, populate, union)
- [ ] `npx tsc --noEmit` exits 0; `pnpm lint` exits 0
- [ ] `git status` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `lib/convex-sync.ts` no longer matches the excerpts (drift).
- The AsyncStorage mock approach fails because the module resolves the
  dependency differently than `vi.mock` can intercept — report the exact
  error; do not switch test runners or add config.
- Test 7 *passes before* the fix — that means the race doesn't reproduce as
  described; report instead of "fixing" something else.
- The fix appears to require changing any store or provider file.

## Maintenance notes

- Plan 036 consolidates the four store merges on top of this accessor —
  its correctness argument assumes `getPendingClientIds()` covers in-flight
  items. Land this first.
- Reviewer: scrutinize the `finally` reset — if an exception path skips it,
  ids leak and merges over-keep forever (stale local copies never yield to
  server). The union in `getPendingClientIds` must not mutate either set.
- Deferred deliberately: per-item in-flight removal (finer-grained, riskier);
  surfacing dead-letter UI (`getDeadLetters` exists, unused by any screen).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api";

// Characterization tests for the offline sync queue (lib/convex-sync.ts).
// This module has module-level mutable state (memoryQueue, memoryQueueLoaded,
// isFlushing, inFlightClientIds) and a real AsyncStorage dependency, so each
// test gets a fully fresh module graph via vi.resetModules() + dynamic
// import — see beforeEach below. Test 7 pins the in-flight race documented
// in plans/035-sync-queue-tests-and-inflight-pending.md: it fails before the
// Step 3 fix (getPendingClientIds returns an empty set mid-flush) and
// passes after (inFlightClientIds keeps the id visible during replay).

// AsyncStorage mock — registered before the module under test is ever
// imported. `storage` is captured by closure; vi.mock hoists the *call*
// above the imports, but the factory itself isn't invoked until something
// actually imports the module, which only happens inside test bodies (after
// `storage` has been initialized), so referencing it here is safe.
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void storage.delete(k)),
  },
}));

// lib/convex-sync.ts reads the React Native/Expo `__DEV__` global (guards
// around its dev-only console.log calls). That global doesn't exist under
// Vitest's node environment, so without this the module throws a
// ReferenceError the first time any of those branches run.
vi.stubGlobal("__DEV__", false);

// `useNetworkStore` is imported *inside* lib/convex-sync.ts too. After
// vi.resetModules() a dynamic re-import of convex-sync would pick up a
// brand-new store instance — if this test file kept a stale, statically
// imported reference, setting state on it would be invisible to
// convex-sync's internal copy. So we re-import both modules fresh, in the
// same registry "epoch", every test.
let sync: typeof import("@/lib/convex-sync");
let useNetworkStore: typeof import("@/stores/network-store")["useNetworkStore"];

beforeEach(async () => {
  vi.resetModules();
  storage.clear();
  ({ useNetworkStore } = await import("@/stores/network-store"));
  sync = await import("@/lib/convex-sync");
});

// Only the "unknown path" test (below) registers a scoped api mock via
// vi.doMock; undo it unconditionally after every test so it can never leak
// into a later test's (real-api) module graph.
afterEach(() => {
  vi.doUnmock("@/convex/_generated/api");
});

/** Drain pending microtask chains (queue/lock/AsyncStorage promise hops). */
async function tick(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function goOffline(): void {
  useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
}

function goOnline(): void {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
}

/**
 * Test-only stub for ConvexReactClient. lib/convex-sync.ts only ever calls
 * `.mutation`, so the rest of the interface is deliberately absent; the
 * single `as unknown as` cast below is a test fixture, not production
 * narrowing (coding-conventions.md's no-`as` rule targets the latter). The
 * raw `mutation` mock is returned separately so assertions stay typed as a
 * vitest Mock instead of the cast client's method signature.
 */
function makeFakeClient(
  mutationImpl: (ref: unknown, args: unknown) => Promise<unknown>,
) {
  const mutation = vi.fn(mutationImpl);
  const client = { mutation } as unknown as ConvexReactClient;
  return { client, mutation };
}

describe("convex-sync queue", () => {
  it("offline enqueue persists to AsyncStorage and getPendingClientIds", async () => {
    goOffline();
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "a" });
    await tick();

    expect(sync.getPendingClientIds().has("a")).toBe(true);

    const raw = storage.get("convex-sync-queue");
    expect(raw).toBeDefined();
    const queue = JSON.parse(raw as string) as Array<{
      path: string;
      args: { clientId: string };
    }>;
    expect(queue).toHaveLength(1);
    expect(queue[0].path).toBe("mealLogs:deleteMealLog");
    expect(queue[0].args.clientId).toBe("a");
  });

  it("flush replays queued mutations in enqueue order, then clears storage", async () => {
    goOffline();
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "a" });
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "b" });
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "c" });
    await tick();

    const order: unknown[] = [];
    const { client, mutation } = makeFakeClient(async (_ref, args) => {
      order.push((args as { clientId?: unknown })?.clientId);
    });
    sync.setConvexClient(client);
    goOnline();

    await sync.flushSyncQueue();

    expect(order).toEqual(["a", "b", "c"]);
    expect(mutation).toHaveBeenCalledTimes(3);
    expect(storage.has("convex-sync-queue")).toBe(false);
  });

  it("a transient failure halts the flush and re-prepends the unprocessed tail", async () => {
    goOffline();
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "a" });
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "b" });
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "c" });
    await tick();

    let callCount = 0;
    const { client, mutation } = makeFakeClient(async () => {
      callCount += 1;
      if (callCount === 2) throw new Error("network blip");
    });
    sync.setConvexClient(client);
    goOnline();

    await sync.flushSyncQueue();

    expect(mutation).toHaveBeenCalledTimes(2);

    const pending = sync.getPendingClientIds();
    expect(pending.has("a")).toBe(false);
    expect(pending.has("b")).toBe(true);
    expect(pending.has("c")).toBe(true);

    const queue = JSON.parse(storage.get("convex-sync-queue") as string) as Array<{
      args: { clientId: string };
      retryCount: number;
    }>;
    expect(queue[0].args.clientId).toBe("b");
    expect(queue[0].retryCount).toBe(1);
    expect(queue[1].args.clientId).toBe("c");
  });

  it("a permanent (ArgumentValidationError) failure dead-letters and continues", async () => {
    goOffline();
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "a" });
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "b" });
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "c" });
    await tick();

    let callCount = 0;
    const { client, mutation } = makeFakeClient(async () => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error("Server Error: ArgumentValidationError: clientId required");
      }
    });
    sync.setConvexClient(client);
    goOnline();

    await sync.flushSyncQueue();

    expect(mutation).toHaveBeenCalledTimes(3);

    const deadLetters = await sync.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].path).toBe("mealLogs:deleteMealLog");
    expect((deadLetters[0].args as { clientId: string }).clientId).toBe("b");
    expect(storage.has("convex-sync-queue")).toBe(false);
  });

  it("an item at MAX_RETRIES is dead-lettered instead of retried again", async () => {
    storage.set(
      "convex-sync-queue",
      JSON.stringify([
        {
          path: "mealLogs:deleteMealLog",
          args: { clientId: "z" },
          queuedAt: Date.now(),
          retryCount: 4,
        },
      ]),
    );

    const { client, mutation } = makeFakeClient(async () => {
      throw new Error("still down");
    });
    sync.setConvexClient(client);
    goOnline();

    await sync.flushSyncQueue();

    expect(mutation).toHaveBeenCalledTimes(1);

    const deadLetters = await sync.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].reason).toBe("max-retries");
    expect(storage.has("convex-sync-queue")).toBe(false);
  });

  it("an unresolvable function path is dead-lettered without calling mutation", async () => {
    // Convex codegens `api` (@/convex/_generated/api) as `anyApi`: a Proxy
    // whose `get` trap returns a further Proxy for *any* string property
    // access (node_modules/convex/dist/esm/server/api.js). So walking the
    // real `api` object — as the other tests deliberately do — can never
    // produce an "unresolvable" path; every path "resolves" to *something*.
    // To exercise resolveMutation's `!mutationRef` guard as coded, stub a
    // narrower api for this test only, exposing just one real function.
    vi.doMock("@/convex/_generated/api", () => ({
      api: { mealLogs: { deleteMealLog: {} } },
    }));
    vi.resetModules();
    ({ useNetworkStore } = await import("@/stores/network-store"));
    sync = await import("@/lib/convex-sync");

    storage.set(
      "convex-sync-queue",
      JSON.stringify([
        {
          path: "nonexistent:fn",
          args: { clientId: "y" },
          queuedAt: Date.now(),
          retryCount: 0,
        },
      ]),
    );

    const { client, mutation } = makeFakeClient(async () => {});
    sync.setConvexClient(client);
    goOnline();

    await sync.flushSyncQueue();

    expect(mutation).not.toHaveBeenCalled();

    const deadLetters = await sync.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].reason).toBe("unknown-path");
  });

  it("THE RACE: an in-flight item stays in getPendingClientIds during flush", async () => {
    storage.set(
      "convex-sync-queue",
      JSON.stringify([
        {
          path: "mealLogs:deleteMealLog",
          args: { clientId: "a" },
          queuedAt: Date.now(),
          retryCount: 0,
        },
      ]),
    );

    let resolveMutation: (() => void) | undefined;
    const { client } = makeFakeClient(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    sync.setConvexClient(client);
    goOnline();

    const flushPromise = sync.flushSyncQueue();
    await tick();

    // Mid-flush: the item has already left memoryQueue (it's mid-replay)
    // but its mutation hasn't committed yet. A hydration merge running
    // concurrently — which is exactly when merges run, since Convex
    // re-delivers subscription data on the same reconnect that triggers a
    // flush — must still treat it as pending, or it will mistake an
    // offline-created row for a server-side delete.
    expect(sync.getPendingClientIds().has("a")).toBe(true);

    resolveMutation?.();
    await flushPromise;

    expect(sync.getPendingClientIds().has("a")).toBe(false);
  });

  // Regression: NetInfo can report isInternetReachable=false (notably on the
  // iOS simulator) while the Convex WebSocket is healthy. Before the fix,
  // every syncToConvex call in that state was queued "offline" and the queue
  // never flushed — mutations (e.g. plans:swapPlanDays) silently stranded.
  it("a live Convex socket overrides NetInfo-reported offline", async () => {
    goOffline(); // NetInfo says offline…
    const mutation = vi.fn(async () => undefined);
    const client = {
      mutation,
      connectionState: () => ({ isWebSocketConnected: true }), // …socket disagrees
    } as unknown as ConvexReactClient;
    sync.setConvexClient(client);

    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "live" });
    await tick();

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(sync.getPendingClientIds().has("live")).toBe(false);
  });

  it("a live-sent mutation's clientId stays pending until the server acks", async () => {
    goOnline();
    let resolveMutation: (() => void) | undefined;
    const mutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const client = {
      mutation,
      connectionState: () => ({ isWebSocketConnected: true }),
    } as unknown as ConvexReactClient;
    sync.setConvexClient(client);

    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "slow" });
    await tick();

    // Sent live but not yet committed: a hydration merge running now must
    // still treat the record as pending or it clobbers the local edit with
    // pre-mutation server data.
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(sync.getPendingClientIds().has("slow")).toBe(true);

    resolveMutation?.();
    await tick();
    expect(sync.getPendingClientIds().has("slow")).toBe(false);
  });

  it("a rejected live send keeps its clientId pending across the re-enqueue handoff", async () => {
    goOnline();
    const mutation = vi.fn(async () => {
      throw new Error("network blip");
    });
    const client = {
      mutation,
      connectionState: () => ({ isWebSocketConnected: true }),
    } as unknown as ConvexReactClient;
    sync.setConvexClient(client);

    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "retry" });
    await tick();

    // The failed send was re-enqueued; the id must still be pending (now via
    // the durable queue) with no unprotected gap in between.
    expect(sync.getPendingClientIds().has("retry")).toBe(true);
    const queue = JSON.parse(storage.get("convex-sync-queue") as string) as Array<{
      args: { clientId: string };
    }>;
    expect(queue).toHaveLength(1);
    expect(queue[0].args.clientId).toBe("retry");
  });

  it("publishes Convex socket state into the network store for UI gating", async () => {
    goOffline(); // NetInfo says offline throughout
    expect(useNetworkStore.getState().socketConnected).toBe(null);

    let notify: ((s: { isWebSocketConnected: boolean }) => void) | undefined;
    const client = {
      mutation: vi.fn(async () => undefined),
      connectionState: () => ({ isWebSocketConnected: false }),
      subscribeToConnectionState: (
        cb: (s: { isWebSocketConnected: boolean }) => void,
      ) => {
        notify = cb;
        return () => {};
      },
    } as unknown as ConvexReactClient;
    sync.setConvexClient(client);
    expect(useNetworkStore.getState().socketConnected).toBe(false);

    notify?.({ isWebSocketConnected: true });
    expect(useNetworkStore.getState().socketConnected).toBe(true);
  });

  it("flushes the queue when the Convex socket connects, even if NetInfo never flips online", async () => {
    goOffline();
    sync.syncToConvex(api.mealLogs.deleteMealLog, { clientId: "q1" });
    await tick();
    expect(sync.getPendingClientIds().has("q1")).toBe(true);

    let connected = false;
    let notify: ((s: { isWebSocketConnected: boolean }) => void) | undefined;
    const mutation = vi.fn(async () => undefined);
    const client = {
      mutation,
      connectionState: () => ({ isWebSocketConnected: connected }),
      subscribeToConnectionState: (
        cb: (s: { isWebSocketConnected: boolean }) => void,
      ) => {
        notify = cb;
        return () => {};
      },
    } as unknown as ConvexReactClient;
    // Socket still down at registration; NetInfo stays "offline" throughout.
    sync.setConvexClient(client);
    await tick();
    expect(mutation).not.toHaveBeenCalled();

    connected = true;
    notify?.({ isWebSocketConnected: true });
    await tick();

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(sync.getPendingClientIds().has("q1")).toBe(false);
  });
});

import type { ConvexReactClient } from "convex/react";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionArgs,
} from "convex/server";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/convex/_generated/api";
import { useNetworkStore } from "@/stores/network-store";

const QUEUE_KEY = "convex-sync-queue";

let convexClient: ConvexReactClient | null = null;
let isFlushing = false;

// ── In-memory queue + mutex ──────────────────────────────────────────
// The in-memory array is the source of truth. AsyncStorage is a
// write-behind cache so the queue survives app restarts.

let memoryQueue: QueuedMutation[] = [];
let memoryQueueLoaded = false;
let mutexPromise: Promise<void> = Promise.resolve();

/**
 * ClientIds for mutations currently being replayed by flushSyncQueue. They
 * are pulled out of memoryQueue (and thus invisible there) the moment the
 * flush snapshot is taken, but their mutation may not have committed yet.
 * getPendingClientIds() unions this with the live queue so a hydration
 * merge running mid-flush doesn't see a false "empty" window and mistake an
 * offline-created row for a server-side delete.
 */
let inFlightClientIds = new Set<string>();

/**
 * Acquire a simple async mutex. Every caller awaits the previous lock's
 * release before proceeding, guaranteeing serial access to the queue.
 */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  const prev = mutexPromise;
  mutexPromise = next;
  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      release!();
    }
  });
}

export function setConvexClient(client: ConvexReactClient) {
  convexClient = client;
}

const MAX_RETRIES = 5;

interface QueuedMutation {
  /** Function path, e.g. "workoutLogs:create" */
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  queuedAt: number;
  retryCount: number;
}

/**
 * Resolve a colon-separated path like "workoutLogs:create" back to a Convex
 * function reference from the generated `api` object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveMutation(path: string): any {
  const [module, fn] = path.split(":");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (api as any)?.[module]?.[fn] ?? null;
}

/**
 * Extract a serialisable path string from a Convex function reference
 * using the official `getFunctionName` utility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMutationPath(mutation: any): string | null {
  try {
    return getFunctionName(mutation);
  } catch {
    return null;
  }
}

// ── Queue persistence (write-behind to AsyncStorage) ─────────────────

async function ensureLoaded(): Promise<void> {
  if (memoryQueueLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw) {
      memoryQueue = JSON.parse(raw) as QueuedMutation[];
    }
  } catch {
    // If AsyncStorage read fails, start with an empty queue.
  }
  memoryQueueLoaded = true;
}

async function persistQueue(): Promise<void> {
  try {
    if (memoryQueue.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
    }
  } catch (err) {
    console.warn("[ConvexSync] Failed to persist queue:", err);
  }
}

async function enqueue(path: string, args: unknown): Promise<void> {
  return withLock(async () => {
    await ensureLoaded();
    memoryQueue.push({ path, args, queuedAt: Date.now(), retryCount: 0 });
    await persistQueue();
  });
}

// ── Dead-letter store (writes we could never deliver) ────────────────
// A persisted record of mutations that were removed from the live queue
// because they can never succeed (unknown path / permanent validation
// error) or exhausted their retries. Nothing is silently dropped: every
// removal lands here so the divergence is recoverable and observable.

const DEAD_LETTER_KEY = "convex-sync-dead-letter";

interface DeadLetterEntry {
  /** Function path, e.g. "workoutLogs:create" */
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  queuedAt: number;
  failedAt: number;
  /** Why the mutation was dead-lettered (truncated error / sentinel). */
  reason: string;
}

async function readDeadLetters(): Promise<DeadLetterEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY);
    if (raw) {
      return JSON.parse(raw) as DeadLetterEntry[];
    }
  } catch {
    // If AsyncStorage read fails, treat as empty.
  }
  return [];
}

async function deadLetter(item: QueuedMutation, reason: string): Promise<void> {
  // Always warn — even in production — because a dead-letter is a write
  // that diverged from the server and needs operator visibility.
  console.warn(`[ConvexSync] Dead-lettering ${item.path}: ${reason}`);
  try {
    const entries = await readDeadLetters();
    entries.push({
      path: item.path,
      args: item.args,
      queuedAt: item.queuedAt,
      failedAt: Date.now(),
      reason,
    });
    await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn("[ConvexSync] Failed to persist dead-letter:", err);
  }
}

export async function getDeadLetterCount(): Promise<number> {
  return (await readDeadLetters()).length;
}

export async function getDeadLetters(): Promise<DeadLetterEntry[]> {
  return readDeadLetters();
}

export async function clearDeadLetters(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEAD_LETTER_KEY);
  } catch (err) {
    console.warn("[ConvexSync] Failed to clear dead-letters:", err);
  }
}

/**
 * Client ids referenced by queued (unflushed) mutations. Hydration merges
 * keep a local copy only when it still has writes in flight. Synchronous
 * snapshot of the in-memory queue.
 */
export function getPendingClientIds(): Set<string> {
  const ids = new Set<string>(inFlightClientIds);
  for (const item of memoryQueue) {
    const cid = (item.args as { clientId?: unknown })?.clientId;
    if (typeof cid === "string") ids.add(cid);
  }
  return ids;
}

/** Whether the persisted queue has been loaded into memory yet. Merges treat
 *  "not loaded" as "keep local" (conservative until the queue is known). */
export function isQueueLoaded(): boolean {
  return memoryQueueLoaded;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Fire-and-forget a Convex mutation from outside React (e.g. from Zustand
 * stores).  When offline, the mutation is immediately queued to AsyncStorage
 * and replayed when `flushSyncQueue` is called (on reconnect / app launch).
 *
 * We check network state *before* calling convexClient.mutation() because
 * Convex buffers mutations over its WebSocket and never rejects — so the
 * .catch() path would never fire when offline.
 */
export function syncToConvex<M extends FunctionReference<"mutation">>(
  mutation: M,
  args: FunctionArgs<M>,
): void {
  const path = getMutationPath(mutation);
  const { isConnected, isInternetReachable } = useNetworkStore.getState();
  const isOffline = isConnected === false || isInternetReachable === false;

  if (!convexClient || isOffline) {
    if (path) {
      if (__DEV__) console.log(`[ConvexSync] Offline — queueing ${path}`);
      void enqueue(path, args);
    }
    return;
  }

  // We're online, but older mutations may still be queued from an offline
  // period. Sending this one live would let it overtake its prerequisites
  // (causal reordering → silent server-side data loss). So fence the live
  // send behind the pending queue: if anything is queued, append this
  // mutation and flush the whole queue in order instead.
  void (async () => {
    const client = convexClient;
    if (!client) {
      if (path) void enqueue(path, args);
      return;
    }

    const queueNonEmpty = await withLock(async () => {
      await ensureLoaded();
      if (memoryQueue.length > 0) {
        // Append inside the same lock so this mutation is ordered after the
        // already-queued ones. (path is null only for unresolvable refs,
        // which we can't queue meaningfully — fall through to a live send.)
        if (path) {
          memoryQueue.push({ path, args, queuedAt: Date.now(), retryCount: 0 });
          await persistQueue();
          return true;
        }
      }
      return false;
    });

    if (queueNonEmpty) {
      // Flush AFTER releasing the lock — flushSyncQueue takes the lock
      // itself, so flushing inside withLock would deadlock.
      void flushSyncQueue();
      return;
    }

    // Queue empty: safe to send live. On error, queue for retry (unchanged).
    client.mutation(mutation, args).catch((err: unknown) => {
      console.warn("[ConvexSync] Mutation failed, queueing for retry:", err);
      if (path) void enqueue(path, args);
    });
  })();
}

/**
 * Classify a send failure. Permanent failures (server-side validation
 * errors) can never succeed on retry, so they are dead-lettered rather than
 * blocking the queue. Everything else is treated as transient.
 */
function isPermanentFailure(err: unknown): boolean {
  return String(err).includes("ArgumentValidationError");
}

/**
 * Replay all queued mutations in order.  Should be called when the device
 * comes back online.
 *
 * Ordering guarantee: the loop stops on the first *transient* failure and
 * re-prepends the unprocessed items (preserving their relative order), so a
 * later mutation can never overtake an earlier one that is still failing.
 */
export async function flushSyncQueue(): Promise<void> {
  if (!convexClient || isFlushing) return;
  isFlushing = true;

  try {
    // Take a snapshot of current items under the lock, then clear them.
    // Any enqueue() calls that arrive while we process will append to the
    // now-empty memoryQueue and will NOT be overwritten.
    const snapshot = await withLock(async () => {
      await ensureLoaded();
      const items = [...memoryQueue];
      memoryQueue = [];
      await persistQueue();
      return items;
    });

    // Everything in the snapshot is about to leave memoryQueue's visibility
    // for the duration of the flush — mark it in-flight so
    // getPendingClientIds() still reports it as pending mid-replay. This is
    // deliberately coarse (kept for the whole flush, not removed per-item as
    // each mutation commits): over-keeping a local copy is always safe, and
    // under-keeping is the data loss this exists to prevent.
    inFlightClientIds = new Set(
      snapshot
        .map((item) => (item.args as { clientId?: unknown })?.clientId)
        .filter((cid): cid is string => typeof cid === "string"),
    );

    if (snapshot.length === 0) return;

    if (__DEV__)
      console.log(`[ConvexSync] Flushing ${snapshot.length} queued mutation(s)…`);

    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i];
      const mutationRef = resolveMutation(item.path);
      if (!mutationRef) {
        // Unresolvable path — can never be delivered. Record, don't drop.
        await deadLetter(item, "unknown-path");
        continue;
      }
      try {
        await convexClient.mutation(mutationRef, item.args);
      } catch (err) {
        if (isPermanentFailure(err)) {
          // Will never succeed; dead-letter and keep draining the rest.
          await deadLetter(item, String(err).slice(0, 300));
          continue;
        }

        const nextRetry = (item.retryCount ?? 0) + 1;
        if (nextRetry >= MAX_RETRIES) {
          // Exhausted retries — record instead of silently discarding.
          await deadLetter(item, "max-retries");
          continue;
        }

        // Transient failure: STOP the loop to preserve causal order.
        // Re-prepend the bumped head plus the rest of the snapshot (and any
        // mutations enqueued while we were flushing) under the lock.
        console.warn(
          `[ConvexSync] Retry ${nextRetry}/${MAX_RETRIES} failed for ${item.path}, pausing flush:`,
          err,
        );
        const remainingSnapshot = snapshot.slice(i + 1);
        const bumpedHead: QueuedMutation = { ...item, retryCount: nextRetry };
        await withLock(async () => {
          memoryQueue = [bumpedHead, ...remainingSnapshot, ...memoryQueue];
          await persistQueue();
        });
        return;
      }
    }

    if (__DEV__) console.log("[ConvexSync] Queue flushed successfully");
  } finally {
    isFlushing = false;
    inFlightClientIds = new Set();
  }
}

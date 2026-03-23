import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function syncToConvex(mutation: any, args: any) {
  const path = getMutationPath(mutation);
  const { isConnected, isInternetReachable } = useNetworkStore.getState();
  const isOffline = isConnected === false || isInternetReachable === false;

  if (!convexClient || isOffline) {
    if (path) {
      console.log(`[ConvexSync] Offline — queueing ${path}`);
      void enqueue(path, args);
    }
    return;
  }

  convexClient.mutation(mutation, args).catch((err: unknown) => {
    console.warn("[ConvexSync] Mutation failed, queueing for retry:", err);
    if (path) void enqueue(path, args);
  });
}

/**
 * Replay all queued mutations in order.  Should be called when the device
 * comes back online.
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

    if (snapshot.length === 0) return;

    console.log(`[ConvexSync] Flushing ${snapshot.length} queued mutation(s)…`);

    const failed: QueuedMutation[] = [];

    for (const item of snapshot) {
      const mutationRef = resolveMutation(item.path);
      if (!mutationRef) {
        console.warn(`[ConvexSync] Unknown mutation path: ${item.path}, dropping`);
        continue;
      }
      try {
        await convexClient.mutation(mutationRef, item.args);
      } catch (err) {
        const nextRetry = (item.retryCount ?? 0) + 1;
        if (nextRetry >= MAX_RETRIES) {
          console.warn(
            `[ConvexSync] Dropping ${item.path} after ${MAX_RETRIES} failed retries:`,
            err,
          );
        } else {
          console.warn(
            `[ConvexSync] Retry ${nextRetry}/${MAX_RETRIES} failed for ${item.path}:`,
            err,
          );
          failed.push({ ...item, retryCount: nextRetry });
        }
      }
    }

    // Re-enqueue failed items under the lock (prepend so they retry first).
    if (failed.length > 0) {
      await withLock(async () => {
        memoryQueue = [...failed, ...memoryQueue];
        await persistQueue();
      });
      console.warn(`[ConvexSync] ${failed.length} mutation(s) still pending`);
    } else {
      console.log("[ConvexSync] Queue flushed successfully");
    }
  } finally {
    isFlushing = false;
  }
}

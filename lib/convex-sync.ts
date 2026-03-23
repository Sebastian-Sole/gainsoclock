import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/convex/_generated/api";
import { useNetworkStore } from "@/stores/network-store";

const QUEUE_KEY = "convex-sync-queue";

let convexClient: ConvexReactClient | null = null;
let isFlushing = false;

export function setConvexClient(client: ConvexReactClient) {
  convexClient = client;
}

interface QueuedMutation {
  /** Function path, e.g. "workoutLogs:create" */
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  queuedAt: number;
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

// ── Queue persistence ────────────────────────────────────────────────

async function loadQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedMutation[]): Promise<void> {
  try {
    if (queue.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (err) {
    console.warn("[ConvexSync] Failed to persist queue:", err);
  }
}

async function enqueue(path: string, args: unknown): Promise<void> {
  const queue = await loadQueue();
  queue.push({ path, args, queuedAt: Date.now() });
  await saveQueue(queue);
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
    const queue = await loadQueue();
    if (queue.length === 0) return;

    console.log(`[ConvexSync] Flushing ${queue.length} queued mutation(s)…`);

    const remaining: QueuedMutation[] = [];

    for (const item of queue) {
      const mutationRef = resolveMutation(item.path);
      if (!mutationRef) {
        console.warn(`[ConvexSync] Unknown mutation path: ${item.path}, dropping`);
        continue;
      }
      try {
        await convexClient.mutation(mutationRef, item.args);
      } catch (err) {
        console.warn(`[ConvexSync] Retry failed for ${item.path}:`, err);
        remaining.push(item);
      }
    }

    await saveQueue(remaining);

    if (remaining.length > 0) {
      console.warn(`[ConvexSync] ${remaining.length} mutation(s) still pending`);
    } else {
      console.log("[ConvexSync] Queue flushed successfully");
    }
  } finally {
    isFlushing = false;
  }
}

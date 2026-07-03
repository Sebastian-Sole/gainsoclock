/**
 * Pure, queue-aware hydration merge shared by the offline-first stores
 * (history, meal-log, plan, template). Server data arrives via Convex
 * queries; local data may have queued/in-flight writes that haven't reached
 * the server yet. This merge decides, per item, whether the local or server
 * copy wins — without resurrecting items whose deletion is still in flight.
 *
 * Extracted from four copy-drifted store implementations (plan 036). See
 * `plans/036-hydration-merge-consolidation.md` for the full rationale.
 */
export interface MergeInput<L, S> {
  local: L[];
  server: S[];
  /** clientId of a local item (local id === server clientId). */
  localId: (l: L) => string;
  /** clientId of a server item. */
  serverId: (s: S) => string;
  /** Map a server payload to the local shape. */
  toLocal: (s: S) => L;
  /** Clientids with queued/in-flight writes. */
  pending: Set<string>;
  /** Whether the queue has been loaded into memory yet. */
  queueKnown: boolean;
  /**
   * Conflict rule when both sides exist and local has no pending write.
   * Return the item to keep. Default: server-wins (returns `toLocal(s)`).
   */
  resolveConflict?: (local: L, server: S) => L;
  /**
   * For a local-only, non-pending item: true = server absence means
   * deletion here, drop it.
   */
  dropLocalOnly: (l: L) => boolean;
}

export function mergeQueueAware<L, S>(input: MergeInput<L, S>): L[] {
  const {
    local,
    server,
    localId,
    serverId,
    toLocal,
    pending,
    queueKnown,
    resolveConflict,
    dropLocalOnly,
  } = input;

  const localById = new Map(local.map((l) => [localId(l), l]));
  const merged: L[] = [];
  const seenIds = new Set<string>();

  for (const s of server) {
    const id = serverId(s);
    seenIds.add(id);
    const localItem = localById.get(id);

    if (localItem && (pending.has(id) || !queueKnown)) {
      merged.push(localItem);
    } else if (!localItem && pending.has(id) && queueKnown) {
      // In-flight delete: local copy is gone and a queued mutation still
      // references this clientId — don't resurrect the server copy.
      continue;
    } else if (localItem) {
      merged.push(resolveConflict ? resolveConflict(localItem, s) : toLocal(s));
    } else {
      merged.push(toLocal(s));
    }
  }

  for (const l of local) {
    const id = localId(l);
    if (seenIds.has(id)) continue;
    if (pending.has(id) || !queueKnown) {
      merged.push(l);
    } else if (!dropLocalOnly(l)) {
      merged.push(l);
    }
  }

  return merged;
}

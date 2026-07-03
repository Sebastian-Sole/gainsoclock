import { create } from 'zustand';
import type { AchievementDef } from '@/lib/achievements';

/**
 * Session-scoped feed of achievement defs newly unlocked by
 * `lib/achievement-engine.ts`. Read by `components/achievements/unlock-toast.tsx`
 * to drive the toast queue.
 *
 * Deliberately NOT persisted — the feed only needs to survive for the current
 * session (the host's own `enqueuedKeysRef` dedupes across renders; unlock
 * state itself is durable in `stores/achievements-store.ts`).
 */
interface UnlockToastState {
  /** Append-only for the session; never cleared. */
  feed: AchievementDef[];
  /** Idempotent — appends only defs whose key isn't already in the feed. */
  push: (defs: AchievementDef[]) => void;
}

export const useUnlockToastStore = create<UnlockToastState>()((set) => ({
  feed: [],

  push: (defs) => {
    if (defs.length === 0) return;
    set((state) => {
      const seen = new Set(state.feed.map((d) => d.key));
      const additions = defs.filter((d) => !seen.has(d.key));
      return additions.length > 0 ? { feed: [...state.feed, ...additions] } : state;
    });
  },
}));

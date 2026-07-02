import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateLegacyUnlocks } from '@/lib/achievements';
import { zustandStorage } from '@/lib/storage';

/**
 * Persisted achievement unlock state. Local-only (AsyncStorage) — there is
 * no Convex sync for achievements yet; unlocks are derived facts and can be
 * re-earned on a fresh install from synced history.
 *
 * Evaluation lives in `hooks/use-achievements.ts` (stores never import other
 * stores; facts are composed in the hook).
 */
interface AchievementsState {
  /** Achievement key → unlock timestamp (ISO 8601). */
  unlocked: Record<string, string>;
  /** ISO timestamp of the last evaluation that unlocked something, null before first unlock. */
  lastEvaluatedAt: string | null;
  /**
   * True once this device has absorbed its initial reconciliation with
   * server-synced history. Achievements are re-derived from history on a fresh
   * install (they aren't server-synced), so the FIRST batch of "unlocks" after
   * signing in is backfill, not fresh gameplay — it must be persisted silently,
   * never toasted. `use-achievements.ts` flips this once the backfill settles.
   */
  hasSeededBaseline: boolean;

  /** Idempotent: keys already unlocked keep their original timestamp. */
  markUnlocked: (keys: string[]) => void;
  /** Lock in the baseline so genuine future unlocks surface as toasts. */
  markBaselineSeeded: () => void;
}

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set) => ({
      unlocked: {},
      lastEvaluatedAt: null,
      hasSeededBaseline: false,

      markUnlocked: (keys) => {
        if (keys.length === 0) return;
        set((state) => {
          const nowIso = new Date().toISOString();
          const unlocked = { ...state.unlocked };
          for (const key of keys) {
            if (!(key in unlocked)) unlocked[key] = nowIso;
          }
          return { unlocked, lastEvaluatedAt: nowIso };
        });
      },

      markBaselineSeeded: () =>
        set((state) =>
          state.hasSeededBaseline ? state : { hasSeededBaseline: true }
        ),
    }),
    {
      name: 'achievements-storage',
      storage: zustandStorage,
      // v1: milestone achievements became leveled families (Streaker I/II/III).
      // Map legacy single-threshold keys onto the new `${family}.${level}` keys
      // so prior unlocks survive the update without re-firing as toasts.
      // v2: introduce `hasSeededBaseline`. Existing users with unlocks are
      // treated as already baselined (normal toasts going forward); a fresh
      // (empty) store baselines silently on its first post-sign-in sync.
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<AchievementsState> | undefined;
        if (!state) return state as unknown as AchievementsState;
        const unlocked =
          version < 1 ? migrateLegacyUnlocks(state.unlocked ?? {}) : state.unlocked ?? {};
        const hasSeededBaseline =
          state.hasSeededBaseline ?? Object.keys(unlocked).length > 0;
        return { ...state, unlocked, hasSeededBaseline } as AchievementsState;
      },
    }
  )
);

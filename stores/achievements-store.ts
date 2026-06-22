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

  /** Idempotent: keys already unlocked keep their original timestamp. */
  markUnlocked: (keys: string[]) => void;
}

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set) => ({
      unlocked: {},
      lastEvaluatedAt: null,

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
    }),
    {
      name: 'achievements-storage',
      storage: zustandStorage,
      // v1: milestone achievements became leveled families (Streaker I/II/III).
      // Map legacy single-threshold keys onto the new `${family}.${level}` keys
      // so prior unlocks survive the update without re-firing as toasts.
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<AchievementsState> | undefined;
        if (!state) return state as unknown as AchievementsState;
        if (version < 1) {
          return {
            ...state,
            unlocked: migrateLegacyUnlocks(state.unlocked ?? {}),
          } as AchievementsState;
        }
        return state as AchievementsState;
      },
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

/**
 * One-shot engagement flags for achievements whose trigger isn't derivable
 * from synced data (chat/recipe actions leave no queryable provenance). The
 * relevant component calls `mark(...)` imperatively when the action succeeds;
 * `hooks/use-achievements.ts` reads these as facts.
 *
 * Local-only (AsyncStorage), like `achievements-store` — these are derived
 * engagement signals, not source-of-truth data.
 */
export type AchievementEvent =
  | 'chatMessageSent' // First Words — messaged the AI coach
  | 'chatMealLogged' // Let AI Cook — logged a meal via the coach
  | 'aiMacrosGenerated'; // Sous Chef — estimated recipe macros with AI

interface AchievementEventsState {
  chatMessageSent: boolean;
  chatMealLogged: boolean;
  aiMacrosGenerated: boolean;
  /** Idempotent — flips the flag on; no-op once already set. */
  mark: (event: AchievementEvent) => void;
}

export const useAchievementEventsStore = create<AchievementEventsState>()(
  persist(
    (set) => ({
      chatMessageSent: false,
      chatMealLogged: false,
      aiMacrosGenerated: false,
      mark: (event) =>
        set((state) => (state[event] ? state : { [event]: true })),
    }),
    {
      name: 'achievement-events-storage',
      storage: zustandStorage,
    }
  )
);

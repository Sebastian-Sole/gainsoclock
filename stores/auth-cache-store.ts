import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

interface AuthCacheState {
  wasAuthenticated: boolean;
  hasCompletedOnboarding: boolean;

  cacheAuthState: (isAuth: boolean, onboarded: boolean) => void;
  clear: () => void;
}

export const useAuthCacheStore = create<AuthCacheState>()(
  persist(
    (set) => ({
      wasAuthenticated: false,
      hasCompletedOnboarding: false,

      cacheAuthState: (isAuth, onboarded) => {
        set({ wasAuthenticated: isAuth, hasCompletedOnboarding: onboarded });
      },

      clear: () => {
        set({ wasAuthenticated: false, hasCompletedOnboarding: false });
      },
    }),
    {
      name: 'auth-cache-storage',
      storage: zustandStorage,
    }
  )
);

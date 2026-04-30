import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

interface AuthCacheState {
  wasAuthenticated: boolean;
  hasCompletedOnboarding: boolean;

  // Trial-confirmation banner (plan-08, UX #12). 24h auto-dismiss + permanent X.
  trialBannerFirstShownAt: string | null;
  trialBannerDismissedPermanently: boolean;

  cacheAuthState: (isAuth: boolean, onboarded: boolean) => void;
  setHasCompletedOnboarding: (value: boolean) => void;
  markTrialBannerShown: () => void;
  dismissTrialBannerPermanently: () => void;
  resetTrialBanner: () => void;
  clear: () => void;
}

const INITIAL = {
  wasAuthenticated: false,
  hasCompletedOnboarding: false,
  trialBannerFirstShownAt: null,
  trialBannerDismissedPermanently: false,
} as const;

export const useAuthCacheStore = create<AuthCacheState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      cacheAuthState: (isAuth, onboarded) => {
        set({ wasAuthenticated: isAuth, hasCompletedOnboarding: onboarded });
      },

      setHasCompletedOnboarding: (value) => {
        set({ hasCompletedOnboarding: value });
      },

      markTrialBannerShown: () => {
        if (get().trialBannerFirstShownAt) return;
        set({ trialBannerFirstShownAt: new Date().toISOString() });
      },

      dismissTrialBannerPermanently: () => {
        set({ trialBannerDismissedPermanently: true });
      },

      resetTrialBanner: () => {
        set({
          trialBannerFirstShownAt: null,
          trialBannerDismissedPermanently: false,
        });
      },

      clear: () => {
        set({ ...INITIAL });
      },
    }),
    {
      name: 'auth-cache-storage',
      storage: zustandStorage,
    }
  )
);

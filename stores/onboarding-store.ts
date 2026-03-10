import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { ONBOARDING_STEPS } from '@/lib/onboarding-steps';

interface OnboardingState {
  // Persisted
  hasCompletedOnboarding: boolean;

  // Ephemeral (not persisted)
  currentStep: number;
  isActive: boolean;

  // Actions
  startOnboarding: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      hasCompletedOnboarding: false,
      currentStep: 0,
      isActive: false,

      startOnboarding: () => {
        set({ isActive: true, currentStep: 0 });
      },

      nextStep: () => {
        const { currentStep } = get();
        if (currentStep >= ONBOARDING_STEPS.length - 1) {
          get().completeOnboarding();
        } else {
          set({ currentStep: currentStep + 1 });
        }
      },

      prevStep: () => {
        const { currentStep } = get();
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 });
        }
      },

      skipOnboarding: () => {
        set({ isActive: false, currentStep: 0, hasCompletedOnboarding: true });
      },

      completeOnboarding: () => {
        set({ isActive: false, currentStep: 0, hasCompletedOnboarding: true });
      },

      resetOnboarding: () => {
        set({ hasCompletedOnboarding: false, currentStep: 0, isActive: false });
      },
    }),
    {
      name: 'onboarding-storage',
      storage: zustandStorage,
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { NutritionGoals } from '@/lib/types';

const DEFAULT_GOALS: NutritionGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
};

interface NutritionGoalsState {
  goals: NutritionGoals;
  setGoals: (goals: NutritionGoals) => void;
  hydrateFromServer: (serverGoals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}

export const useNutritionGoalsStore = create<NutritionGoalsState>()(
  persist(
    (set) => ({
      goals: DEFAULT_GOALS,

      setGoals: (goals) => {
        set({ goals });
        syncToConvex(api.nutritionGoals.upsert, goals);
      },

      hydrateFromServer: (serverGoals) => {
        set({
          goals: {
            calories: serverGoals.calories,
            protein: serverGoals.protein,
            carbs: serverGoals.carbs,
            fat: serverGoals.fat,
          },
        });
      },
    }),
    {
      name: 'nutrition-goals-storage',
      storage: zustandStorage,
      version: 1,
      migrate: () => ({ goals: DEFAULT_GOALS }),
    }
  )
);

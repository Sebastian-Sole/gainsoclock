import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import { format } from 'date-fns';
import type { MealLog, Macros } from '@/lib/types';

interface MealLogState {
  todayMeals: MealLog[];
  /** ISO date string of when todayMeals was last set (to detect stale cache) */
  mealsDate: string | null;

  addMeal: (data: {
    date: string;
    recipeClientId?: string;
    title: string;
    portionMultiplier: number;
    macros: Macros;
    notes?: string;
  }) => MealLog;
  deleteMeal: (id: string) => void;
  hydrateFromServer: (meals: Array<{
    clientId: string;
    date: string;
    recipeClientId?: string;
    title: string;
    portionMultiplier: number;
    macros: { calories: number; protein: number; carbs: number; fat: number };
    notes?: string;
    loggedAt: string;
  }>) => void;
}

function todayLocal() {
  return format(new Date(), 'yyyy-MM-dd');
}

export const useMealLogStore = create<MealLogState>()(
  persist(
    (set, _get) => ({
      todayMeals: [],
      mealsDate: null,

      addMeal: (data) => {
        const meal: MealLog = {
          id: generateId(),
          ...data,
          loggedAt: new Date().toISOString(),
        };
        set((state) => ({
          todayMeals: [meal, ...state.todayMeals],
          mealsDate: todayLocal(),
        }));

        syncToConvex(api.mealLogs.logMeal, {
          clientId: meal.id,
          date: meal.date,
          recipeClientId: meal.recipeClientId,
          title: meal.title,
          portionMultiplier: meal.portionMultiplier,
          macros: meal.macros,
          notes: meal.notes,
          loggedAt: meal.loggedAt,
        });

        return meal;
      },

      deleteMeal: (id) => {
        set((state) => ({
          todayMeals: state.todayMeals.filter((m) => m.id !== id),
        }));
        syncToConvex(api.mealLogs.deleteMealLog, { clientId: id });
      },

      hydrateFromServer: (meals) => {
        const mapped: MealLog[] = meals.map((m) => ({
          id: m.clientId,
          date: m.date,
          recipeClientId: m.recipeClientId,
          title: m.title,
          portionMultiplier: m.portionMultiplier,
          macros: m.macros,
          notes: m.notes,
          loggedAt: m.loggedAt,
        }));
        set({ todayMeals: mapped, mealsDate: todayLocal() });
      },
    }),
    {
      name: 'meal-log-storage',
      storage: zustandStorage,
      onRehydrateStorage: () => () => {
        // Clear stale meals from a previous day via setState so
        // subscribers are notified and the cleared state is persisted.
        const { mealsDate } = useMealLogStore.getState();
        if (mealsDate !== null && mealsDate !== todayLocal()) {
          useMealLogStore.setState({ todayMeals: [], mealsDate: null });
        }
      },
    }
  )
);

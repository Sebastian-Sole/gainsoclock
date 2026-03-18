import { create } from 'zustand';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { MealLog, Macros } from '@/lib/types';

interface MealLogState {
  todayMeals: MealLog[];

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

export const useMealLogStore = create<MealLogState>()((set) => ({
  todayMeals: [],

  addMeal: (data) => {
    const meal: MealLog = {
      id: generateId(),
      ...data,
      loggedAt: new Date().toISOString(),
    };
    set((state) => ({ todayMeals: [meal, ...state.todayMeals] }));

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
    set({ todayMeals: mapped });
  },
}));

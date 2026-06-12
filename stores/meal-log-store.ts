import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { recomputeProteinNudge } from '@/lib/notifications';
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

/**
 * Protein consumed today, summed from the store. Returns 0 when the cached
 * meals belong to a previous day (stale cache cleared lazily on rehydrate).
 */
export function getTodayProteinConsumed(): number {
  const { todayMeals, mealsDate } = useMealLogStore.getState();
  if (mealsDate !== null && mealsDate !== todayLocal()) return 0;
  return todayMeals.reduce((sum, m) => sum + m.macros.protein, 0);
}

/**
 * The protein-nudge recompute seam: every code path that changes today's meal
 * logs flows through this store (manual log, photo log, barcode log, delete,
 * server hydration), so the store actions call this after each change.
 * Foreground/app-resume recompute lives in the today-tab AppState effect.
 */
function recomputeProteinNudgeFromStore(): void {
  void recomputeProteinNudge(getTodayProteinConsumed());
}

export const useMealLogStore = create<MealLogState>()(
  persist(
    (set, get) => ({
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

        recomputeProteinNudgeFromStore();

        return meal;
      },

      deleteMeal: (id) => {
        set((state) => ({
          todayMeals: state.todayMeals.filter((m) => m.id !== id),
        }));
        syncToConvex(api.mealLogs.deleteMealLog, { clientId: id });
        recomputeProteinNudgeFromStore();
      },

      hydrateFromServer: (meals) => {
        const localMeals = get().todayMeals;
        const localById = new Map(localMeals.map((m) => [m.id, m]));

        const merged: MealLog[] = [];
        const seenIds = new Set<string>();

        // For each server meal, prefer local version if it exists (may have unsaved changes)
        for (const sm of meals) {
          seenIds.add(sm.clientId);
          const local = localById.get(sm.clientId);
          if (local) {
            merged.push(local);
          } else {
            // Server-only: map to local shape
            merged.push({
              id: sm.clientId,
              date: sm.date,
              recipeClientId: sm.recipeClientId,
              title: sm.title,
              portionMultiplier: sm.portionMultiplier,
              macros: sm.macros,
              notes: sm.notes,
              loggedAt: sm.loggedAt,
            });
          }
        }

        // Preserve local-only meals (not yet on server)
        for (const m of localMeals) {
          if (!seenIds.has(m.id)) {
            merged.push(m);
          }
        }

        set({ todayMeals: merged, mealsDate: todayLocal() });
        recomputeProteinNudgeFromStore();
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

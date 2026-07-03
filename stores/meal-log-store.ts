import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { capture } from '@/lib/analytics';
import { syncToConvex, getPendingClientIds, isQueueLoaded } from '@/lib/convex-sync';
import { mergeQueueAware } from '@/lib/hydration-merge';
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
  }>, date: string) => void;
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

        // Method is not threaded through from callers (scan/index.tsx,
        // log-meal-modal.tsx, photo-meal-sheet.tsx all funnel through this
        // single action) — recorded as "manual" until a discriminator is
        // added to the addMeal payload. See plan 049 report.
        capture({ name: 'meal_logged', props: { method: 'manual' } });

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

      hydrateFromServer: (meals, date) => {
        // Same-day guard runs BEFORE the merge (not inside `dropLocalOnly`):
        // other-day meals are stale leftovers that must be dropped even while
        // pending (e.g. a midnight rollover with an unflushed create), and
        // `dropLocalOnly` can't override the merge's "pending → keep" rule.
        // Meal dates are immutable (no updateMeal action), so a local id can
        // only ever match a same-date server item — pre-filtering is safe.
        const sameDayLocal = get().todayMeals.filter((m) => m.date === date);

        // Queue-aware server-wins for the queried date: keep local only while
        // it has writes in flight (or the queue isn't loaded); otherwise the
        // server copy wins so cross-device edits land. Local-only meals: keep
        // an unsynced create, otherwise drop it (the server authoritatively
        // covered this date → deletion).
        const merged = mergeQueueAware<MealLog, (typeof meals)[number]>({
          local: sameDayLocal,
          server: meals,
          localId: (m) => m.id,
          serverId: (sm) => sm.clientId,
          toLocal: (sm) => ({
            id: sm.clientId,
            date: sm.date,
            recipeClientId: sm.recipeClientId,
            title: sm.title,
            portionMultiplier: sm.portionMultiplier,
            macros: sm.macros,
            notes: sm.notes,
            loggedAt: sm.loggedAt,
          }),
          pending: getPendingClientIds(),
          queueKnown: isQueueLoaded(),
          dropLocalOnly: () => true,
        });

        set({ todayMeals: merged, mealsDate: date });
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

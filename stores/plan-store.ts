import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { getPendingClientIds, isQueueLoaded } from '@/lib/convex-sync';
import type { WorkoutPlan, PlanDay, PlanStatus } from '@/lib/types';

interface PlanWithDays extends WorkoutPlan {
  days: PlanDay[];
}

interface PlanState {
  plans: WorkoutPlan[];
  /** The active plan with its days populated (for offline "today's workout" etc.) */
  activePlanWithDays: PlanWithDays | null;

  getPlans: () => WorkoutPlan[];
  getActivePlan: () => WorkoutPlan | undefined;
  getActivePlanWithDays: () => PlanWithDays | null;
  removePlan: (id: string) => void;

  hydrateFromServer: (serverPlans: Array<{
    clientId: string;
    name: string;
    description: string;
    goal?: string;
    durationWeeks: number;
    startDate: string;
    status: string;
    sourceConversationClientId?: string;
    createdAt: string;
    updatedAt: string;
  }>) => void;

  hydrateActivePlanFromServer: (serverPlanWithDays: {
    clientId: string;
    name: string;
    description: string;
    goal?: string;
    durationWeeks: number;
    startDate: string;
    status: string;
    sourceConversationClientId?: string;
    createdAt: string;
    updatedAt: string;
    days: Array<{
      planClientId: string;
      week: number;
      dayOfWeek: number;
      templateClientId?: string;
      label?: string;
      notes?: string;
      status: string;
      workoutLogClientId?: string;
    }>;
  } | null) => void;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      plans: [],
      activePlanWithDays: null,

      getPlans: () => get().plans,
      getActivePlan: () => get().plans.find((p) => p.status === 'active'),
      getActivePlanWithDays: () => get().activePlanWithDays,

      removePlan: (id) => {
        set((state) => ({
          plans: state.plans.filter((p) => p.id !== id),
          activePlanWithDays:
            state.activePlanWithDays?.id === id ? null : state.activePlanWithDays,
        }));
      },

      hydrateFromServer: (serverPlans) => {
        const localPlans = get().plans;
        const localById = new Map(localPlans.map((p) => [p.id, p]));

        const pending = getPendingClientIds();
        const queueKnown = isQueueLoaded();

        const merged: WorkoutPlan[] = [];
        const seenIds = new Set<string>();

        // Queue-aware server-wins: the store has no local edit actions, so a
        // local copy can only legitimately differ while it has a write in
        // flight (or the queue isn't loaded). Otherwise the server copy wins.
        for (const sp of serverPlans) {
          seenIds.add(sp.clientId);
          const local = localById.get(sp.clientId);
          if (local && (pending.has(local.id) || !queueKnown)) {
            merged.push(local);
          } else {
            merged.push({
              id: sp.clientId,
              name: sp.name,
              description: sp.description,
              goal: sp.goal,
              durationWeeks: sp.durationWeeks,
              startDate: sp.startDate,
              status: sp.status as PlanStatus,
              sourceConversationClientId: sp.sourceConversationClientId,
              createdAt: sp.createdAt,
              updatedAt: sp.updatedAt,
            });
          }
        }

        // Local-only plans: keep an unsynced create, otherwise drop it (server
        // absence within an unscoped query IS deletion).
        for (const p of localPlans) {
          if (seenIds.has(p.id)) continue;
          if (pending.has(p.id) || !queueKnown) {
            merged.push(p);
          }
        }

        set({ plans: merged });
      },

      hydrateActivePlanFromServer: (serverPlanWithDays) => {
        if (!serverPlanWithDays) {
          set({ activePlanWithDays: null });
          return;
        }

        const mapped: PlanWithDays = {
          id: serverPlanWithDays.clientId,
          name: serverPlanWithDays.name,
          description: serverPlanWithDays.description,
          goal: serverPlanWithDays.goal,
          durationWeeks: serverPlanWithDays.durationWeeks,
          startDate: serverPlanWithDays.startDate,
          status: serverPlanWithDays.status as PlanStatus,
          sourceConversationClientId: serverPlanWithDays.sourceConversationClientId,
          createdAt: serverPlanWithDays.createdAt,
          updatedAt: serverPlanWithDays.updatedAt,
          days: serverPlanWithDays.days.map((d) => ({
            planClientId: d.planClientId,
            week: d.week,
            dayOfWeek: d.dayOfWeek,
            templateClientId: d.templateClientId,
            label: d.label,
            notes: d.notes,
            status: d.status as PlanDay['status'],
            workoutLogClientId: d.workoutLogClientId,
          })),
        };

        set({ activePlanWithDays: mapped });
      },
    }),
    {
      name: 'plan-storage',
      storage: zustandStorage,
      version: 1,
      migrate: () => ({ plans: [], activePlanWithDays: null }),
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { WorkoutLog, WorkoutSet } from '@/lib/types';
import { format } from 'date-fns';

function flattenSet(s: WorkoutSet) {
  return {
    clientId: s.id,
    order: 0, // will be set by caller
    completed: s.completed,
    type: s.type,
    ...('reps' in s && { reps: s.reps }),
    ...('weight' in s && { weight: s.weight }),
    ...('time' in s && { time: s.time }),
    ...('distance' in s && { distance: s.distance }),
  };
}

interface HistoryState {
  logs: WorkoutLog[];

  addLog: (log: WorkoutLog) => void;
  updateLog: (id: string, updates: Partial<Omit<WorkoutLog, 'id'>>) => void;
  deleteLog: (id: string) => void;
  getLogsForDate: (date: Date) => WorkoutLog[];
  getDatesWithWorkouts: (year: number, month: number) => Set<string>;
  hydrateFromServer: (serverLogs: Array<{
    clientId: string;
    templateId?: string;
    templateName: string;
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
  }>) => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      logs: [],

      addLog: (log) => {
        set((state) => ({ logs: [log, ...state.logs] }));

        syncToConvex(api.workoutLogs.create, {
          clientId: log.id,
          templateId: log.templateId,
          templateName: log.templateName,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          durationSeconds: log.durationSeconds,
          exercises: log.exercises.map((e) => ({
            clientId: e.id,
            exerciseClientId: e.exerciseId,
            order: e.order,
            restTimeSeconds: e.restTimeSeconds,
            sets: e.sets.map((s, i) => ({
              ...flattenSet(s),
              order: i,
            })),
          })),
        });
      },

      updateLog: (id, updates) => {
        set((state) => ({
          logs: state.logs.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
        }));

        const { exercises, ...rest } = updates;
        syncToConvex(api.workoutLogs.update, {
          clientId: id,
          ...rest,
          ...(exercises && {
            exercises: exercises.map((e) => ({
              clientId: e.id,
              exerciseClientId: e.exerciseId,
              order: e.order,
              restTimeSeconds: e.restTimeSeconds,
              sets: e.sets.map((s, i) => ({
                ...flattenSet(s),
                order: i,
              })),
            })),
          }),
        });
      },

      deleteLog: (id) => {
        set((state) => ({
          logs: state.logs.filter((l) => l.id !== id),
        }));

        syncToConvex(api.workoutLogs.remove, { clientId: id });
      },

      getLogsForDate: (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return get().logs.filter(
          (log) => format(new Date(log.startedAt), 'yyyy-MM-dd') === dateStr
        );
      },

      getDatesWithWorkouts: (year, month) => {
        const dates = new Set<string>();
        get().logs.forEach((log) => {
          const logDate = new Date(log.startedAt);
          if (logDate.getFullYear() === year && logDate.getMonth() === month) {
            dates.add(format(logDate, 'yyyy-MM-dd'));
          }
        });
        return dates;
      },

      hydrateFromServer: (serverLogs) => {
        const localLogs = get().logs;
        const localById = new Map(localLogs.map((l) => [l.id, l]));

        const merged: WorkoutLog[] = [];
        const seenIds = new Set<string>();

        // For each server log, prefer local version if it exists (has full exercise/set data)
        for (const sl of serverLogs) {
          seenIds.add(sl.clientId);
          const local = localById.get(sl.clientId);
          if (local) {
            merged.push(local);
          } else {
            // Server-only: create with empty exercises (metadata only)
            merged.push({
              id: sl.clientId,
              templateId: sl.templateId,
              templateName: sl.templateName,
              exercises: [],
              startedAt: sl.startedAt,
              completedAt: sl.completedAt,
              durationSeconds: sl.durationSeconds,
            });
          }
        }

        // Preserve local-only logs
        for (const l of localLogs) {
          if (!seenIds.has(l.id)) {
            merged.push(l);
          }
        }

        merged.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
        set({ logs: merged });
      },
    }),
    {
      name: 'history-storage',
      storage: zustandStorage,
      version: 2,
      migrate: () => {
        // Old format data is incompatible — start fresh (server will re-hydrate)
        return { logs: [] };
      },
    }
  )
);

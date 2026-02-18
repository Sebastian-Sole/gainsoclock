import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { WorkoutLog, Exercise } from '@/lib/types';
import { format } from 'date-fns';

interface HistoryState {
  logs: WorkoutLog[];

  addLog: (log: WorkoutLog) => void;
  deleteLog: (id: string) => void;
  getLogsForDate: (date: Date) => WorkoutLog[];
  getDatesWithWorkouts: (year: number, month: number) => Set<string>;
  hydrateFromServer: (serverLogs: Array<{ clientId: string; templateId?: string; templateName: string; exercises: Exercise[]; startedAt: string; completedAt: string; durationSeconds: number }>) => void;
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
          exercises: log.exercises,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          durationSeconds: log.durationSeconds,
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
        const mapped: WorkoutLog[] = serverLogs.map((l) => ({
          id: l.clientId,
          templateId: l.templateId,
          templateName: l.templateName,
          exercises: l.exercises,
          startedAt: l.startedAt,
          completedAt: l.completedAt,
          durationSeconds: l.durationSeconds,
        }));
        // Keep newest first
        mapped.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
        set({ logs: mapped });
      },
    }),
    {
      name: 'history-storage',
      storage: zustandStorage,
    }
  )
);

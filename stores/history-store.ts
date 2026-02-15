import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import type { WorkoutLog } from '@/lib/types';
import { format } from 'date-fns';

interface HistoryState {
  logs: WorkoutLog[];

  addLog: (log: WorkoutLog) => void;
  deleteLog: (id: string) => void;
  getLogsForDate: (date: Date) => WorkoutLog[];
  getDatesWithWorkouts: (year: number, month: number) => Set<string>;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      logs: [],

      addLog: (log) =>
        set((state) => ({ logs: [log, ...state.logs] })),

      deleteLog: (id) =>
        set((state) => ({
          logs: state.logs.filter((l) => l.id !== id),
        })),

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
    }),
    {
      name: 'history-storage',
      storage: zustandStorage,
    }
  )
);

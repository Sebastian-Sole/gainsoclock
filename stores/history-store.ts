import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { syncToConvex, getPendingClientIds, isQueueLoaded } from '@/lib/convex-sync';
import { mergeQueueAware } from '@/lib/hydration-merge';
import { api } from '@/convex/_generated/api';
import type { WorkoutLog, WorkoutLogExercise, WorkoutSet } from '@/lib/types';
import { resolveExerciseMetricsLoose } from '@/lib/metrics';
import { coerceLoadMode } from '@/lib/load-mode';
import { format, startOfMonth, subMonths } from 'date-fns';

function flattenSet(s: WorkoutSet) {
  return {
    clientId: s.id,
    order: 0, // will be set by caller
    completed: s.completed,
    type: s.type,
    ...(s.reps !== undefined && { reps: s.reps }),
    ...(s.weight !== undefined && { weight: s.weight }),
    ...(s.time !== undefined && { time: s.time }),
    ...(s.distance !== undefined && { distance: s.distance }),
    ...(s.powerAvg !== undefined && { powerAvg: s.powerAvg }),
    ...(s.heartRateAvg !== undefined && { heartRateAvg: s.heartRateAvg }),
    ...(s.cadence !== undefined && { cadence: s.cadence }),
    ...(s.calories !== undefined && { calories: s.calories }),
    ...(s.rpe !== undefined && { rpe: s.rpe }),
    ...(s.variant !== undefined && { variant: s.variant }),
    ...(s.metric !== undefined && { metric: s.metric }),
    ...(s.paceSeconds !== undefined && { paceSeconds: s.paceSeconds }),
    ...(s.speed !== undefined && { speed: s.speed }),
    ...(s.incline !== undefined && { incline: s.incline }),
    ...(s.distanceUnit !== undefined && { distanceUnit: s.distanceUnit }),
  };
}

function getDefaultRange() {
  const now = new Date();
  const from = startOfMonth(subMonths(now, 4)).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  return { from, to };
}

/** Ensure the persisted range covers at least the current 5-month window. */
function ensureCurrentRange(persisted: { from: string; to: string }) {
  const fresh = getDefaultRange();
  return {
    from: persisted.from < fresh.from ? persisted.from : fresh.from,
    to: persisted.to > fresh.to ? persisted.to : fresh.to,
  };
}

interface HistoryState {
  logs: WorkoutLog[];
  loadedRange: { from: string; to: string };
  /** The oldest `from` for which the server has actually returned data. */
  fetchedRangeFrom: string;
  /** True once the one-shot full hydration (listFull seed) has run. */
  fullHydrationDone: boolean;
  markFullHydrationDone: () => void;

  addLog: (log: WorkoutLog) => void;
  updateLog: (id: string, updates: Partial<Omit<WorkoutLog, 'id'>>) => void;
  deleteLog: (id: string) => void;
  getLastLogForTemplate: (templateId: string) => WorkoutLog | undefined;
  getLogsForDate: (date: Date) => WorkoutLog[];
  getDatesWithWorkouts: (year: number, month: number) => Set<string>;
  extendRange: (viewingMonth: Date) => void;
  markRangeFetched: () => void;
  hydrateFromServer: (serverLogs: Array<{
    clientId: string;
    templateId?: string;
    templateName: string;
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    exercises?: Array<{
      clientId: string;
      exerciseClientId: string;
      name: string;
      type: string;
      metrics?: string[];
      loadMode?: string;
      order: number;
      restTimeSeconds: number;
      sets: Array<{
        clientId: string;
        completed: boolean;
        type: string;
        reps?: number;
        weight?: number;
        time?: number;
        distance?: number;
        powerAvg?: number;
        heartRateAvg?: number;
        cadence?: number;
        calories?: number;
        rpe?: number;
        variant?: string;
        metric?: string;
        paceSeconds?: number;
        speed?: number;
        incline?: number;
        distanceUnit?: string;
      }>;
    }>;
  }>) => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      logs: [],
      loadedRange: getDefaultRange(),
      fetchedRangeFrom: getDefaultRange().from,
      fullHydrationDone: false,

      extendRange: (viewingMonth: Date) => {
        const needed = startOfMonth(subMonths(viewingMonth, 4)).toISOString();
        const { loadedRange } = get();
        if (needed < loadedRange.from) {
          set({ loadedRange: { ...loadedRange, from: needed } });
        }
      },

      markRangeFetched: () => {
        set({ fetchedRangeFrom: get().loadedRange.from });
      },

      markFullHydrationDone: () => {
        set({ fullHydrationDone: true });
      },

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
            metrics: e.metrics,
            loadMode: e.loadMode,
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
              metrics: e.metrics,
              loadMode: e.loadMode,
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

      getLastLogForTemplate: (templateId) => {
        // Logs are sorted most-recent first
        return get().logs.find((log) => log.templateId === templateId);
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
        const { fetchedRangeFrom, loadedRange } = get();

        // Map a server payload into the local WorkoutLog shape. `exercises` is
        // absent on metadata-only (listMeta) payloads, present on full seeds.
        const toLocal = (sl: (typeof serverLogs)[number]): WorkoutLog => ({
          id: sl.clientId,
          templateId: sl.templateId,
          templateName: sl.templateName,
          exercises: (sl.exercises ?? []).map((e) => ({
            id: e.clientId,
            exerciseId: e.exerciseClientId,
            name: e.name,
            type: e.type as WorkoutLogExercise['type'],
            metrics: resolveExerciseMetricsLoose(e.type, e.metrics),
            loadMode: coerceLoadMode(e.loadMode),
            order: e.order,
            restTimeSeconds: e.restTimeSeconds,
            sets: e.sets.map((s) => ({
              id: s.clientId,
              completed: s.completed,
              type: s.type,
              ...(s.reps !== undefined && { reps: s.reps }),
              ...(s.weight !== undefined && { weight: s.weight }),
              ...(s.time !== undefined && { time: s.time }),
              ...(s.distance !== undefined && { distance: s.distance }),
              ...(s.powerAvg !== undefined && { powerAvg: s.powerAvg }),
              ...(s.heartRateAvg !== undefined && { heartRateAvg: s.heartRateAvg }),
              ...(s.cadence !== undefined && { cadence: s.cadence }),
              ...(s.calories !== undefined && { calories: s.calories }),
              ...(s.rpe !== undefined && { rpe: s.rpe }),
              ...(s.variant !== undefined && { variant: s.variant }),
              ...(s.metric !== undefined && { metric: s.metric }),
              ...(s.paceSeconds !== undefined && { paceSeconds: s.paceSeconds }),
              ...(s.speed !== undefined && { speed: s.speed }),
              ...(s.incline !== undefined && { incline: s.incline }),
              ...(s.distanceUnit !== undefined && { distanceUnit: s.distanceUnit }),
            })) as WorkoutSet[],
          })),
          startedAt: sl.startedAt,
          completedAt: sl.completedAt,
          durationSeconds: sl.durationSeconds,
        });

        // Queue-aware server-wins: keep local only while it has writes in
        // flight (or the queue isn't loaded yet); a metadata-only payload
        // must not replace a full local copy with content; otherwise the
        // server copy wins (so cross-device edits propagate). Local-only
        // logs: keep an unsynced create, otherwise drop it if the server
        // authoritatively covered its range (delete propagation); keep logs
        // outside the fetched range (just not fetched, not deleted).
        const merged = mergeQueueAware<WorkoutLog, (typeof serverLogs)[number]>({
          local: localLogs,
          server: serverLogs,
          localId: (l) => l.id,
          serverId: (sl) => sl.clientId,
          toLocal,
          pending: getPendingClientIds(),
          queueKnown: isQueueLoaded(),
          resolveConflict: (local, sl) =>
            !(sl.exercises && sl.exercises.length > 0) && local.exercises.length > 0
              ? local
              : toLocal(sl),
          dropLocalOnly: (l) =>
            l.completedAt >= fetchedRangeFrom && l.completedAt <= loadedRange.to,
        });

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
      version: 5,
      migrate: (persisted: any, version: number) => {
        if (version < 5) {
          // v4→v5: start persisting loadedRange; old data may lack it
          return {
            logs: persisted?.logs ?? [],
            loadedRange: getDefaultRange(),
          };
        }
        return persisted as any;
      },
      partialize: (state) => ({
        logs: state.logs,
        loadedRange: state.loadedRange,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Ensure the persisted range covers the current 5-month window
        const updated = ensureCurrentRange(state.loadedRange);
        // Persisted logs cover the persisted range, so mark it as fetched
        useHistoryStore.setState({ loadedRange: updated, fetchedRangeFrom: updated.from });
      },
    }
  )
);

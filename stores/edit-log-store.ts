import { create } from 'zustand';
import { normalizeIntervalSets } from '@/lib/defaults';
import { MAX_METRICS_PER_EXERCISE, resolveExerciseMetrics } from '@/lib/metrics';
import type { MetricId, WorkoutLog, WorkoutLogExercise, Exercise, WorkoutSet } from '@/lib/types';

interface EditLogState {
  editingLog: WorkoutLog | null;

  loadLog: (log: WorkoutLog) => void;
  clearLog: () => void;

  setTemplateName: (name: string) => void;
  setStartedAt: (iso: string) => void;
  setCompletedAt: (iso: string) => void;

  addExercise: (exercise: Exercise) => void;
  removeExercise: (exerciseId: string) => void;
  reorderExercises: (exercises: WorkoutLogExercise[]) => void;
  moveExercise: (exerciseId: string, direction: 'up' | 'down') => void;
  addExerciseMetric: (exerciseId: string, metricId: MetricId) => void;
  removeExerciseMetric: (exerciseId: string, metricId: MetricId) => void;

  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  updateAllSets: (exerciseId: string, updates: Partial<WorkoutSet>) => void;
  updateSetsFromIndex: (exerciseId: string, fromIndex: number, updates: Partial<WorkoutSet>) => void;
  toggleSetComplete: (exerciseId: string, setId: string) => void;
}

export const useEditLogStore = create<EditLogState>()((set) => ({
  editingLog: null,

  loadLog: (log) => {
    set({
      editingLog: {
        ...log,
        exercises: log.exercises.map((e) => ({
          ...e,
          // Collapse any legacy work/rest interval pairs into single sets so
          // the Focus logger renders them; a no-op for already-single data.
          sets: normalizeIntervalSets(e.sets.map((s) => ({ ...s }))),
        })),
      },
    });
  },

  clearLog: () => set({ editingLog: null }),

  setTemplateName: (name) =>
    set((state) => {
      if (!state.editingLog) return state;
      return { editingLog: { ...state.editingLog, templateName: name } };
    }),

  setStartedAt: (iso) =>
    set((state) => {
      if (!state.editingLog) return state;
      return { editingLog: { ...state.editingLog, startedAt: iso } };
    }),

  setCompletedAt: (iso) =>
    set((state) => {
      if (!state.editingLog) return state;
      return { editingLog: { ...state.editingLog, completedAt: iso } };
    }),

  addExercise: (exercise) =>
    set((state) => {
      if (!state.editingLog) return state;
      const logExercise: WorkoutLogExercise = {
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        type: exercise.type,
        metrics: exercise.metrics,
        loadMode: exercise.loadMode,
        order: state.editingLog.exercises.length,
        restTimeSeconds: exercise.restTimeSeconds,
        sets: exercise.sets,
      };
      return {
        editingLog: {
          ...state.editingLog,
          exercises: [...state.editingLog.exercises, logExercise],
        },
      };
    }),

  removeExercise: (exerciseId) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.filter((e) => e.id !== exerciseId),
        },
      };
    }),

  reorderExercises: (exercises) =>
    set((state) => {
      if (!state.editingLog) return state;
      return { editingLog: { ...state.editingLog, exercises } };
    }),

  // The three below mirror workout-store so the Focus logger can drive either
  // store. Keep them in step.
  moveExercise: (exerciseId, direction) =>
    set((state) => {
      if (!state.editingLog) return state;
      const list = [...state.editingLog.exercises];
      const i = list.findIndex((e) => e.id === exerciseId);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= list.length) return state;
      [list[i], list[j]] = [list[j], list[i]];
      return { editingLog: { ...state.editingLog, exercises: list } };
    }),

  addExerciseMetric: (exerciseId, metricId) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) => {
            if (e.id !== exerciseId) return e;
            const base = resolveExerciseMetrics(e.type, e.metrics);
            if (base.includes(metricId) || base.length >= MAX_METRICS_PER_EXERCISE) {
              return { ...e, metrics: base };
            }
            return { ...e, metrics: [...base, metricId] };
          }),
        },
      };
    }),

  removeExerciseMetric: (exerciseId, metricId) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) => {
            if (e.id !== exerciseId) return e;
            const base = resolveExerciseMetrics(e.type, e.metrics);
            if (base.length <= 1) return { ...e, metrics: base };
            return { ...e, metrics: base.filter((m) => m !== metricId) };
          }),
        },
      };
    }),

  addSet: (exerciseId, newSet) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) =>
            e.id === exerciseId ? { ...e, sets: [...e.sets, newSet] } : e
          ),
        },
      };
    }),

  removeSet: (exerciseId, setId) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) =>
            e.id === exerciseId
              ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
              : e
          ),
        },
      };
    }),

  updateSet: (exerciseId, setId, updates) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s) =>
                    s.id === setId ? ({ ...s, ...updates } as WorkoutSet) : s
                  ),
                }
              : e
          ),
        },
      };
    }),

  updateAllSets: (exerciseId, updates) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s) => ({ ...s, ...updates } as WorkoutSet)),
                }
              : e
          ),
        },
      };
    }),

  updateSetsFromIndex: (exerciseId, fromIndex, updates) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s, i) =>
                    i >= fromIndex ? ({ ...s, ...updates } as WorkoutSet) : s
                  ),
                }
              : e
          ),
        },
      };
    }),

  toggleSetComplete: (exerciseId, setId) =>
    set((state) => {
      if (!state.editingLog) return state;
      return {
        editingLog: {
          ...state.editingLog,
          exercises: state.editingLog.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s) =>
                    s.id === setId ? { ...s, completed: !s.completed } : s
                  ),
                }
              : e
          ),
        },
      };
    }),
}));

import { create } from 'zustand';
import type { WorkoutLog, Exercise, WorkoutSet } from '@/lib/types';

interface EditLogState {
  editingLog: WorkoutLog | null;

  loadLog: (log: WorkoutLog) => void;
  clearLog: () => void;

  setTemplateName: (name: string) => void;
  setStartedAt: (iso: string) => void;
  setCompletedAt: (iso: string) => void;

  addExercise: (exercise: Exercise) => void;
  removeExercise: (exerciseId: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;

  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
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
          sets: e.sets.map((s) => ({ ...s })),
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
      return {
        editingLog: {
          ...state.editingLog,
          exercises: [...state.editingLog.exercises, exercise],
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

import { create } from 'zustand';
import type { ActiveWorkout, Exercise, WorkoutSet } from '@/lib/types';
import { generateId } from '@/lib/id';

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;

  startWorkout: (templateName: string, exercises: Exercise[], templateId?: string) => void;
  startEmptyWorkout: () => void;
  endWorkout: () => ActiveWorkout | null;
  discardWorkout: () => void;

  // Exercise management
  addExercise: (exercise: Exercise) => void;
  removeExercise: (exerciseId: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;

  // Set management
  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  toggleSetComplete: (exerciseId: string, setId: string) => void;

  // Rest timer
  startRestTimer: (seconds: number) => void;
  tickRestTimer: () => void;
  stopRestTimer: () => void;
}

export const useWorkoutStore = create<WorkoutState>()((set, get) => ({
  activeWorkout: null,

  startWorkout: (templateName, exercises, templateId) => {
    const workout: ActiveWorkout = {
      id: generateId(),
      templateId,
      templateName,
      exercises: exercises.map((e) => ({
        ...e,
        id: generateId(),
        sets: e.sets.map((s) => ({ ...s, id: generateId(), completed: false })),
      })),
      startedAt: new Date().toISOString(),
      isRestTimerActive: false,
      restTimeRemaining: 0,
    };
    set({ activeWorkout: workout });
  },

  startEmptyWorkout: () => {
    const workout: ActiveWorkout = {
      id: generateId(),
      templateName: 'Empty Workout',
      exercises: [],
      startedAt: new Date().toISOString(),
      isRestTimerActive: false,
      restTimeRemaining: 0,
    };
    set({ activeWorkout: workout });
  },

  endWorkout: () => {
    const workout = get().activeWorkout;
    set({ activeWorkout: null });
    return workout;
  },

  discardWorkout: () => {
    set({ activeWorkout: null });
  },

  addExercise: (exercise) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: [...state.activeWorkout.exercises, exercise],
        },
      };
    }),

  removeExercise: (exerciseId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.filter((e) => e.id !== exerciseId),
        },
      };
    }),

  reorderExercises: (exercises) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: { ...state.activeWorkout, exercises },
      };
    }),

  addSet: (exerciseId, newSet) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId ? { ...e, sets: [...e.sets, newSet] } : e
          ),
        },
      };
    }),

  removeSet: (exerciseId, setId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId
              ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
              : e
          ),
        },
      };
    }),

  updateSet: (exerciseId, setId, updates) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
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
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
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

  startRestTimer: (seconds) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          isRestTimerActive: true,
          restTimeRemaining: seconds,
        },
      };
    }),

  tickRestTimer: () =>
    set((state) => {
      if (!state.activeWorkout || !state.activeWorkout.isRestTimerActive) return state;
      const remaining = state.activeWorkout.restTimeRemaining - 1;
      if (remaining <= 0) {
        return {
          activeWorkout: {
            ...state.activeWorkout,
            isRestTimerActive: false,
            restTimeRemaining: 0,
          },
        };
      }
      return {
        activeWorkout: {
          ...state.activeWorkout,
          restTimeRemaining: remaining,
        },
      };
    }),

  stopRestTimer: () =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          isRestTimerActive: false,
          restTimeRemaining: 0,
        },
      };
    }),
}));

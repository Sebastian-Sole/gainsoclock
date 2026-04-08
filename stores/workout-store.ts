import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import type { ActiveWorkout, Exercise, TemplateExercise, WorkoutLog, WorkoutSet } from '@/lib/types';
import { generateId } from '@/lib/id';
import { createDefaultSets } from '@/lib/defaults';

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;

  startWorkout: (templateName: string, exercises: TemplateExercise[], templateId?: string, planDayId?: string, previousLog?: WorkoutLog) => void;
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
  updateAllSets: (exerciseId: string, updates: Partial<WorkoutSet>) => void;
  updateSetsFromIndex: (exerciseId: string, fromIndex: number, updates: Partial<WorkoutSet>) => void;
  toggleSetComplete: (exerciseId: string, setId: string) => void;

  // Rest timer
  startRestTimer: (seconds: number) => void;
  tickRestTimer: () => void;
  stopRestTimer: () => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
  (set, get) => ({
  activeWorkout: null,

  startWorkout: (templateName, templateExercises, templateId, planDayId, previousLog) => {
    // Build a lookup of previous exercises by exerciseId for prefilling
    const prevByExerciseId = new Map(
      previousLog?.exercises.map((e) => [e.exerciseId, e]) ?? []
    );

    const exercises: Exercise[] = templateExercises.map((te) => {
      const prevExercise = prevByExerciseId.get(te.exerciseId);

      // If we have previous data, clone its sets (with new IDs, uncompleted)
      if (prevExercise && prevExercise.sets.length > 0) {
        const sets: WorkoutSet[] = prevExercise.sets.map((s) => ({
          ...s,
          id: generateId(),
          completed: false,
        }));
        return {
          id: generateId(),
          exerciseId: te.exerciseId,
          name: te.name,
          type: te.type,
          sets,
          restTimeSeconds: te.restTimeSeconds,
        };
      }

      // Fallback to template defaults
      return {
        id: generateId(),
        exerciseId: te.exerciseId,
        name: te.name,
        type: te.type,
        sets: createDefaultSets(te.type, te.defaultSetsCount, {
          suggestedReps: te.suggestedReps,
          suggestedWeight: te.suggestedWeight,
          suggestedTime: te.suggestedTime,
          suggestedDistance: te.suggestedDistance,
        }),
        restTimeSeconds: te.restTimeSeconds,
      };
    });

    const workout: ActiveWorkout = {
      id: generateId(),
      templateId,
      templateName,
      exercises,
      startedAt: new Date().toISOString(),
      isRestTimerActive: false,
      restTimeRemaining: 0,
      planDayId,
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

  updateAllSets: (exerciseId, updates) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
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
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
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
          restTimerEndsAt: Date.now() + seconds * 1000,
        },
      };
    }),

  tickRestTimer: () =>
    set((state) => {
      if (!state.activeWorkout || !state.activeWorkout.isRestTimerActive) return state;
      // Calculate remaining from real clock so it survives backgrounding
      const endsAt = state.activeWorkout.restTimerEndsAt ?? 0;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        return {
          activeWorkout: {
            ...state.activeWorkout,
            isRestTimerActive: false,
            restTimeRemaining: 0,
            restTimerEndsAt: undefined,
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
          restTimerEndsAt: undefined,
        },
      };
    }),
}),
    {
      name: 'workout-storage',
      storage: zustandStorage,
      partialize: (state) => ({ activeWorkout: state.activeWorkout }),
    }
  )
);

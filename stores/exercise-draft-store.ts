import { create } from 'zustand';
import type { Exercise, WorkoutSet } from '@/lib/types';

interface TemplateCreateState {
  exercises: Exercise[];
  addExercise: (exercise: Exercise) => void;
  removeExercise: (id: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;
  clearExercises: () => void;
  setExercises: (exercises: Exercise[]) => void;
  updateExerciseSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  addExerciseSet: (exerciseId: string, newSet: WorkoutSet) => void;
  removeExerciseSet: (exerciseId: string, setId: string) => void;
}

export const useTemplateCreateStore = create<TemplateCreateState>()((set) => ({
  exercises: [],
  addExercise: (exercise) =>
    set((state) => ({ exercises: [...state.exercises, exercise] })),
  removeExercise: (id) =>
    set((state) => ({ exercises: state.exercises.filter((e) => e.id !== id) })),
  reorderExercises: (exercises) => set({ exercises }),
  clearExercises: () => set({ exercises: [] }),
  setExercises: (exercises) => set({ exercises }),
  updateExerciseSet: (exerciseId, setId, updates) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? ({ ...s, ...updates } as WorkoutSet) : s
              ),
            }
          : e
      ),
    })),
  addExerciseSet: (exerciseId, newSet) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === exerciseId ? { ...e, sets: [...e.sets, newSet] } : e
      ),
    })),
  removeExerciseSet: (exerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
          : e
      ),
    })),
}));

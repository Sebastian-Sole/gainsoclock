import { create } from 'zustand';
import type { Exercise } from '@/lib/types';

interface TemplateCreateState {
  exercises: Exercise[];
  addExercise: (exercise: Exercise) => void;
  removeExercise: (id: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;
  clearExercises: () => void;
  setExercises: (exercises: Exercise[]) => void;
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
}));

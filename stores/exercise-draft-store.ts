import { create } from 'zustand';
import type { TemplateExercise } from '@/lib/types';

interface TemplateCreateState {
  exercises: TemplateExercise[];
  addExercise: (exercise: TemplateExercise) => void;
  removeExercise: (id: string) => void;
  reorderExercises: (exercises: TemplateExercise[]) => void;
  clearExercises: () => void;
  setExercises: (exercises: TemplateExercise[]) => void;
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

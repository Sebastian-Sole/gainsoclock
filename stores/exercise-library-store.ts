import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { ExerciseDefinition, ExerciseType } from '@/lib/types';

interface ExerciseLibraryState {
  exercises: ExerciseDefinition[];

  addExercise: (name: string, type: ExerciseType) => ExerciseDefinition;
  getOrCreate: (name: string, type: ExerciseType) => ExerciseDefinition;
  searchByName: (query: string) => ExerciseDefinition[];
  hydrateFromServer: (serverExercises: Array<{ clientId: string; name: string; type: ExerciseType; createdAt: string }>) => void;
}

export const useExerciseLibraryStore = create<ExerciseLibraryState>()(
  persist(
    (set, get) => ({
      exercises: [],

      addExercise: (name, type) => {
        const exercise: ExerciseDefinition = {
          id: generateId(),
          name,
          type,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ exercises: [...state.exercises, exercise] }));

        syncToConvex(api.exercises.create, {
          clientId: exercise.id,
          name: exercise.name,
          type: exercise.type,
          createdAt: exercise.createdAt,
        });

        return exercise;
      },

      getOrCreate: (name, type) => {
        const existing = get().exercises.find(
          (e) => e.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) return existing;
        return get().addExercise(name, type);
      },

      searchByName: (query) => {
        if (!query) return get().exercises;
        const lowerQuery = query.toLowerCase();
        return get().exercises.filter((e) =>
          e.name.toLowerCase().includes(lowerQuery)
        );
      },

      hydrateFromServer: (serverExercises) => {
        const mapped: ExerciseDefinition[] = serverExercises.map((e) => ({
          id: e.clientId,
          name: e.name,
          type: e.type,
          createdAt: e.createdAt,
        }));
        set({ exercises: mapped });
      },
    }),
    {
      name: 'exercise-library-storage',
      storage: zustandStorage,
    }
  )
);

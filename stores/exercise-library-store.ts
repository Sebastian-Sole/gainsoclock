import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { ExerciseDefinition, ExerciseType, MetricId } from '@/lib/types';
import { resolveExerciseMetricsLoose } from '@/lib/metrics';

interface ExerciseLibraryState {
  exercises: ExerciseDefinition[];

  addExercise: (name: string, type: ExerciseType, metrics: MetricId[]) => ExerciseDefinition;
  getOrCreate: (name: string, type: ExerciseType, metrics: MetricId[]) => ExerciseDefinition;
  searchByName: (query: string) => ExerciseDefinition[];
  hydrateFromServer: (serverExercises: Array<{ clientId: string; name: string; type: ExerciseType; metrics?: string[]; createdAt: string }>) => void;
}

export const useExerciseLibraryStore = create<ExerciseLibraryState>()(
  persist(
    (set, get) => ({
      exercises: [],

      addExercise: (name, type, metrics) => {
        const exercise: ExerciseDefinition = {
          id: generateId(),
          name,
          type,
          metrics,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ exercises: [...state.exercises, exercise] }));

        syncToConvex(api.exercises.create, {
          clientId: exercise.id,
          name: exercise.name,
          type: exercise.type,
          metrics: exercise.metrics,
          createdAt: exercise.createdAt,
        });

        return exercise;
      },

      getOrCreate: (name, type, metrics) => {
        const existing = get().exercises.find(
          (e) => e.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) return existing;
        return get().addExercise(name, type, metrics);
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
          metrics: resolveExerciseMetricsLoose(e.type, e.metrics),
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

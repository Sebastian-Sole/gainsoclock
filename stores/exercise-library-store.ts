import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex, getPendingClientIds, isQueueLoaded } from '@/lib/convex-sync';
import { mergeQueueAware } from '@/lib/hydration-merge';
import { api } from '@/convex/_generated/api';
import type { ExerciseDefinition, ExerciseType, MetricId } from '@/lib/types';
import { resolveExerciseMetricsLoose } from '@/lib/metrics';

interface ExerciseLibraryState {
  exercises: ExerciseDefinition[];

  addExercise: (name: string, type: ExerciseType, metrics: MetricId[]) => ExerciseDefinition;
  getOrCreate: (name: string, type: ExerciseType, metrics: MetricId[]) => ExerciseDefinition;
  /** Soft-delete: hide from pickers/library default view, keep references working. */
  archiveExercise: (id: string) => void;
  unarchiveExercise: (id: string) => void;
  searchByName: (query: string) => ExerciseDefinition[];
  hydrateFromServer: (serverExercises: Array<{ clientId: string; name: string; type: ExerciseType; metrics?: string[]; createdAt: string; archivedAt?: number }>) => void;
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
        if (existing) {
          // Re-creating an archived exercise by name restores it instead of
          // spawning a duplicate the archived twin would shadow.
          if (existing.archivedAt !== undefined) {
            get().unarchiveExercise(existing.id);
            return { ...existing, archivedAt: undefined };
          }
          return existing;
        }
        return get().addExercise(name, type, metrics);
      },

      archiveExercise: (id) => {
        const archivedAt = Date.now();
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id === id ? { ...e, archivedAt } : e
          ),
        }));
        syncToConvex(api.exercises.archive, { clientId: id, archivedAt });
      },

      unarchiveExercise: (id) => {
        set((state) => ({
          exercises: state.exercises.map((e) =>
            e.id === id ? { ...e, archivedAt: undefined } : e
          ),
        }));
        syncToConvex(api.exercises.unarchive, { clientId: id });
      },

      searchByName: (query) => {
        const active = get().exercises.filter((e) => e.archivedAt === undefined);
        if (!query) return active;
        const lowerQuery = query.toLowerCase();
        return active.filter((e) =>
          e.name.toLowerCase().includes(lowerQuery)
        );
      },

      hydrateFromServer: (serverExercises) => {
        // Queue-aware server-wins merge: a local copy wins only while its
        // write (create / archive / unarchive) is still queued or in flight,
        // so an offline archive isn't reverted by a hydration that races the
        // flush. Local-only entries with no pending write follow the previous
        // wholesale-replace behavior and are dropped.
        const merged = mergeQueueAware<ExerciseDefinition, (typeof serverExercises)[number]>({
          local: get().exercises,
          server: serverExercises,
          localId: (e) => e.id,
          serverId: (s) => s.clientId,
          toLocal: (s) => ({
            id: s.clientId,
            name: s.name,
            type: s.type,
            metrics: resolveExerciseMetricsLoose(s.type, s.metrics),
            createdAt: s.createdAt,
            ...(s.archivedAt !== undefined ? { archivedAt: s.archivedAt } : {}),
          }),
          pending: getPendingClientIds(),
          queueKnown: isQueueLoaded(),
          dropLocalOnly: () => true,
        });
        set({ exercises: merged });
      },
    }),
    {
      name: 'exercise-library-storage',
      storage: zustandStorage,
    }
  )
);

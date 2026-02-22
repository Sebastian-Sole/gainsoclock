import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { WorkoutTemplate, TemplateExercise } from '@/lib/types';

interface TemplateState {
  templates: WorkoutTemplate[];

  addTemplate: (name: string, exercises: TemplateExercise[]) => WorkoutTemplate;
  updateTemplate: (id: string, updates: Partial<Pick<WorkoutTemplate, 'name' | 'notes' | 'exercises'>>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => WorkoutTemplate | null;
  getTemplate: (id: string) => WorkoutTemplate | undefined;
  hydrateFromServer: (serverTemplates: Array<{
    clientId: string;
    name: string;
    notes?: string;
    exercises: Array<{
      id: string;
      exerciseId: string;
      name: string;
      type: string;
      order: number;
      restTimeSeconds: number;
      defaultSetsCount: number;
      suggestedReps?: number;
      suggestedWeight?: number;
      suggestedTime?: number;
      suggestedDistance?: number;
    }>;
    createdAt: string;
    updatedAt: string;
  }>) => void;
}

function toSyncExercises(exercises: TemplateExercise[]) {
  return exercises.map((e) => ({
    clientId: e.id,
    exerciseClientId: e.exerciseId,
    exerciseName: e.name,
    exerciseType: e.type,
    order: e.order,
    restTimeSeconds: e.restTimeSeconds,
    defaultSetsCount: e.defaultSetsCount,
    suggestedReps: e.suggestedReps,
    suggestedWeight: e.suggestedWeight,
    suggestedTime: e.suggestedTime,
    suggestedDistance: e.suggestedDistance,
  }));
}

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: (name, exercises) => {
        const now = new Date().toISOString();
        const template: WorkoutTemplate = {
          id: generateId(),
          name,
          exercises,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ templates: [...state.templates, template] }));

        syncToConvex(api.templates.create, {
          clientId: template.id,
          name: template.name,
          notes: template.notes,
          exercises: toSyncExercises(template.exercises),
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        });

        return template;
      },

      updateTemplate: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? { ...t, ...updates, updatedAt: now }
              : t
          ),
        }));

        const syncArgs: Record<string, unknown> = { clientId: id, updatedAt: now };
        if (updates.name !== undefined) syncArgs.name = updates.name;
        if (updates.notes !== undefined) syncArgs.notes = updates.notes;
        if (updates.exercises !== undefined) {
          syncArgs.exercises = toSyncExercises(updates.exercises);
        }
        syncToConvex(api.templates.updateByClientId, syncArgs);
      },

      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }));

        syncToConvex(api.templates.remove, { clientId: id });
      },

      duplicateTemplate: (id) => {
        const original = get().templates.find((t) => t.id === id);
        if (!original) return null;
        const now = new Date().toISOString();
        const duplicate: WorkoutTemplate = {
          ...original,
          id: generateId(),
          name: `${original.name} (Copy)`,
          exercises: original.exercises.map((e) => ({
            ...e,
            id: generateId(),
          })),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ templates: [...state.templates, duplicate] }));

        syncToConvex(api.templates.create, {
          clientId: duplicate.id,
          name: duplicate.name,
          notes: duplicate.notes,
          exercises: toSyncExercises(duplicate.exercises),
          createdAt: duplicate.createdAt,
          updatedAt: duplicate.updatedAt,
        });

        return duplicate;
      },

      getTemplate: (id) => get().templates.find((t) => t.id === id),

      hydrateFromServer: (serverTemplates) => {
        const mapped: WorkoutTemplate[] = serverTemplates.map((t) => ({
          id: t.clientId,
          name: t.name,
          notes: t.notes,
          exercises: t.exercises.map((e) => ({
            id: e.id,
            exerciseId: e.exerciseId,
            name: e.name,
            type: e.type as TemplateExercise['type'],
            order: e.order,
            restTimeSeconds: e.restTimeSeconds,
            defaultSetsCount: e.defaultSetsCount,
            suggestedReps: e.suggestedReps,
            suggestedWeight: e.suggestedWeight,
            suggestedTime: e.suggestedTime,
            suggestedDistance: e.suggestedDistance,
          })),
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        set({ templates: mapped });
      },
    }),
    {
      name: 'template-storage',
      storage: zustandStorage,
      version: 2,
      migrate: () => {
        // Old format data is incompatible — start fresh (server will re-hydrate)
        return { templates: [] };
      },
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { WorkoutTemplate, Exercise } from '@/lib/types';

interface TemplateState {
  templates: WorkoutTemplate[];

  addTemplate: (name: string, exercises: Exercise[]) => WorkoutTemplate;
  updateTemplate: (id: string, updates: Partial<Pick<WorkoutTemplate, 'name' | 'exercises'>>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => WorkoutTemplate | null;
  getTemplate: (id: string) => WorkoutTemplate | undefined;
  hydrateFromServer: (serverTemplates: Array<{ clientId: string; name: string; exercises: Exercise[]; createdAt: string; updatedAt: string }>) => void;
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
          exercises: template.exercises,
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

        syncToConvex(api.templates.updateByClientId, {
          clientId: id,
          name: updates.name,
          exercises: updates.exercises,
          updatedAt: now,
        });
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
            sets: e.sets.map((s) => ({ ...s, id: generateId() })),
          })),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ templates: [...state.templates, duplicate] }));

        syncToConvex(api.templates.create, {
          clientId: duplicate.id,
          name: duplicate.name,
          exercises: duplicate.exercises,
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
          exercises: t.exercises,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        set({ templates: mapped });
      },
    }),
    {
      name: 'template-storage',
      storage: zustandStorage,
    }
  )
);

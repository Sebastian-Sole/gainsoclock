import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import type { WorkoutTemplate, Exercise } from '@/lib/types';

interface TemplateState {
  templates: WorkoutTemplate[];

  addTemplate: (name: string, exercises: Exercise[]) => WorkoutTemplate;
  updateTemplate: (id: string, updates: Partial<Pick<WorkoutTemplate, 'name' | 'exercises'>>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => WorkoutTemplate | null;
  getTemplate: (id: string) => WorkoutTemplate | undefined;
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
        return template;
      },

      updateTemplate: (id, updates) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? { ...t, ...updates, updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      deleteTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        })),

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
        return duplicate;
      },

      getTemplate: (id) => get().templates.find((t) => t.id === id),
    }),
    {
      name: 'template-storage',
      storage: zustandStorage,
    }
  )
);

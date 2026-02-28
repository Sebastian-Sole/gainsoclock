import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { Recipe, Ingredient, Macros } from '@/lib/types';

interface RecipeState {
  recipes: Recipe[];

  addRecipe: (data: {
    title: string;
    description: string;
    notes?: string;
    ingredients: Ingredient[];
    instructions: string[];
    prepTimeMinutes?: number;
    cookTimeMinutes?: number;
    servings?: number;
    macros?: Macros;
    tags?: string[];
  }) => Recipe;
  updateRecipe: (id: string, updates: Partial<Pick<Recipe, 'title' | 'description' | 'notes' | 'ingredients' | 'instructions' | 'prepTimeMinutes' | 'cookTimeMinutes' | 'servings' | 'macros' | 'tags'>>) => void;
  deleteRecipe: (id: string) => void;
  toggleSaveRecipe: (id: string) => void;
  getRecipe: (id: string) => Recipe | undefined;
  hydrateFromServer: (serverRecipes: Array<{
    clientId: string;
    title: string;
    description: string;
    notes?: string;
    ingredients: Ingredient[];
    instructions: string[];
    prepTimeMinutes?: number;
    cookTimeMinutes?: number;
    servings?: number;
    macros?: Macros;
    tags?: string[];
    sourceConversationClientId?: string;
    saved: boolean;
    createdAt: string;
    updatedAt?: string;
  }>) => void;
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set, get) => ({
      recipes: [],

      addRecipe: (data) => {
        const now = new Date().toISOString();
        const recipe: Recipe = {
          id: generateId(),
          ...data,
          saved: true,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ recipes: [recipe, ...state.recipes] }));

        syncToConvex(api.recipes.createUserRecipe, {
          clientId: recipe.id,
          title: recipe.title,
          description: recipe.description,
          notes: recipe.notes,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          servings: recipe.servings,
          macros: recipe.macros,
          tags: recipe.tags,
          createdAt: recipe.createdAt,
        });

        return recipe;
      },

      updateRecipe: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: now } : r
          ),
        }));

        const syncArgs: Record<string, unknown> = { clientId: id, updatedAt: now };
        for (const [key, val] of Object.entries(updates)) {
          if (val !== undefined) syncArgs[key] = val;
        }
        syncToConvex(api.recipes.updateRecipe, syncArgs);
      },

      deleteRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.filter((r) => r.id !== id),
        }));
        syncToConvex(api.recipes.deleteRecipe, { clientId: id });
      },

      toggleSaveRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id ? { ...r, saved: !r.saved } : r
          ),
        }));
        syncToConvex(api.recipes.toggleSaveRecipe, { clientId: id });
      },

      getRecipe: (id) => get().recipes.find((r) => r.id === id),

      hydrateFromServer: (serverRecipes) => {
        const mapped: Recipe[] = serverRecipes.map((r) => ({
          id: r.clientId,
          title: r.title,
          description: r.description,
          notes: r.notes,
          ingredients: r.ingredients,
          instructions: r.instructions,
          prepTimeMinutes: r.prepTimeMinutes,
          cookTimeMinutes: r.cookTimeMinutes,
          servings: r.servings,
          macros: r.macros,
          tags: r.tags,
          sourceConversationClientId: r.sourceConversationClientId,
          saved: r.saved,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
        set({ recipes: mapped });
      },
    }),
    {
      name: 'recipe-storage',
      storage: zustandStorage,
      version: 1,
      migrate: () => ({ recipes: [] }),
    }
  )
);

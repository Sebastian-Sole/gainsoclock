import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import { syncToConvex, getPendingClientIds, isQueueLoaded } from '@/lib/convex-sync';
import { mergeQueueAware } from '@/lib/hydration-merge';
import { api } from '@/convex/_generated/api';
import type { SavedIngredient, IngredientSource, Macros } from '@/lib/types';

interface IngredientState {
  ingredients: SavedIngredient[];

  addIngredient: (data: {
    name: string;
    per100g: Macros;
    servingSizeG?: number;
    barcode?: string;
    imageUrl?: string;
    source: IngredientSource;
  }) => SavedIngredient;
  deleteIngredient: (id: string) => void;
  hydrateFromServer: (items: Array<{
    clientId: string;
    name: string;
    per100g: Macros;
    servingSizeG?: number;
    barcode?: string;
    imageUrl?: string;
    source: IngredientSource;
    createdAt: string;
  }>) => void;
}

export const useIngredientStore = create<IngredientState>()(
  persist(
    (set, get) => ({
      ingredients: [],

      addIngredient: (data) => {
        // Re-saving a barcode that's already in the library updates the
        // existing entry in place (same dedupe rule the server upsert uses),
        // so re-scanning a product never creates duplicates.
        const existing = data.barcode
          ? get().ingredients.find((i) => i.barcode === data.barcode)
          : undefined;

        const ingredient: SavedIngredient = {
          id: existing?.id ?? generateId(),
          ...data,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };

        set((state) => ({
          ingredients: [
            ingredient,
            ...state.ingredients.filter((i) => i.id !== ingredient.id),
          ],
        }));

        syncToConvex(api.ingredients.upsert, {
          clientId: ingredient.id,
          name: ingredient.name,
          per100g: ingredient.per100g,
          servingSizeG: ingredient.servingSizeG,
          barcode: ingredient.barcode,
          imageUrl: ingredient.imageUrl,
          source: ingredient.source,
          createdAt: ingredient.createdAt,
        });

        return ingredient;
      },

      deleteIngredient: (id) => {
        set((state) => ({
          ingredients: state.ingredients.filter((i) => i.id !== id),
        }));
        syncToConvex(api.ingredients.deleteIngredient, { clientId: id });
      },

      hydrateFromServer: (items) => {
        // Queue-aware server-wins merge: keep local entries only while their
        // writes are in flight; local-only entries with no pending write were
        // deleted elsewhere, so drop them.
        const merged = mergeQueueAware<SavedIngredient, (typeof items)[number]>({
          local: get().ingredients,
          server: items,
          localId: (i) => i.id,
          serverId: (s) => s.clientId,
          toLocal: (s) => ({
            id: s.clientId,
            name: s.name,
            per100g: s.per100g,
            servingSizeG: s.servingSizeG,
            barcode: s.barcode,
            imageUrl: s.imageUrl,
            source: s.source,
            createdAt: s.createdAt,
          }),
          pending: getPendingClientIds(),
          queueKnown: isQueueLoaded(),
          dropLocalOnly: () => true,
        });

        merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        set({ ingredients: merged });
      },
    }),
    {
      name: 'ingredient-storage',
      storage: zustandStorage,
    }
  )
);

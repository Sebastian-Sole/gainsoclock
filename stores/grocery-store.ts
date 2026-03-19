import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { generateId } from '@/lib/id';
import type { Recipe } from '@/lib/types';

export interface GroceryItem {
  id: string;
  name: string;
  amount: string;
  unit?: string;
  recipeTitle: string;
  checked: boolean;
}

/** Parse fractional amount strings like "1", "1/2", "1 1/2", "3.5" */
function parseAmount(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // "1 1/2" → whole + fraction
  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1], 10) + parseInt(mixedMatch[2], 10) / parseInt(mixedMatch[3], 10);
  }

  // "1/2" → fraction
  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  }

  // plain number / decimal
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

function formatAmount(n: number): string {
  // Keep it simple: if it's a whole number, no decimals; otherwise up to 2
  if (Number.isInteger(n)) return String(n);
  return n % 1 === 0.5 || n % 1 === 0.25 || n % 1 === 0.75
    ? String(n)
    : String(Math.round(n * 100) / 100);
}

function mergeKey(name: string, unit?: string): string {
  return `${name.toLowerCase().trim()}::${(unit ?? '').toLowerCase().trim()}`;
}

interface GroceryState {
  items: GroceryItem[];
  addFromRecipe: (recipe: Recipe) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
}

export const useGroceryStore = create<GroceryState>()(
  persist(
    (set) => ({
      items: [],

      addFromRecipe: (recipe) => {
        set((state) => {
          const items = [...state.items];

          for (const ing of recipe.ingredients) {
            const key = mergeKey(ing.name, ing.unit);
            const existingIdx = items.findIndex(
              (item) => !item.checked && mergeKey(item.name, item.unit) === key
            );

            if (existingIdx !== -1) {
              const existing = items[existingIdx];
              const existingAmt = parseAmount(existing.amount);
              const newAmt = parseAmount(ing.amount);

              if (existingAmt !== null && newAmt !== null) {
                // Merge amounts and append recipe source
                const existingSources = existing.recipeTitle.split(', ');
                const sources = existingSources.includes(recipe.title)
                  ? existing.recipeTitle
                  : `${existing.recipeTitle}, ${recipe.title}`;
                items[existingIdx] = {
                  ...existing,
                  amount: formatAmount(existingAmt + newAmt),
                  recipeTitle: sources,
                };
              } else {
                // Can't parse amounts — add as separate item
                items.push({
                  id: generateId(),
                  name: ing.name,
                  amount: ing.amount,
                  unit: ing.unit,
                  recipeTitle: recipe.title,
                  checked: false,
                });
              }
            } else {
              items.push({
                id: generateId(),
                name: ing.name,
                amount: ing.amount,
                unit: ing.unit,
                recipeTitle: recipe.title,
                checked: false,
              });
            }
          }

          return { items };
        });
      },

      toggleItem: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        }));
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      clearChecked: () => {
        set((state) => ({
          items: state.items.filter((item) => !item.checked),
        }));
      },

      clearAll: () => {
        set({ items: [] });
      },
    }),
    {
      name: 'grocery-storage',
      storage: zustandStorage,
      version: 1,
      migrate: () => ({ items: [] }),
    }
  )
);

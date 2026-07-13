import { parseLocaleNumber } from './format';
import { scalePer100gMacros } from './ingredient-macros';
import type { Macros, SavedIngredient } from './types';

// Client-side shapes for the recipe-scan backend contract
// (convex/recipeVision.scanRecipe). Kept as local copies, same as the
// photo-meal sheet does for nutritionVision.

export interface ScannedIngredient {
  name: string;
  quantity: string;
  unit: string | null;
}

export interface ScannedRecipe {
  title: string;
  servings: number | null;
  ingredients: ScannedIngredient[];
  steps: string[];
  /** Only present when nutrition facts were printed in the source. */
  macros: Macros | null;
}

export type ScanErrorCode = 'pro_required' | 'not_recipe' | 'too_large' | 'failed';

export type ScanRecipeResult =
  | { status: 'ok'; recipe: ScannedRecipe }
  | { status: 'error'; code: ScanErrorCode };

/**
 * Normalize a scanned quantity for the recipe form's amount field:
 * numeric strings go through the shared locale parser ("1,5" → "1.5"),
 * freeform text ("a pinch", "1/2") passes through trimmed.
 */
export function normalizeQuantity(quantity: string): string {
  const trimmed = quantity.trim();
  const n = parseLocaleNumber(trimmed);
  if (n === null) return trimmed;
  return String(n);
}

/**
 * Grams represented by a scanned quantity + unit, or null when the unit
 * isn't a weight we can convert (cups, tbsp, freeform, missing).
 */
export function gramsFromScan(quantity: string, unit: string | null): number | null {
  if (!unit) return null;
  const n = parseLocaleNumber(quantity);
  if (n === null || n <= 0) return null;
  const u = unit.trim().toLowerCase();
  if (u === 'g' || u === 'gram' || u === 'grams') return n;
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return n * 1000;
  return null;
}

/** Case-insensitive exact name match against the saved ingredient library. */
export function matchSavedIngredient(
  name: string,
  library: SavedIngredient[]
): SavedIngredient | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return library.find((i) => i.name.trim().toLowerCase() === needle);
}

/**
 * Best-effort absolute macros for a scanned ingredient: requires a library
 * entry with the same name AND a gram-convertible quantity. Returns null
 * whenever either half is missing — callers leave macros editable.
 */
export function scannedIngredientMacros(
  ingredient: ScannedIngredient,
  library: SavedIngredient[]
): Macros | null {
  const saved = matchSavedIngredient(ingredient.name, library);
  if (!saved) return null;
  return scalePer100gMacros(
    saved.per100g,
    gramsFromScan(ingredient.quantity, ingredient.unit)
  );
}

import type { Macros } from './types';

/**
 * Scale per-100g macros to the absolute macros for `grams` of the food.
 *
 * This is the single bridge between the two macro conventions in the app:
 * barcode products / saved ingredients store macros per 100 g, while meal
 * logs and recipe ingredient rows store absolute macros for the amount used.
 *
 * Values are rounded to whole numbers (same behaviour the scan screen has
 * always had). Returns null when `grams` is not a positive finite number, so
 * callers can feed it the result of `parseLocaleNumber` directly.
 */
export function scalePer100gMacros(per100g: Macros, grams: number | null): Macros | null {
  if (grams === null || !Number.isFinite(grams) || grams <= 0) return null;
  const factor = grams / 100;
  return {
    calories: Math.round(per100g.calories * factor),
    protein: Math.round(per100g.protein * factor),
    carbs: Math.round(per100g.carbs * factor),
    fat: Math.round(per100g.fat * factor),
  };
}

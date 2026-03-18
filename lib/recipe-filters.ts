import type { Recipe } from '@/lib/types';
import type { RecipeFilters } from '@/components/nutrition/recipe-filter-modal';

export function applyRecipeFilters(recipes: Recipe[], filters: RecipeFilters): Recipe[] {
  return recipes.filter((r) => {
    // Saved filter
    if (filters.savedOnly && !r.saved) return false;

    // Source filter
    if (filters.source === 'ai' && !r.sourceConversationClientId) return false;
    if (filters.source === 'user' && r.sourceConversationClientId) return false;

    // Cook time filter (use cookTimeMinutes, fallback to prepTimeMinutes)
    if (filters.maxCookTime !== undefined) {
      const cookTime = r.cookTimeMinutes ?? r.prepTimeMinutes;
      if (cookTime === undefined || cookTime > filters.maxCookTime) return false;
    }

    // Calorie/macro filters (per-serving if servings exist)
    const macros = r.macros;
    if (macros) {
      const servings = r.servings || 1;
      const perServing = {
        calories: macros.calories / servings,
        protein: macros.protein / servings,
        carbs: macros.carbs / servings,
        fat: macros.fat / servings,
      };

      if (filters.maxCalories !== undefined && perServing.calories > filters.maxCalories) return false;
      if (filters.minProtein !== undefined && perServing.protein < filters.minProtein) return false;
      if (filters.maxCarbs !== undefined && perServing.carbs > filters.maxCarbs) return false;
      if (filters.maxFat !== undefined && perServing.fat > filters.maxFat) return false;
    } else {
      // If no macros data and user has macro filters, exclude
      if (
        filters.maxCalories !== undefined ||
        filters.minProtein !== undefined ||
        filters.maxCarbs !== undefined ||
        filters.maxFat !== undefined
      ) {
        return false;
      }
    }

    return true;
  });
}

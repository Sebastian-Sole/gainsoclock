import React, { useState, useMemo } from 'react';
import { View, FlatList, Pressable, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { Bookmark, Flame, Clock, UtensilsCrossed, Search, SlidersHorizontal } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Fab } from '@/components/shared/fab';
import { useRecipeStore } from '@/stores/recipe-store';
import { RecipeFilterModal, DEFAULT_FILTERS, hasActiveFilters } from './recipe-filter-modal';
import { applyRecipeFilters } from '@/lib/recipe-filters';
import type { RecipeFilters } from './recipe-filter-modal';
import type { Recipe } from '@/lib/types';

function RecipeListCard({ recipe }: { recipe: Recipe }) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const mutedColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      className="rounded-xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="flex-1 font-semibold">{recipe.title}</Text>
        {recipe.saved && (
          <Bookmark size={16} color={primaryColor} fill={primaryColor} />
        )}
      </View>
      {recipe.description ? (
        <Text className="text-sm text-muted-foreground mb-2" numberOfLines={2}>
          {recipe.description}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-4">
        {recipe.macros && (
          <>
            <View className="flex-row items-center gap-1">
              <Flame size={12} color={mutedColor} />
              <Text className="text-xs text-muted-foreground">
                {recipe.macros.calories} cal
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              {recipe.macros.protein}g protein
            </Text>
          </>
        )}
        {recipe.prepTimeMinutes ? (
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={mutedColor} />
            <Text className="text-xs text-muted-foreground">
              {recipe.prepTimeMinutes}min
            </Text>
          </View>
        ) : null}
        {recipe.servings ? (
          <Text className="text-xs text-muted-foreground">
            {recipe.servings} servings
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function RecipesTab() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const router = useRouter();
  const recipes = useRecipeStore((s) => s.recipes);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RecipeFilters>(DEFAULT_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const filteredRecipes = useMemo(() => {
    let result = recipes;

    // Text search by name
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      );
    }

    // Apply structured filters
    result = applyRecipeFilters(result, filters);

    return result;
  }, [recipes, search, filters]);

  const filtersActive = hasActiveFilters(filters);

  return (
    <View className="flex-1">
      {/* Search + Filter */}
      <View className="px-4 mb-3">
        <View className="flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Search size={18} color="#9ca3af" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes..."
            placeholderTextColor="#9ca3af"
            className="flex-1 py-3 text-foreground"
          />
          <Pressable onPress={() => setShowFilterModal(true)} className="p-1.5" hitSlop={8}>
            <SlidersHorizontal
              size={18}
              color={filtersActive ? primaryColor : '#9ca3af'}
            />
          </Pressable>
        </View>
      </View>

      {recipes.length === 0 && !search.trim() && !filtersActive ? (
        <View className="flex-1 items-center justify-center px-4">
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-12">
            <UtensilsCrossed size={32} color={primaryColor} />
            <Text className="mt-3 text-center font-semibold">No Recipes Yet</Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Create your first recipe or ask the AI coach for suggestions
            </Text>
          </View>
        </View>
      ) : filteredRecipes.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <UtensilsCrossed size={28} color={primaryColor} />
          <Text className="mt-3 text-center text-muted-foreground">
            No matching recipes
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-24 gap-3"
          renderItem={({ item }) => <RecipeListCard recipe={item} />}
        />
      )}

      <Fab onPress={() => router.push('/recipe/create')} />

      <RecipeFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filters={filters}
        onApply={setFilters}
      />
    </View>
  );
}

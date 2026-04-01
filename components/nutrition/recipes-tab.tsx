import React, { useState, useMemo } from 'react';
import { View, FlatList, Pressable, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pin, Flame, Clock, UtensilsCrossed, Search, SlidersHorizontal, ShoppingCart } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { Fab } from '@/components/shared/fab';
import { useRecipeStore } from '@/stores/recipe-store';
import { useGroceryStore } from '@/stores/grocery-store';
import { RecipeFilterModal, DEFAULT_FILTERS, hasActiveFilters } from './recipe-filter-modal';
import { GroceryListModal } from './grocery-list-modal';
import { SwipeableRecipeCard } from './swipeable-recipe-card';
import { applyRecipeFilters } from '@/lib/recipe-filters';
import type { RecipeFilters } from './recipe-filter-modal';
import type { Recipe } from '@/lib/types';

function RecipeListCard({ recipe }: { recipe: Recipe }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      className="rounded-xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="flex-1 font-semibold">{recipe.title}</Text>
        {recipe.saved && (
          <Icon as={Pin} size={16} className="text-primary fill-primary" />
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
              <Icon as={Flame} size={12} className="text-muted-foreground" />
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
            <Icon as={Clock} size={12} className="text-muted-foreground" />
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

  const groceryItemCount = useGroceryStore((s) => s.items.length);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RecipeFilters>(DEFAULT_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showGroceryModal, setShowGroceryModal] = useState(false);

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

    // Pinned first, then by date
    result = [...result].sort((a, b) => {
      if (a.saved !== b.saved) return a.saved ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [recipes, search, filters]);

  const filtersActive = hasActiveFilters(filters);

  return (
    <View className="flex-1">
      {/* Search + Filter */}
      <View className="px-4 mb-3">
        <View className="flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Icon as={Search} size={18} className="text-muted-foreground" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes..."
            placeholderTextColor="#9ca3af"
            className="flex-1 py-3 text-foreground"
          />
          <Pressable onPress={() => setShowGroceryModal(true)} className="p-1.5 relative" hitSlop={8}>
            <Icon as={ShoppingCart} size={18} className={groceryItemCount > 0 ? 'text-primary' : 'text-muted-foreground'} />
            {groceryItemCount > 0 && (
              <View
                className="absolute -top-1 -right-1 h-4 min-w-[16px] items-center justify-center rounded-full px-1"
                style={{ backgroundColor: primaryColor }}
              >
                <Text className="text-[10px] font-bold text-white">{groceryItemCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => setShowFilterModal(true)} className="p-1.5" hitSlop={8}>
            <Icon
              as={SlidersHorizontal}
              size={18}
              className={filtersActive ? 'text-primary' : 'text-muted-foreground'}
            />
          </Pressable>
        </View>
      </View>

      {recipes.length === 0 && !search.trim() && !filtersActive ? (
        <View className="flex-1 items-center justify-center px-4">
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-12">
            <Icon as={UtensilsCrossed} size={32} className="text-primary" />
            <Text className="mt-3 text-center font-semibold">No Recipes Yet</Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Create your first recipe or ask the AI coach for suggestions
            </Text>
          </View>
        </View>
      ) : filteredRecipes.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Icon as={UtensilsCrossed} size={28} className="text-primary" />
          <Text className="mt-3 text-center text-muted-foreground">
            No matching recipes
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-24 gap-3"
          renderItem={({ item }) => (
            <SwipeableRecipeCard recipe={item}>
              <RecipeListCard recipe={item} />
            </SwipeableRecipeCard>
          )}
        />
      )}

      <Fab onPress={() => router.push('/recipe/create')} />

      <RecipeFilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        filters={filters}
        onApply={setFilters}
      />

      <GroceryListModal
        visible={showGroceryModal}
        onClose={() => setShowGroceryModal(false)}
      />
    </View>
  );
}

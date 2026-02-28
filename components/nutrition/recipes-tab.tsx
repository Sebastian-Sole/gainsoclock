import React from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Bookmark, Flame, Clock, UtensilsCrossed } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Fab } from '@/components/shared/fab';
import { useRecipeStore } from '@/stores/recipe-store';
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

  return (
    <View className="flex-1">
      {recipes.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-12">
            <UtensilsCrossed size={32} color={primaryColor} />
            <Text className="mt-3 text-center font-semibold">No Recipes Yet</Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Create your first recipe or ask the AI coach for suggestions
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-24 gap-3"
          renderItem={({ item }) => <RecipeListCard recipe={item} />}
        />
      )}

      <Fab onPress={() => router.push('/recipe/create')} />
    </View>
  );
}

import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { BookmarkX, Bookmark, Clock, Flame } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

import { Colors } from '@/constants/theme';
import { RecipeCard } from './recipe-card';

const SAMPLE_RECIPES = [
  {
    title: 'High-Protein Chicken Bowl',
    description: 'Grilled chicken breast with brown rice, avocado, and roasted vegetables.',
    calories: 520,
    prepTime: '25 min',
    protein: 45,
  },
  {
    title: 'Overnight Protein Oats',
    description: 'Rolled oats with protein powder, chia seeds, and mixed berries.',
    calories: 380,
    prepTime: '5 min',
    protein: 32,
  },
  {
    title: 'Salmon & Sweet Potato',
    description: 'Baked salmon fillet with roasted sweet potato and steamed broccoli.',
    calories: 480,
    prepTime: '30 min',
    protein: 38,
  },
  {
    title: 'Greek Yogurt Parfait',
    description: 'Thick Greek yogurt layered with granola, honey, and fresh fruit.',
    calories: 320,
    prepTime: '5 min',
    protein: 28,
  },
];

export function MealsSection() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const mutedColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';
  const router = useRouter();

  const savedRecipes = useQuery(api.recipes.listSavedRecipes) ?? [];

  return (
    <View className="gap-6 px-4 pb-8">
      {/* Saved Recipes */}
      <View>
        <Text className="mb-3 text-sm font-medium text-muted-foreground">SAVED RECIPES</Text>
        {savedRecipes.length === 0 ? (
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-10">
            <BookmarkX size={28} color={primaryColor} />
            <Text className="mt-3 text-center text-muted-foreground">
              No saved recipes yet
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Ask the AI coach for recipe suggestions
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {savedRecipes.map((recipe) => (
              <Pressable
                key={recipe.clientId}
                onPress={() => router.push(`/recipe/${recipe.clientId}`)}
                className="rounded-xl border border-border bg-card p-4"
              >
                <View className="flex-row items-start justify-between mb-1">
                  <Text className="flex-1 font-semibold">{recipe.title}</Text>
                  <Bookmark size={16} color={primaryColor} fill={primaryColor} />
                </View>
                <Text className="text-sm text-muted-foreground mb-2" numberOfLines={2}>
                  {recipe.description}
                </Text>
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
                  {recipe.prepTimeMinutes && (
                    <View className="flex-row items-center gap-1">
                      <Clock size={12} color={mutedColor} />
                      <Text className="text-xs text-muted-foreground">
                        {recipe.prepTimeMinutes}min
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Discover */}
      <View>
        <Text className="mb-3 text-sm font-medium text-muted-foreground">DISCOVER</Text>
        <View className="gap-3">
          {SAMPLE_RECIPES.map((recipe) => (
            <RecipeCard key={recipe.title} {...recipe} />
          ))}
        </View>
      </View>
    </View>
  );
}

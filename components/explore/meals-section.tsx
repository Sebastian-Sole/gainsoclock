import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { BookmarkX } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

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

  return (
    <View className="gap-6 px-4 pb-8">
      {/* Saved Recipes */}
      <View>
        <Text className="mb-3 text-sm font-medium text-muted-foreground">SAVED RECIPES</Text>
        <View className="items-center rounded-xl border border-dashed border-border px-8 py-10">
          <BookmarkX size={28} color={primaryColor} />
          <Text className="mt-3 text-center text-muted-foreground">
            No saved recipes yet
          </Text>
          <Text className="mt-1 text-center text-sm text-muted-foreground">
            Discover recipes below and save your favorites
          </Text>
        </View>
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

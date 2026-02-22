import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Bookmark, Clock, Users } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Colors } from '@/constants/theme';
import { cn } from '@/lib/utils';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const recipe = useQuery(api.recipes.getRecipe, { clientId: id });
  const toggleSave = useMutation(api.recipes.toggleSaveRecipe);

  if (!recipe) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">Loading recipe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} className="p-1">
          <ChevronLeft
            size={24}
            color={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        </Pressable>
        <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
          {recipe.title}
        </Text>
        <Pressable
          onPress={() => toggleSave({ clientId: id })}
          className="p-2"
        >
          <Bookmark
            size={20}
            color={recipe.saved ? primaryColor : '#9ca3af'}
            fill={recipe.saved ? primaryColor : 'none'}
          />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-muted-foreground mb-3">
          {recipe.description}
        </Text>

        {/* Meta info */}
        <View className="flex-row gap-3 mb-4">
          {recipe.prepTimeMinutes && (
            <View className="flex-row items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
              <Clock size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {recipe.prepTimeMinutes}min prep
              </Text>
            </View>
          )}
          {recipe.cookTimeMinutes && (
            <View className="flex-row items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
              <Clock size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {recipe.cookTimeMinutes}min cook
              </Text>
            </View>
          )}
          {recipe.servings && (
            <View className="flex-row items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
              <Users size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {recipe.servings} servings
              </Text>
            </View>
          )}
        </View>

        {/* Macros */}
        {recipe.macros && (
          <View className="mb-4 rounded-xl border border-border bg-card p-4">
            <Text className="mb-2 text-sm font-semibold">Nutrition per serving</Text>
            <View className="flex-row justify-between">
              <View className="items-center">
                <Text className="text-lg font-bold">{recipe.macros.calories}</Text>
                <Text className="text-xs text-muted-foreground">calories</Text>
              </View>
              <View className="items-center">
                <Text className="text-lg font-bold" style={{ color: primaryColor }}>
                  {recipe.macros.protein}g
                </Text>
                <Text className="text-xs text-muted-foreground">protein</Text>
              </View>
              <View className="items-center">
                <Text className="text-lg font-bold">{recipe.macros.carbs}g</Text>
                <Text className="text-xs text-muted-foreground">carbs</Text>
              </View>
              <View className="items-center">
                <Text className="text-lg font-bold">{recipe.macros.fat}g</Text>
                <Text className="text-xs text-muted-foreground">fat</Text>
              </View>
            </View>
          </View>
        )}

        {/* Ingredients */}
        <View className="mb-4">
          <Text className="mb-2 text-base font-semibold">Ingredients</Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} className="flex-row items-start gap-2 py-1.5">
              <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              <Text className="text-sm flex-1">
                <Text className="font-medium">
                  {ing.amount}{ing.unit ? ` ${ing.unit}` : ''}
                </Text>
                {' '}{ing.name}
              </Text>
            </View>
          ))}
        </View>

        {/* Instructions */}
        <View className="mb-8">
          <Text className="mb-2 text-base font-semibold">Instructions</Text>
          {recipe.instructions.map((step, i) => (
            <View key={i} className="flex-row gap-3 mb-3">
              <View
                className="h-6 w-6 items-center justify-center rounded-full"
                style={{ backgroundColor: primaryColor }}
              >
                <Text className="text-xs font-bold text-white">{i + 1}</Text>
              </View>
              <Text className="text-sm flex-1 leading-5 pt-0.5">{step}</Text>
            </View>
          ))}
        </View>

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <View className="mb-8 flex-row flex-wrap gap-2">
            {recipe.tags.map((tag, i) => (
              <View
                key={i}
                className="rounded-full bg-muted px-3 py-1"
              >
                <Text className="text-xs text-muted-foreground">{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

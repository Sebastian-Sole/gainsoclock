import React from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Bookmark, Clock, Users, Pencil, Trash2, Sparkles } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';
import { useRecipeStore } from '@/stores/recipe-store';
import { lightHaptic } from '@/lib/haptics';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const mutedColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';

  const recipe = useRecipeStore((s) => s.getRecipe(id));
  const toggleSave = useRecipeStore((s) => s.toggleSaveRecipe);
  const deleteRecipe = useRecipeStore((s) => s.deleteRecipe);

  const handleDelete = () => {
    Alert.alert('Delete Recipe', 'Are you sure you want to delete this recipe?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteRecipe(id);
          lightHaptic();
          router.back();
        },
      },
    ]);
  };

  if (!recipe) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">Recipe not found</Text>
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
          onPress={() => router.push(`/recipe/create?recipeId=${id}`)}
          className="p-2"
        >
          <Pencil size={18} color={mutedColor} />
        </Pressable>
        <Pressable
          onPress={() => {
            toggleSave(id);
            lightHaptic();
          }}
          className="p-2"
        >
          <Bookmark
            size={20}
            color={recipe.saved ? primaryColor : '#9ca3af'}
            fill={recipe.saved ? primaryColor : 'none'}
          />
        </Pressable>
        <Pressable onPress={handleDelete} className="p-2">
          <Trash2 size={18} color="#ef4444" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-muted-foreground mb-3">
          {recipe.description}
        </Text>

        {/* Notes */}
        {recipe.notes ? (
          <View className="mb-3 rounded-xl bg-accent/50 px-4 py-3">
            <Text className="text-xs font-medium text-muted-foreground mb-1">NOTES</Text>
            <Text className="text-sm text-foreground">{recipe.notes}</Text>
          </View>
        ) : null}

        {/* Meta info */}
        <View className="flex-row gap-3 mb-4 flex-wrap">
          {recipe.prepTimeMinutes ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
              <Clock size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {recipe.prepTimeMinutes}min prep
              </Text>
            </View>
          ) : null}
          {recipe.cookTimeMinutes ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
              <Clock size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {recipe.cookTimeMinutes}min cook
              </Text>
            </View>
          ) : null}
          {recipe.servings ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
              <Users size={12} color="#9ca3af" />
              <Text className="text-xs text-muted-foreground">
                {recipe.servings} servings
              </Text>
            </View>
          ) : null}
        </View>

        {/* Macros */}
        {recipe.macros && (
          <View className="mb-4 rounded-xl border border-border bg-card p-4">
            <Text className="mb-2 text-sm font-semibold">
              Nutrition {recipe.servings ? 'per serving' : 'total'}
            </Text>
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

        {/* AI Macro Generation - TODO: Gate behind premium */}
        {!recipe.macros && (
          <Pressable
            onPress={() => {
              // TODO: Implement AI macro generation when premium subscription is integrated
              Alert.alert('Coming Soon', 'AI-powered macro calculation will be available with a premium subscription.');
            }}
            className="mb-4 flex-row items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-3"
          >
            <Sparkles size={18} color={primaryColor} />
            <Text className="font-medium text-primary">Generate Macros with AI</Text>
          </Pressable>
        )}

        {/* Ingredients */}
        <View className="mb-4">
          <Text className="mb-2 text-base font-semibold">Ingredients</Text>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} className="py-1.5">
              <View className="flex-row items-start gap-2">
                <View className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                <Text className="text-sm flex-1">
                  <Text className="font-medium">
                    {ing.amount}{ing.unit ? ` ${ing.unit}` : ''}
                  </Text>
                  {' '}{ing.name}
                </Text>
              </View>
              {ing.macros && (
                <View className="ml-3.5 mt-1 flex-row gap-3">
                  <Text className="text-[11px] text-muted-foreground">
                    {ing.macros.calories} cal
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {ing.macros.protein}g P
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {ing.macros.carbs}g C
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {ing.macros.fat}g F
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Instructions */}
        {recipe.instructions.length > 0 && (
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
        )}

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

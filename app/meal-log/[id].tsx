import React from 'react';
import { ActivityIndicator, View, ScrollView, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, BookOpen, Trash2 } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { format } from 'date-fns';

import { Icon } from '@/components/ui/icon';
import { api } from '@/convex/_generated/api';
import { useMealLogStore } from '@/stores/meal-log-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { lightHaptic } from '@/lib/haptics';
import type { MealLog } from '@/lib/types';

/**
 * Logged-meal detail — the "what I ate that day" view.
 *
 * Distinct from the recipe-library detail screen (`app/recipe/[id].tsx`):
 * it renders the `mealLogs` row's snapshot (title, portion, macros, notes
 * as logged that day), and its delete removes only that day's log entry
 * via the meal-log store (which routes through the offline sync queue to
 * `mealLogs.deleteMealLog`) — never the underlying recipe.
 */
export default function MealLogDetailScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const router = useRouter();

  // Server row for the logged day (history days live only on the server).
  const dayMeals = useQuery(
    api.mealLogs.listByDate,
    date ? { date } : 'skip'
  );
  // Local copy covers today's meals that haven't flushed to Convex yet.
  const localMeal = useMealLogStore((s) =>
    s.todayMeals.find((m) => m.id === id)
  );
  const deleteMeal = useMealLogStore((s) => s.deleteMeal);

  const serverMeal = dayMeals?.find((m) => m.clientId === id);
  const meal: MealLog | undefined =
    localMeal ??
    (serverMeal
      ? {
          id: serverMeal.clientId,
          date: serverMeal.date,
          recipeClientId: serverMeal.recipeClientId,
          title: serverMeal.title,
          portionMultiplier: serverMeal.portionMultiplier,
          macros: serverMeal.macros,
          notes: serverMeal.notes,
          loggedAt: serverMeal.loggedAt,
        }
      : undefined);

  // Only offer the recipe link when the source recipe still exists.
  const recipe = useRecipeStore((s) =>
    meal?.recipeClientId ? s.getRecipe(meal.recipeClientId) : undefined
  );

  const handleDelete = () => {
    if (!meal) return;
    Alert.alert(
      'Remove Logged Meal',
      `Remove "${meal.title}" from this day's log? The recipe stays in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteMeal(meal.id);
            lightHaptic();
            router.back();
          },
        },
      ]
    );
  };

  if (!meal) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="p-1"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="meal-log-detail-back"
          >
            <Icon as={ChevronLeft} size={24} className="text-foreground" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          {dayMeals === undefined && date ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="text-muted-foreground">Logged meal not found</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const loggedDate = new Date(meal.loggedAt);
  const time = loggedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="meal-log-detail-back"
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
          {meal.title}
        </Text>
        <Pressable
          onPress={handleDelete}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Remove logged meal"
          accessibilityHint="Removes this meal from the day's log. The recipe is kept."
          testID="meal-log-detail-delete"
        >
          <Icon as={Trash2} size={18} className="text-destructive" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Text className="text-sm text-muted-foreground mb-3">
          Logged {format(loggedDate, 'EEEE, MMM d')} at {time}
          {meal.portionMultiplier !== 1
            ? ` · ${meal.portionMultiplier}x portion`
            : ''}
        </Text>

        {/* Macros as logged that day */}
        <View className="mb-4 rounded-xl border border-border bg-card p-4">
          <Text className="mb-2 text-sm font-semibold">Nutrition as logged</Text>
          <View className="flex-row justify-between">
            <View className="items-center">
              <Text className="text-lg font-bold">{meal.macros.calories}</Text>
              <Text className="text-xs text-muted-foreground">calories</Text>
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold text-primary">
                {meal.macros.protein}g
              </Text>
              <Text className="text-xs text-muted-foreground">protein</Text>
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold">{meal.macros.carbs}g</Text>
              <Text className="text-xs text-muted-foreground">carbs</Text>
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold">{meal.macros.fat}g</Text>
              <Text className="text-xs text-muted-foreground">fat</Text>
            </View>
          </View>
        </View>

        {/* Notes as logged */}
        {meal.notes ? (
          <View className="mb-4 rounded-xl bg-accent/50 px-4 py-3">
            <Text className="text-xs font-medium text-muted-foreground mb-1">
              NOTES
            </Text>
            <Text className="text-sm text-foreground">{meal.notes}</Text>
          </View>
        ) : null}

        {/* Link to the source recipe (library view, ingredients etc.) */}
        {meal.recipeClientId && recipe ? (
          <Pressable
            onPress={() => router.push(`/recipe/${meal.recipeClientId}`)}
            className="mb-8 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
            accessibilityRole="button"
            accessibilityLabel={`View recipe ${recipe.title}`}
            testID="meal-log-view-recipe"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Icon as={BookOpen} size={18} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="font-medium">View recipe</Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {recipe.title}
              </Text>
            </View>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

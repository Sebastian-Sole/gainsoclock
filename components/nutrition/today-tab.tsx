import React, { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Plus, UtensilsCrossed } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { format } from 'date-fns';

import { Colors } from '@/constants/theme';
import { MacroProgress } from './macro-progress';
import { MealLogCard } from './meal-log-card';
import { LogMealModal } from './log-meal-modal';
import { useMealLogStore } from '@/stores/meal-log-store';
import { useNutritionGoalsStore } from '@/stores/nutrition-goals-store';
import type { Macros } from '@/lib/types';

function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function TodayTab() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const [showLogModal, setShowLogModal] = useState(false);
  const today = getToday();

  const todayMeals = useMealLogStore((s) => s.todayMeals);
  const hydrateFromServer = useMealLogStore((s) => s.hydrateFromServer);
  const goals = useNutritionGoalsStore((s) => s.goals);

  // Fetch today's meals from server
  const serverMeals = useQuery(api.mealLogs.listByDate, { date: today });

  // Hydrate store from server when data arrives
  useEffect(() => {
    if (serverMeals === undefined) return;
    hydrateFromServer(serverMeals);
  }, [serverMeals]);

  // Calculate consumed macros
  const consumed = useMemo((): Macros => {
    return todayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.macros.calories,
        protein: acc.protein + meal.macros.protein,
        carbs: acc.carbs + meal.macros.carbs,
        fat: acc.fat + meal.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todayMeals]);

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-8"
      >
        {/* Macro Progress */}
        <View className="rounded-xl border border-border bg-card p-4 mb-4">
          <MacroProgress consumed={consumed} goals={goals} />
        </View>

        {/* Log Meal Button */}
        <Pressable
          onPress={() => setShowLogModal(true)}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3 mb-4"
        >
          <Plus size={18} color="white" />
          <Text className="font-semibold text-primary-foreground">Log Meal</Text>
        </Pressable>

        {/* Today's Meals */}
        <Text className="mb-3 text-sm font-medium text-muted-foreground">TODAY'S MEALS</Text>

        {todayMeals.length === 0 ? (
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-10">
            <UtensilsCrossed size={28} color={primaryColor} />
            <Text className="mt-3 text-center text-muted-foreground">
              No meals logged today
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Tap "Log Meal" to track your nutrition
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {todayMeals.map((meal) => (
              <MealLogCard key={meal.id} meal={meal} />
            ))}
          </View>
        )}
      </ScrollView>

      <LogMealModal
        visible={showLogModal}
        onClose={() => setShowLogModal(false)}
        date={today}
      />
    </View>
  );
}

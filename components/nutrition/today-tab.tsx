import React, { useState, useMemo, useEffect } from 'react';
import { View, ScrollView, Pressable, AppState } from 'react-native';
import { Text } from '@/components/ui/text';
import { Camera, Plus, ScanBarcode, UtensilsCrossed } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { api } from '@/convex/_generated/api';
import { format } from 'date-fns';

import { Icon } from '@/components/ui/icon';
import { AnalyticsConsentCard } from '@/components/home/analytics-consent-card';
import { MacroProgress } from './macro-progress';
import { MealLogCard } from './meal-log-card';
import { LogMealModal } from './log-meal-modal';
import { PhotoMealSheet } from './photo-meal-sheet';
import { EditGoalsModal } from './edit-goals-modal';
import { recomputeProteinNudge } from '@/lib/notifications';
import { useMealLogStore, getTodayProteinConsumed } from '@/stores/meal-log-store';
import { useNutritionGoalsStore } from '@/stores/nutrition-goals-store';
import type { Macros } from '@/lib/types';

function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function TodayTab() {
  const router = useRouter();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [today, setToday] = useState(getToday);

  // Recalculate today's date when the app comes to the foreground, and
  // recompute the evening protein nudge with current numbers (meal-log
  // changes themselves trigger recompute inside the meal-log store).
  useEffect(() => {
    void recomputeProteinNudge(getTodayProteinConsumed());
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const now = getToday();
        setToday((prev) => (prev !== now ? now : prev));
        void recomputeProteinNudge(getTodayProteinConsumed());
      }
    });
    return () => subscription.remove();
  }, []);

  const todayMeals = useMealLogStore((s) => s.todayMeals);
  const hydrateFromServer = useMealLogStore((s) => s.hydrateFromServer);
  const goals = useNutritionGoalsStore((s) => s.goals);

  // Fetch today's meals from server
  const serverMeals = useQuery(api.mealLogs.listByDate, { date: today });

  // Hydrate store from server when data arrives
  useEffect(() => {
    if (serverMeals === undefined) return;
    hydrateFromServer(serverMeals, today);
  }, [serverMeals, today]);

  // Calculate consumed macros — filter to the current date as a belt-and-braces
  // guard for the one render between a date flip and the hydration effect re-run.
  const consumed = useMemo((): Macros => {
    return todayMeals.filter((m) => m.date === today).reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.macros.calories,
        protein: acc.protein + meal.macros.protein,
        carbs: acc.carbs + meal.macros.carbs,
        fat: acc.fat + meal.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todayMeals, today]);

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-8"
      >
        {/* Analytics consent (one-time, self-gated) */}
        <AnalyticsConsentCard />

        {/* Macro Progress */}
        <View className="rounded-2xl border border-border bg-card p-4 mb-4">
          <MacroProgress consumed={consumed} goals={goals} onEditGoals={() => setShowGoalsModal(true)} />
        </View>

        {/* Log Meal Button */}
        <Pressable
          onPress={() => setShowLogModal(true)}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3 mb-3"
          accessibilityRole="button"
          accessibilityLabel="Log a meal"
          testID="nutrition-log-meal"
        >
          <Icon as={Plus} size={18} className="text-primary-foreground" />
          <Text className="font-semibold text-primary-foreground">Log Meal</Text>
        </Pressable>

        {/* Photo + Barcode entry points */}
        <View className="flex-row gap-3 mb-4">
          <Pressable
            onPress={() => setShowPhotoSheet(true)}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border py-3"
            accessibilityRole="button"
            accessibilityLabel="Log a meal from a photo"
            testID="nutrition-log-photo"
          >
            <Icon as={Camera} size={18} className="text-primary" />
            <Text className="font-medium text-foreground">Snap a Photo</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/scan')}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border py-3"
            accessibilityRole="button"
            accessibilityLabel="Log a meal by scanning a barcode"
            testID="nutrition-log-barcode"
          >
            <Icon as={ScanBarcode} size={18} className="text-primary" />
            <Text className="font-medium text-foreground">Scan Barcode</Text>
          </Pressable>
        </View>

        {/* Today's Meals */}
        <Text className="mb-3 text-sm font-medium text-muted-foreground">TODAY&apos;S MEALS</Text>

        {todayMeals.length === 0 ? (
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-10">
            <Icon as={UtensilsCrossed} size={28} className="text-primary" />
            <Text className="mt-3 text-center text-muted-foreground">
              No meals logged today
            </Text>
            <Text className="mt-1 text-center text-sm text-muted-foreground">
              Tap &quot;Log Meal&quot; to track your nutrition
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

      <PhotoMealSheet
        visible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        date={today}
      />

      <EditGoalsModal
        visible={showGoalsModal}
        onClose={() => setShowGoalsModal(false)}
      />
    </View>
  );
}

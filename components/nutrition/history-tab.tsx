import React, { useState, useMemo } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { UtensilsCrossed } from 'lucide-react-native';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Icon } from '@/components/ui/icon';
import { startOfMonth, endOfMonth, format, addMonths, subMonths } from 'date-fns';

import { Calendar } from '@/components/history/calendar';
import { MealLogCard } from './meal-log-card';
import type { Macros, MealLog } from '@/lib/types';

export function NutritionHistoryTab() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  // The calendar's swipe pages render the adjacent months too, so fetch one
  // month either side to keep their markers populated.
  const rangeFrom = format(startOfMonth(subMonths(currentMonth, 1)), 'yyyy-MM-dd');
  const rangeTo = format(endOfMonth(addMonths(currentMonth, 1)), 'yyyy-MM-dd');

  const monthLogs = useQuery(api.mealLogs.listDateRange, {
    from: rangeFrom,
    to: rangeTo,
  });

  // Fetch selected day's meals
  const dayMeals = useQuery(api.mealLogs.listByDate, { date: selectedDateStr });

  // Build set of dates that have meals
  const mealDates = useMemo(() => {
    const set = new Set<string>();
    if (monthLogs) {
      for (const log of monthLogs) {
        set.add(log.date);
      }
    }
    return set;
  }, [monthLogs]);

  // Calculate daily totals for selected date
  const dailyTotals = useMemo((): Macros => {
    if (!dayMeals) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    return dayMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.macros.calories,
        protein: acc.protein + meal.macros.protein,
        carbs: acc.carbs + meal.macros.carbs,
        fat: acc.fat + meal.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dayMeals]);

  const mappedDayMeals = useMemo((): MealLog[] => {
    if (!dayMeals) return [];
    return dayMeals.map((m) => ({
      id: m.clientId,
      date: m.date,
      recipeClientId: m.recipeClientId,
      title: m.title,
      portionMultiplier: m.portionMultiplier,
      macros: m.macros,
      notes: m.notes,
      loggedAt: m.loggedAt,
    }));
  }, [dayMeals]);

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <View className="px-4 pb-8">
        <Calendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          markedDates={mealDates}
          isLoading={monthLogs === undefined}
          onSelectDate={setSelectedDate}
          onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
          onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
        />

        {/* Selected Day Summary */}
        <View className="mt-4">
          <Text className="mb-3 text-sm font-medium text-muted-foreground">
            {format(selectedDate, 'EEEE, MMM d')}
          </Text>

          {dayMeals && dayMeals.length > 0 ? (
            <>
              {/* Daily Totals */}
              <View className="rounded-xl border border-border bg-card p-4 mb-3">
                <View className="flex-row justify-between">
                  <View className="items-center">
                    <Text className="text-lg font-bold">{dailyTotals.calories}</Text>
                    <Text className="text-xs text-muted-foreground">calories</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-lg font-bold" style={{ color: '#3b82f6' }}>
                      {dailyTotals.protein}g
                    </Text>
                    <Text className="text-xs text-muted-foreground">protein</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-lg font-bold" style={{ color: '#eab308' }}>
                      {dailyTotals.carbs}g
                    </Text>
                    <Text className="text-xs text-muted-foreground">carbs</Text>
                  </View>
                  <View className="items-center">
                    <Text className="text-lg font-bold" style={{ color: '#ef4444' }}>
                      {dailyTotals.fat}g
                    </Text>
                    <Text className="text-xs text-muted-foreground">fat</Text>
                  </View>
                </View>
              </View>

              {/* Meals */}
              <View className="gap-3">
                {mappedDayMeals.map((meal) => (
                  <MealLogCard key={meal.id} meal={meal} />
                ))}
              </View>
            </>
          ) : (
            <View className="items-center rounded-xl border border-dashed border-border px-8 py-8">
              <Icon as={UtensilsCrossed} size={24} className="text-primary" />
              <Text className="mt-2 text-sm text-center text-muted-foreground">
                No meals logged
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

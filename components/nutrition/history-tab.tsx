import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronLeft, ChevronRight, UtensilsCrossed } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  isSameMonth,
  format,
  addMonths,
  subMonths,
} from 'date-fns';

import { Colors } from '@/constants/theme';
import { MealLogCard } from './meal-log-card';
import type { Macros, MealLog } from '@/lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function NutritionHistoryTab() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const mutedColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  // Fetch all meal logs for the visible month
  const monthLogs = useQuery(api.mealLogs.listDateRange, {
    from: monthStart,
    to: monthEnd,
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

  // Build calendar grid
  const days = useMemo(() => {
    const ms = startOfMonth(currentMonth);
    const me = endOfMonth(currentMonth);
    const calStart = startOfWeek(ms);
    const calEnd = endOfWeek(me);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

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
        {/* Month Navigation */}
        <View className="flex-row items-center justify-between mb-3">
          <Pressable onPress={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2">
            <ChevronLeft size={20} color={mutedColor} />
          </Pressable>
          <Text className="text-base font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </Text>
          <Pressable onPress={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2">
            <ChevronRight size={20} color={mutedColor} />
          </Pressable>
        </View>

        {/* Weekday Headers */}
        <View className="flex-row mb-1">
          {WEEKDAYS.map((day) => (
            <View key={day} className="flex-1 items-center py-1">
              <Text className="text-xs text-muted-foreground">{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        {weeks.map((week, wi) => (
          <View key={wi} className="flex-row">
            {week.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const inMonth = isSameMonth(day, currentMonth);
              const selected = isSameDay(day, selectedDate);
              const today = isToday(day);
              const hasMeals = mealDates.has(dateStr);

              return (
                <Pressable
                  key={dateStr}
                  onPress={() => setSelectedDate(day)}
                  className="flex-1 items-center py-1.5"
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      selected ? '' : ''
                    }`}
                    style={selected ? { backgroundColor: primaryColor } : undefined}
                  >
                    <Text
                      className={`text-sm ${
                        selected
                          ? 'font-bold text-white'
                          : today
                            ? 'font-bold text-primary'
                            : inMonth
                              ? 'text-foreground'
                              : 'text-muted-foreground/30'
                      }`}
                    >
                      {format(day, 'd')}
                    </Text>
                  </View>
                  {hasMeals && !selected && (
                    <View className="mt-0.5 h-1 w-1 rounded-full bg-primary" />
                  )}
                  {!hasMeals && <View className="mt-0.5 h-1 w-1" />}
                </Pressable>
              );
            })}
          </View>
        ))}

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
              <UtensilsCrossed size={24} color={primaryColor} />
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

import React, { useState, useMemo } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { addMonths, subMonths, format } from 'date-fns';

import { Calendar } from '@/components/history/calendar';
import { WorkoutLogCard } from '@/components/history/workout-log-card';
import { useHistoryStore } from '@/stores/history-store';

export default function HistoryScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = isDark ? '#fb923c' : '#f97316';

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const getLogsForDate = useHistoryStore((s) => s.getLogsForDate);
  const getDatesWithWorkouts = useHistoryStore((s) => s.getDatesWithWorkouts);

  const workoutDates = useMemo(
    () => getDatesWithWorkouts(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth, getDatesWithWorkouts]
  );

  const logsForSelectedDate = useMemo(
    () => getLogsForDate(selectedDate),
    [selectedDate, getLogsForDate]
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">History</Text>
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Calendar */}
        <Calendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          workoutDates={workoutDates}
          onSelectDate={setSelectedDate}
          onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
          onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
        />

        {/* Selected date info */}
        <Text className="mb-3 mt-6 text-sm font-medium text-muted-foreground">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </Text>

        {/* Workout logs */}
        {logsForSelectedDate.length === 0 ? (
          <View className="items-center rounded-xl border border-dashed border-border py-12">
            <CalendarDays size={32} color={primaryColor} />
            <Text className="mt-3 text-muted-foreground">No workouts on this day</Text>
          </View>
        ) : (
          logsForSelectedDate.map((log) => (
            <WorkoutLogCard key={log.id} log={log} />
          ))
        )}

        {/* Spacer */}
        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}

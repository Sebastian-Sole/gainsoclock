import React, { useState, useMemo } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Plus } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { addMonths, subMonths, format } from 'date-fns';
import { useRouter } from 'expo-router';

import { Calendar } from '@/components/history/calendar';
import { WorkoutLogCard } from '@/components/history/workout-log-card';
import { Fab } from '@/components/shared/fab';
import { useHistoryStore } from '@/stores/history-store';

export default function HistoryScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = isDark ? '#fb923c' : '#f97316';
  const router = useRouter();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const logs = useHistoryStore((s) => s.logs);

  const workoutDates = useMemo(() => {
    const dates = new Set<string>();
    logs.forEach((log) => {
      const logDate = new Date(log.startedAt);
      if (
        logDate.getFullYear() === currentMonth.getFullYear() &&
        logDate.getMonth() === currentMonth.getMonth()
      ) {
        dates.add(format(logDate, 'yyyy-MM-dd'));
      }
    });
    return dates;
  }, [currentMonth, logs]);

  const logsForSelectedDate = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return logs.filter(
      (log) => format(new Date(log.startedAt), 'yyyy-MM-dd') === dateStr
    );
  }, [selectedDate, logs]);

  const handleAddWorkout = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDate.getTime() > today.getTime()) {
      Alert.alert('Future Date', 'You can only log workouts for today or past dates.');
      return;
    }
    router.push(`/workout/new?date=${selectedDate.toISOString()}`);
  };

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
            <Pressable
              onPress={handleAddWorkout}
              className="mt-4 flex-row items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5"
            >
              <Plus size={16} color={primaryColor} />
              <Text className="text-sm font-medium text-primary">Log a Workout</Text>
            </Pressable>
          </View>
        ) : (
          logsForSelectedDate.map((log) => (
            <WorkoutLogCard key={log.id} log={log} />
          ))
        )}

        {/* Spacer */}
        <View className="h-24" />
      </ScrollView>

      <Fab onPress={handleAddWorkout} />
    </SafeAreaView>
  );
}

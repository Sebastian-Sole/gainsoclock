import React, { useState, useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { CalendarDays } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { addMonths, subMonths, format } from 'date-fns';

import { Calendar } from '@/components/history/calendar';
import { WorkoutLogCard } from '@/components/history/workout-log-card';
import { useHistoryStore } from '@/stores/history-store';
import { Colors } from '@/constants/theme';

export function HistoryTab() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

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

  return (
    <>
      <Calendar
        currentMonth={currentMonth}
        selectedDate={selectedDate}
        workoutDates={workoutDates}
        onSelectDate={setSelectedDate}
        onPrevMonth={() => setCurrentMonth(subMonths(currentMonth, 1))}
        onNextMonth={() => setCurrentMonth(addMonths(currentMonth, 1))}
      />

      <Text className="mb-3 mt-6 text-sm font-medium text-muted-foreground">
        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
      </Text>

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
    </>
  );
}

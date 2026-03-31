import { Text } from '@/components/ui/text';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { CalendarDay } from './calendar-day';
import { CalendarHeader } from './calendar-header';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarProps {
  currentMonth: Date;
  selectedDate: Date;
  workoutDates: Set<string>;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function Calendar({
  currentMonth,
  selectedDate,
  workoutDates,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: CalendarProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return (
    <View className="rounded-xl bg-card p-3 pt-0">
      <CalendarHeader
        currentMonth={currentMonth}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
      />

      {/* Weekday headers */}
      <View className="flex-row">
        {WEEKDAYS.map((day) => (
          <View key={day} className="flex-1 items-center py-2">
            <Text className="text-xs font-medium text-muted-foreground">{day}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} className="flex-row">
          {week.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            if (!isSameMonth(day, currentMonth)) {
              return <View key={dateStr} className="h-10 flex-1" />;
            }
            return (
              <CalendarDay
                key={dateStr}
                day={day.getDate()}
                isToday={isToday(day)}
                isSelected={isSameDay(day, selectedDate)}
                hasWorkout={workoutDates.has(dateStr)}
                isCurrentMonth
                onPress={() => onSelectDate(day)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

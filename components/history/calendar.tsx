import { Text } from '@/components/ui/text';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CalendarDay } from './calendar-day';
import { CalendarHeader } from './calendar-header';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_WEEKS = 6;
const ROW_HEIGHT = 40;
const GRID_HEIGHT = MAX_WEEKS * ROW_HEIGHT;

interface CalendarProps {
  currentMonth: Date;
  selectedDate: Date;
  workoutDates: Set<string>;
  isLoading?: boolean;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

function getMonthDays(month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  return eachDayOfInterval({ start: calStart, end: calEnd });
}

function getWeeks(days: Date[]) {
  const result: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    result.push(days.slice(i, i + 7));
  }
  return result;
}

function CalendarSkeleton() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={{ height: GRID_HEIGHT }} className="absolute inset-0 z-10">
      {Array.from({ length: 5 }).map((_, row) => (
        <View key={row} className="flex-row" style={{ height: ROW_HEIGHT }}>
          {Array.from({ length: 7 }).map((_, col) => (
            <View key={col} className="flex-1 items-center justify-center">
              <Animated.View
                style={[{ width: 32, height: 32, borderRadius: 16 }, animStyle]}
                className="bg-muted"
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function Calendar({
  currentMonth,
  selectedDate,
  workoutDates,
  isLoading,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: CalendarProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const isResetting = useRef(false);

  const prevMonth = useMemo(() => subMonths(currentMonth, 1), [currentMonth]);
  const nextMonth = useMemo(() => addMonths(currentMonth, 1), [currentMonth]);

  const currentWeeks = useMemo(() => getWeeks(getMonthDays(currentMonth)), [currentMonth]);
  const prevWeeks = useMemo(() => getWeeks(getMonthDays(prevMonth)), [prevMonth]);
  const nextWeeks = useMemo(() => getWeeks(getMonthDays(nextMonth)), [nextMonth]);

  // After month changes, reset scroll to center page
  useEffect(() => {
    if (gridWidth > 0) {
      isResetting.current = true;
      scrollRef.current?.scrollTo({ x: gridWidth, animated: false });
      requestAnimationFrame(() => {
        isResetting.current = false;
      });
    }
  }, [currentMonth, gridWidth]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isResetting.current || gridWidth === 0) return;

      const page = Math.round(e.nativeEvent.contentOffset.x / gridWidth);
      if (page === 0) {
        onPrevMonth();
      } else if (page === 2) {
        onNextMonth();
      }
    },
    [gridWidth, onPrevMonth, onNextMonth]
  );

  const renderMonthGrid = (weeks: Date[][], month: Date, key: string) => (
    <View key={key} style={{ width: gridWidth, height: GRID_HEIGHT }}>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} className="flex-row">
          {week.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            if (!isSameMonth(day, month)) {
              return <View key={dateStr} className="h-10 flex-1" />;
            }
            return (
              <CalendarDay
                key={dateStr}
                day={day.getDate()}
                isToday={isToday(day)}
                isSelected={isSameDay(day, selectedDate)}
                hasWorkout={workoutDates.has(dateStr)}
                isCurrentMonth={true}
                onPress={() => onSelectDate(day)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

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

      {/* Swipeable day grid */}
      <View
        style={{ overflow: 'hidden', height: GRID_HEIGHT, position: 'relative' }}
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
      >
        {isLoading && <CalendarSkeleton />}
        {gridWidth > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onMomentumScrollEnd={handleMomentumEnd}
            scrollEventThrottle={16}
            contentOffset={{ x: gridWidth, y: 0 }}
          >
            {renderMonthGrid(prevWeeks, prevMonth, 'prev')}
            {renderMonthGrid(currentWeeks, currentMonth, 'current')}
            {renderMonthGrid(nextWeeks, nextMonth, 'next')}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

import React, { useMemo } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settings-store';
import { PlanDayCell } from './plan-day-cell';
import { getPlanDayDate } from '@/lib/plan-dates';
import { cn } from '@/lib/utils';

interface PlanDay {
  week: number;
  dayOfWeek: number;
  templateClientId?: string;
  label?: string;
  notes?: string;
  status: string;
  workoutLogClientId?: string;
}

interface PlanCalendarProps {
  durationWeeks: number;
  days: PlanDay[];
  startDate?: string;
  onDayPress: (week: number, dayOfWeek: number) => void;
  onDayLongPress?: (week: number, dayOfWeek: number) => void;
  onWeekPress?: (week: number) => void;
  swapSource?: { week: number; dayOfWeek: number } | null;
  swapMode?: boolean;
  deleteWeekMode?: boolean;
}

const DAY_LABELS_MONDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_ORDER_MONDAY = [1, 2, 3, 4, 5, 6, 0];

const DAY_LABELS_SUNDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_ORDER_SUNDAY = [0, 1, 2, 3, 4, 5, 6];

export function PlanCalendar({ durationWeeks, days, startDate, onDayPress, onDayLongPress, onWeekPress, swapSource, swapMode, deleteWeekMode }: PlanCalendarProps) {
  const weekStartDay = useSettingsStore((s) => s.weekStartDay);
  const isMondayStart = weekStartDay === 'monday';

  const dayLabels = isMondayStart ? DAY_LABELS_MONDAY : DAY_LABELS_SUNDAY;
  const dayOrder = isMondayStart ? DAY_ORDER_MONDAY : DAY_ORDER_SUNDAY;

  // Build lookup map
  const dayMap = useMemo(() => {
    const map = new Map<string, PlanDay>();
    for (const day of days) {
      map.set(`${day.week}-${day.dayOfWeek}`, day);
    }
    return map;
  }, [days]);

  const CELL_WIDTH = 76;
  const inSwapMode = swapMode || !!swapSource;

  return (
    <View className="rounded-xl border border-border overflow-hidden bg-card">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header */}
          <View className="flex-row bg-muted/50 py-2">
            <View className="w-10 items-center">
              <Text className="text-xs font-medium text-muted-foreground">Wk</Text>
            </View>
            {dayLabels.map((label, i) => (
              <View key={i} style={{ width: CELL_WIDTH }} className="items-center">
                <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
              </View>
            ))}
          </View>

          {/* Weeks */}
          {Array.from({ length: durationWeeks }, (_, weekIndex) => {
            const week = weekIndex + 1;
            return (
              <View key={week} className="flex-row border-t border-border py-1.5 px-1">
                <Pressable
                  className={cn(
                    'w-10 items-center justify-center rounded',
                    deleteWeekMode && 'bg-destructive/10'
                  )}
                  onPress={onWeekPress ? () => onWeekPress(week) : undefined}
                  disabled={!onWeekPress}
                >
                  <Text className={cn(
                    'text-xs',
                    deleteWeekMode ? 'text-destructive font-medium' : 'text-muted-foreground'
                  )}>{week}</Text>
                </Pressable>
                {dayOrder.map((dayOfWeek, colIndex) => {
                  const day = dayMap.get(`${week}-${dayOfWeek}`);
                  const date = startDate
                    ? getPlanDayDate(startDate, week, dayOfWeek, weekStartDay)
                    : undefined;
                  const isSource = swapSource?.week === week && swapSource?.dayOfWeek === dayOfWeek;
                  return (
                    <PlanDayCell
                      key={colIndex}
                      label={day?.label}
                      status={day?.status ?? 'rest'}
                      date={date}
                      cellWidth={CELL_WIDTH}
                      onPress={() => onDayPress(week, dayOfWeek)}
                      onLongPress={onDayLongPress ? () => onDayLongPress(week, dayOfWeek) : undefined}
                      isSwapSource={isSource}
                      isSwapTarget={inSwapMode && !isSource}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

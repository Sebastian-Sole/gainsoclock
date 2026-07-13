import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface CalendarDayProps {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  /** Day has entries — filled marker (workouts in history, meals in nutrition). */
  isMarked: boolean;
  /** Secondary dot marker (e.g. imported Apple Health workouts without a Fitbull log). */
  hasDot: boolean;
  isCurrentMonth: boolean;
  onPress: () => void;
}

export const CalendarDay = React.memo(function CalendarDay({ day, isToday, isSelected, isMarked, hasDot, isCurrentMonth, onPress }: CalendarDayProps) {
  return (
    <Pressable
      onPress={onPress}
      className="h-10 flex-1 items-center justify-center"
    >
      <View
        className={cn(
          'h-10 w-10 items-center justify-center rounded-full',
          isSelected && 'bg-primary',
          isMarked && !isSelected && 'bg-primary/25',
          isToday && !isSelected && !isMarked && 'bg-accent border-2 border-primary'
        )}
      >
        <Text
          className={cn(
            'text-sm',
            !isCurrentMonth && 'text-muted-foreground/40',
            isSelected && 'font-bold text-primary-foreground',
            isToday && !isSelected && 'font-bold text-primary',
            isMarked && !isSelected && !isToday && 'font-semibold text-primary'
          )}
        >
          {day}
        </Text>
        {hasDot && (
          <View
            className={cn(
              'absolute bottom-1 h-1 w-1 rounded-full',
              isSelected ? 'bg-primary-foreground' : 'bg-muted-foreground'
            )}
          />
        )}
      </View>
    </Pressable>
  );
}, (prev, next) =>
  prev.day === next.day &&
  prev.isToday === next.isToday &&
  prev.isSelected === next.isSelected &&
  prev.isMarked === next.isMarked &&
  prev.hasDot === next.hasDot &&
  prev.isCurrentMonth === next.isCurrentMonth
);

import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface CalendarDayProps {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  hasWorkout: boolean;
  isCurrentMonth: boolean;
  onPress: () => void;
}

export function CalendarDay({ day, isToday, isSelected, hasWorkout, isCurrentMonth, onPress }: CalendarDayProps) {
  return (
    <Pressable
      onPress={onPress}
      className="h-10 flex-1 items-center justify-center"
    >
      <View
        className={cn(
          'h-10 w-10 items-center justify-center rounded-full',
          isSelected && 'bg-primary',
          hasWorkout && !isSelected && 'bg-primary/25',
          isToday && !isSelected && !hasWorkout && 'bg-accent border-2 border-primary'
        )}
      >
        <Text
          className={cn(
            'text-sm',
            !isCurrentMonth && 'text-muted-foreground/40',
            isSelected && 'font-bold text-primary-foreground',
            isToday && !isSelected && 'font-bold text-primary',
            hasWorkout && !isSelected && !isToday && 'font-semibold text-primary'
          )}
        >
          {day}
        </Text>
      </View>
    </Pressable>
  );
}

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
      className={cn(
        'h-10 flex-1 items-center justify-center rounded-lg',
        isSelected && 'bg-primary',
        isToday && !isSelected && 'bg-accent'
      )}
    >
      <Text
        className={cn(
          'text-sm',
          !isCurrentMonth && 'text-muted-foreground/40',
          isSelected && 'font-bold text-primary-foreground',
          isToday && !isSelected && 'font-bold text-primary'
        )}
      >
        {day}
      </Text>
      {hasWorkout && !isSelected && (
        <View className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
      )}
      {hasWorkout && isSelected && (
        <View className="absolute bottom-1 h-1 w-1 rounded-full bg-primary-foreground" />
      )}
    </Pressable>
  );
}

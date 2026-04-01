import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format } from 'date-fns';

interface CalendarHeaderProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function CalendarHeader({ currentMonth, onPrevMonth, onNextMonth }: CalendarHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-2 py-3">
      <Pressable onPress={onPrevMonth} className="h-10 w-10 items-center justify-center">
        <Icon as={ChevronLeft} size={20} className="text-foreground" />
      </Pressable>
      <Text className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</Text>
      <Pressable onPress={onNextMonth} className="h-10 w-10 items-center justify-center">
        <Icon as={ChevronRight} size={20} className="text-foreground" />
      </Pressable>
    </View>
  );
}

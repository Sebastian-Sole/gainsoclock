import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { format } from 'date-fns';

interface CalendarHeaderProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function CalendarHeader({ currentMonth, onPrevMonth, onNextMonth }: CalendarHeaderProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#f2f2f2' : '#1c1008';

  return (
    <View className="flex-row items-center justify-between px-2 py-3">
      <Pressable onPress={onPrevMonth} className="h-10 w-10 items-center justify-center">
        <ChevronLeft size={20} color={iconColor} />
      </Pressable>
      <Text className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</Text>
      <Pressable onPress={onNextMonth} className="h-10 w-10 items-center justify-center">
        <ChevronRight size={20} color={iconColor} />
      </Pressable>
    </View>
  );
}

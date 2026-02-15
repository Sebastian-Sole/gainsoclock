import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Dumbbell, Timer, Clock, Route, Repeat } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import type { ExerciseType } from '@/lib/types';
import { EXERCISE_TYPE_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';

const ICON_MAP = {
  Dumbbell,
  Timer,
  Clock,
  Route,
  Repeat,
} as const;

interface ExerciseTypeSelectorProps {
  selected?: ExerciseType;
  onSelect: (type: ExerciseType) => void;
}

export function ExerciseTypeSelector({ selected, onSelect }: ExerciseTypeSelectorProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const types = Object.entries(EXERCISE_TYPE_CONFIG) as [ExerciseType, typeof EXERCISE_TYPE_CONFIG[ExerciseType]][];

  return (
    <View className="gap-3">
      {types.map(([type, config]) => {
        const isSelected = selected === type;
        const Icon = ICON_MAP[config.icon as keyof typeof ICON_MAP];

        return (
          <Pressable
            key={type}
            onPress={() => onSelect(type)}
            className={cn(
              'flex-row items-center gap-4 rounded-xl border-2 p-4',
              isSelected
                ? 'border-primary bg-accent'
                : 'border-border bg-card'
            )}
          >
            <View
              className={cn(
                'h-12 w-12 items-center justify-center rounded-lg',
                isSelected ? 'bg-primary' : 'bg-secondary'
              )}
            >
              <Icon
                size={24}
                color={isSelected ? 'white' : isDark ? '#f2f2f2' : '#1c1008'}
              />
            </View>
            <View className="flex-1">
              <Text className={cn('text-base font-semibold', isSelected && 'text-primary')}>
                {config.label}
              </Text>
              <Text className="text-sm text-muted-foreground">{config.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

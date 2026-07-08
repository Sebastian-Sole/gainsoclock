import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  Dumbbell,
  Repeat,
  Zap,
  Waves,
  Footprints,
  Bike,
  Clock,
  Activity,
  SlidersHorizontal,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { EXERCISE_PRESETS, type ExercisePreset } from '@/lib/metrics';
import { cn } from '@/lib/utils';

const ICON_MAP = {
  Dumbbell,
  Repeat,
  Zap,
  Waves,
  Footprints,
  Bike,
  Clock,
  Activity,
  SlidersHorizontal,
} as const;

interface ExercisePresetSelectorProps {
  selectedId?: string;
  onSelect: (preset: ExercisePreset) => void;
}

export function ExercisePresetSelector({ selectedId, onSelect }: ExercisePresetSelectorProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View className="gap-3">
      {EXERCISE_PRESETS.map((preset) => {
        const isSelected = selectedId === preset.id;
        const Icon = ICON_MAP[preset.icon as keyof typeof ICON_MAP] ?? Activity;

        return (
          <Pressable
            key={preset.id}
            onPress={() => onSelect(preset)}
            accessibilityRole="button"
            accessibilityLabel={preset.label}
            accessibilityState={{ selected: isSelected }}
            className={cn(
              'flex-row items-center gap-4 rounded-xl border-2 p-4',
              isSelected ? 'border-primary bg-accent' : 'border-border bg-card'
            )}
          >
            <View
              className={cn(
                'h-12 w-12 items-center justify-center rounded-lg',
                isSelected ? 'bg-primary' : 'bg-secondary'
              )}
            >
              <Icon size={24} color={isSelected ? 'white' : isDark ? '#f2f2f2' : '#1c1008'} />
            </View>
            <View className="flex-1">
              <Text className={cn('text-base font-semibold', isSelected && 'text-primary')}>
                {preset.label}
              </Text>
              <Text className="text-sm text-muted-foreground">{preset.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

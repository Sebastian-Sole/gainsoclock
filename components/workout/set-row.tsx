import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Check, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { SetInput } from './set-input';
import { TimeInput } from '@/components/shared/time-input';
import type { WorkoutSet } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SetRowProps {
  set: WorkoutSet;
  index: number;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  onToggleComplete: () => void;
  onRemove: () => void;
  editable?: boolean;
}

export function SetRow({ set, index, onUpdate, onToggleComplete, onRemove, editable = true }: SetRowProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleToggle = () => {
    scale.value = withSequence(
      withSpring(1.05, { duration: 150 }),
      withSpring(1, { duration: 150 })
    );
    onToggleComplete();
  };

  const renderInputs = () => {
    switch (set.type) {
      case 'reps_weight':
        return (
          <>
            <SetInput
              value={set.weight}
              onValueChange={(weight) => onUpdate({ weight } as Partial<WorkoutSet>)}
              placeholder="0"
            />
            <SetInput
              value={set.reps}
              onValueChange={(reps) => onUpdate({ reps } as Partial<WorkoutSet>)}
              placeholder="0"
            />
          </>
        );
      case 'reps_time':
        return (
          <>
            <TimeInput
              value={set.time}
              onValueChange={(time) => onUpdate({ time } as Partial<WorkoutSet>)}
            />
            <SetInput
              value={set.reps}
              onValueChange={(reps) => onUpdate({ reps } as Partial<WorkoutSet>)}
              placeholder="0"
            />
          </>
        );
      case 'time_only':
        return (
          <TimeInput
            value={set.time}
            onValueChange={(time) => onUpdate({ time } as Partial<WorkoutSet>)}
          />
        );
      case 'time_distance':
        return (
          <>
            <TimeInput
              value={set.time}
              onValueChange={(time) => onUpdate({ time } as Partial<WorkoutSet>)}
            />
            <SetInput
              value={set.distance}
              onValueChange={(distance) => onUpdate({ distance } as Partial<WorkoutSet>)}
              placeholder="0"
            />
          </>
        );
      case 'reps_only':
        return (
          <SetInput
            value={set.reps}
            onValueChange={(reps) => onUpdate({ reps } as Partial<WorkoutSet>)}
            placeholder="0"
          />
        );
    }
  };

  return (
    <Animated.View
      style={animatedStyle}
      className={cn(
        'flex-row items-center gap-2 rounded-lg px-3 py-2',
        set.completed && 'bg-primary/10'
      )}
    >
      <Text className="w-8 text-center text-sm text-muted-foreground">{index + 1}</Text>
      <View className="flex-1 flex-row items-center gap-2">
        {renderInputs()}
      </View>
      {editable && (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={handleToggle}
            className={cn(
              'h-8 w-8 items-center justify-center rounded-md',
              set.completed ? 'bg-primary' : 'border border-border'
            )}
          >
            <Check size={16} color={set.completed ? 'white' : isDark ? '#666' : '#999'} />
          </Pressable>
          <Pressable onPress={onRemove} className="h-8 w-8 items-center justify-center">
            <X size={14} color={isDark ? '#666' : '#999'} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

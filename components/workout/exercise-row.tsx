import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import type { Exercise } from '@/lib/types';
import { exerciseTypeLabel } from '@/lib/format';

interface ExerciseRowProps {
  exercise: Exercise;
  index: number;
}

export function ExerciseRow({ exercise, index }: ExerciseRowProps) {
  return (
    <View className="flex-row items-center gap-3 py-2">
      <Text className="w-6 text-center text-sm text-muted-foreground">{index + 1}</Text>
      <View className="flex-1">
        <Text className="font-medium">{exercise.name}</Text>
        <Text className="text-sm text-muted-foreground">
          {exercise.sets.length} sets
        </Text>
      </View>
      <Badge variant="secondary">
        <Text className="text-xs">{exerciseTypeLabel(exercise.type)}</Text>
      </Badge>
    </View>
  );
}

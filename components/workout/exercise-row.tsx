import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { TemplateExercise } from '@/lib/types';
import { exerciseTypeLabel } from '@/lib/format';

interface ExerciseRowProps {
  exercise: TemplateExercise;
  index: number;
}

/**
 * The metric label is a caption under the name, not a trailing pill: a
 * five-metric exercise ("Weight · Duration · Distance · Avg power · Avg heart
 * rate") is far too wide to sit beside the name, and a `rounded-full` Badge is
 * `shrink-0` so it would push the name out and run under the trash button that
 * the template screens render as a sibling. As a caption it simply wraps.
 */
export function ExerciseRow({ exercise, index }: ExerciseRowProps) {
  return (
    <View className="flex-row items-start gap-3 py-2">
      <Text className="w-6 pt-0.5 text-center text-sm text-muted-foreground">{index + 1}</Text>
      <View className="flex-1">
        <Text className="font-medium">{exercise.name}</Text>
        <Text className="text-sm text-muted-foreground">
          {exercise.defaultSetsCount} sets
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {exerciseTypeLabel(exercise.type, exercise.metrics)}
        </Text>
      </View>
    </View>
  );
}

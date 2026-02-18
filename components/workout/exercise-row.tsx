import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SetInput } from '@/components/workout/set-input';
import { TimeInput } from '@/components/shared/time-input';
import type { Exercise, WorkoutSet } from '@/lib/types';
import { exerciseTypeLabel } from '@/lib/format';

interface ExerciseRowProps {
  exercise: Exercise;
  index: number;
  expandable?: boolean;
  onUpdateSet?: (setId: string, updates: Partial<WorkoutSet>) => void;
  onAddSet?: () => void;
  onRemoveSet?: (setId: string) => void;
  onRemoveExercise?: () => void;
}

export function ExerciseRow({
  exercise,
  index,
  expandable,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: ExerciseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const chevronColor = isDark ? '#9ca3af' : '#6b7280';

  if (!expandable) {
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

  return (
    <View>
      {/* Tappable header */}
      <Pressable onPress={() => setExpanded(!expanded)} className="flex-row items-center gap-3 py-3">
        {expanded
          ? <ChevronDown size={16} color={chevronColor} />
          : <ChevronRight size={16} color={chevronColor} />
        }
        <View className="flex-1">
          <Text className="font-medium">{exercise.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}
          </Text>
        </View>
        <Badge variant="secondary">
          <Text className="text-xs">{exerciseTypeLabel(exercise.type)}</Text>
        </Badge>
        {onRemoveExercise && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onRemoveExercise();
            }}
            hitSlop={8}
            className="ml-1 h-8 w-8 items-center justify-center rounded-md"
          >
            <Trash2 size={15} color="#ef4444" />
          </Pressable>
        )}
      </Pressable>

      {/* Expanded set rows */}
      {expanded && (
        <Animated.View entering={FadeInDown.duration(200)} className="mb-3 gap-0">
          {/* Column headers */}
          <View className="mb-1 flex-row items-center px-2">
            <Text className="w-10 text-xs font-medium text-muted-foreground">SET</Text>
            <View className="flex-1 flex-row">
              {hasField(exercise.type, 'weight') && (
                <Text className="min-w-[64px] text-center text-xs font-medium text-muted-foreground">WEIGHT</Text>
              )}
              {hasField(exercise.type, 'reps') && (
                <Text className="min-w-[64px] text-center text-xs font-medium text-muted-foreground">REPS</Text>
              )}
              {hasField(exercise.type, 'time') && (
                <Text className="min-w-[72px] text-center text-xs font-medium text-muted-foreground">TIME</Text>
              )}
              {hasField(exercise.type, 'distance') && (
                <Text className="min-w-[64px] text-center text-xs font-medium text-muted-foreground">DIST</Text>
              )}
            </View>
            {onRemoveSet && <View className="w-7" />}
          </View>

          {/* Set rows */}
          {exercise.sets.map((set, setIndex) => (
            <SetEditRow
              key={set.id}
              set={set}
              setIndex={setIndex}
              onUpdate={(updates) => onUpdateSet?.(set.id, updates)}
              onRemove={onRemoveSet && exercise.sets.length > 1 ? () => onRemoveSet(set.id) : undefined}
            />
          ))}

          {/* Add set button */}
          {onAddSet && (
            <Pressable
              onPress={onAddSet}
              className="mt-2 flex-row items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2"
            >
              <Plus size={14} color={isDark ? '#fb923c' : '#f97316'} />
              <Text className="text-sm font-medium text-primary">Add Set</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function hasField(type: Exercise['type'], field: 'reps' | 'weight' | 'time' | 'distance'): boolean {
  const fields: Record<Exercise['type'], string[]> = {
    reps_weight: ['weight', 'reps'],
    reps_time: ['reps', 'time'],
    time_only: ['time'],
    time_distance: ['time', 'distance'],
    reps_only: ['reps'],
  };
  return fields[type].includes(field);
}

function SetEditRow({
  set,
  setIndex,
  onUpdate,
  onRemove,
}: {
  set: WorkoutSet;
  setIndex: number;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  onRemove?: () => void;
}) {
  return (
    <View className="flex-row items-center rounded-lg px-2 py-1.5">
      <Text className="w-10 text-center text-sm font-medium text-muted-foreground">{setIndex + 1}</Text>
      <View className="flex-1 flex-row">
        {set.type === 'reps_weight' && (
          <SetInput
            value={set.weight}
            onValueChange={(weight) => onUpdate({ weight })}
            placeholder="0"
            className="mx-1 min-w-[56px]"
          />
        )}
        {(set.type === 'reps_weight' || set.type === 'reps_time' || set.type === 'reps_only') && (
          <SetInput
            value={set.reps}
            onValueChange={(reps) => onUpdate({ reps })}
            placeholder="0"
            className="mx-1 min-w-[56px]"
          />
        )}
        {(set.type === 'reps_time' || set.type === 'time_only' || set.type === 'time_distance') && (
          <TimeInput
            value={set.time}
            onValueChange={(time) => onUpdate({ time })}
            className="mx-1"
          />
        )}
        {set.type === 'time_distance' && (
          <SetInput
            value={set.distance}
            onValueChange={(distance) => onUpdate({ distance })}
            placeholder="0"
            className="mx-1 min-w-[56px]"
          />
        )}
      </View>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={6} className="h-7 w-7 items-center justify-center">
          <X size={13} color="#9ca3af" />
        </Pressable>
      )}
    </View>
  );
}

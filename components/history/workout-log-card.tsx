import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import type { WorkoutLog } from '@/lib/types';
import { formatDuration, exerciseTypeLabel } from '@/lib/format';
import { format } from 'date-fns';

interface WorkoutLogCardProps {
  log: WorkoutLog;
}

export function WorkoutLogCard({ log }: WorkoutLogCardProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [expanded, setExpanded] = useState(false);

  const completedSets = log.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0
  );
  const totalSets = log.exercises.reduce((t, e) => t + e.sets.length, 0);

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      className="mb-3 rounded-xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold">{log.templateName}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {format(new Date(log.startedAt), 'h:mm a')}
          </Text>
        </View>
        <View className="items-end">
          <View className="flex-row items-center gap-1">
            <Clock size={14} color={isDark ? '#9BA1A6' : '#687076'} />
            <Text className="text-sm text-muted-foreground">
              {formatDuration(log.durationSeconds)}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {completedSets}/{totalSets} sets
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-center gap-1">
        <Text className="text-xs text-muted-foreground">
          {log.exercises.length} exercise{log.exercises.length !== 1 ? 's' : ''}
        </Text>
        {expanded ? (
          <ChevronUp size={14} color={isDark ? '#9BA1A6' : '#687076'} />
        ) : (
          <ChevronDown size={14} color={isDark ? '#9BA1A6' : '#687076'} />
        )}
      </View>

      {expanded && (
        <View className="mt-3 gap-2 border-t border-border pt-3">
          {log.exercises.map((exercise) => {
            const done = exercise.sets.filter((s) => s.completed).length;
            return (
              <View key={exercise.id} className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-medium">{exercise.name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {exerciseTypeLabel(exercise.type)}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  {done}/{exercise.sets.length} sets
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Pressable>
  );
}

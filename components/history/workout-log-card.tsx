import React, { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useMutation } from 'convex/react';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Clock, ChevronDown, ChevronUp, Pencil, Trash2, Unlink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { api } from '@/convex/_generated/api';
import type { WorkoutLog } from '@/lib/types';
import { formatDuration, exerciseTypeLabel } from '@/lib/format';
import { resolveHealthSourceName } from '@/lib/health-source';
import { format } from 'date-fns';
import { useHistoryStore } from '@/stores/history-store';
import type { ExternalWorkout } from '@/hooks/use-external-workouts';

interface WorkoutLogCardProps {
  log: WorkoutLog;
  /**
   * External (watch) workout linked to this log by the server-side overlap
   * matcher (issue #117). When present, the card renders merged: watch heart
   * rate / calories plus a source badge, and an unlink action when expanded.
   */
  linkedExternal?: ExternalWorkout;
}

export function WorkoutLogCard({ log, linkedExternal }: WorkoutLogCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const deleteLog = useHistoryStore((s) => s.deleteLog);
  // Direct mutation (not the offline sync queue): link state is server-owned
  // and only exists for imported workouts, which already require connectivity.
  const unlinkExternalWorkout = useMutation(api.healthData.unlinkExternalWorkout);

  const handleDelete = () => {
    Alert.alert(
      'Delete Workout',
      'This workout will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteLog(log.id),
        },
      ]
    );
  };

  const completedSets = log.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0
  );
  const totalSets = log.exercises.reduce((t, e) => t + e.sets.length, 0);

  // Watch enrichment (issue #117) — mirrors ExternalWorkoutCard's stat line.
  const sourceLabel = linkedExternal
    ? resolveHealthSourceName(linkedExternal.sourceName, linkedExternal.sourceBundleId)
    : null;
  const watchCalories =
    linkedExternal?.activeEnergyKcal !== undefined && linkedExternal.activeEnergyKcal > 0
      ? `${Math.round(linkedExternal.activeEnergyKcal)} kcal`
      : null;
  const watchHeartRate =
    linkedExternal?.avgHeartRateBpm !== undefined && linkedExternal.avgHeartRateBpm > 0
      ? `${Math.round(linkedExternal.avgHeartRateBpm)} bpm avg`
      : null;
  const watchStats = [watchCalories, watchHeartRate].filter((s): s is string => s !== null);

  const handleUnlink = () => {
    if (!linkedExternal || !sourceLabel) return;
    Alert.alert(
      'Show Separately',
      `The ${sourceLabel} recording will appear as its own entry instead of being merged into this workout.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show Separately',
          onPress: () => {
            unlinkExternalWorkout({ healthKitUuid: linkedExternal.healthKitUuid }).catch(() => {
              Alert.alert('Could Not Unlink', 'Check your connection and try again.');
            });
          },
        },
      ]
    );
  };

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
            <Icon as={Clock} size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              {formatDuration(log.durationSeconds)}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {completedSets}/{totalSets} sets
          </Text>
        </View>
      </View>

      {linkedExternal && sourceLabel && (
        <View
          accessible
          accessibilityLabel={[
            `Includes data from ${sourceLabel}`,
            ...(watchCalories ? [`${Math.round(linkedExternal.activeEnergyKcal ?? 0)} calories`] : []),
            ...(watchHeartRate
              ? [`average heart rate ${Math.round(linkedExternal.avgHeartRateBpm ?? 0)}`]
              : []),
          ].join(', ')}
          className="mt-2 flex-row flex-wrap items-center gap-2"
        >
          <View className="rounded-full bg-secondary px-2 py-0.5">
            <Text className="text-xs text-secondary-foreground">+ {sourceLabel}</Text>
          </View>
          {watchStats.length > 0 && (
            <Text className="text-xs text-muted-foreground">{watchStats.join(' · ')}</Text>
          )}
        </View>
      )}

      <View className="mt-2 flex-row items-center gap-1">
        <Text className="text-xs text-muted-foreground">
          {log.exercises.length} exercise{log.exercises.length !== 1 ? 's' : ''}
        </Text>
        {expanded ? (
          <Icon as={ChevronUp} size={14} className="text-muted-foreground" />
        ) : (
          <Icon as={ChevronDown} size={14} className="text-muted-foreground" />
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
                    {exerciseTypeLabel(exercise.type, exercise.metrics)}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  {done}/{exercise.sets.length} sets
                </Text>
              </View>
            );
          })}
          {linkedExternal && sourceLabel && (
            <Pressable
              onPress={handleUnlink}
              accessibilityRole="button"
              accessibilityLabel={`Show the ${sourceLabel} workout separately`}
              accessibilityHint="Removes the merged watch data and lists the imported workout as its own entry"
              className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-secondary py-2.5"
            >
              <Icon as={Unlink} size={14} className="text-secondary-foreground" />
              <Text className="text-sm font-medium text-secondary-foreground">
                Show Separately
              </Text>
            </Pressable>
          )}
          <View className="mt-3 flex-row gap-2">
            <Pressable
              onPress={() => router.push(`/workout/${log.id}`)}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary/10 py-2.5"
            >
              <Icon as={Pencil} size={14} className="text-primary" />
              <Text className="text-sm font-medium text-primary">Edit</Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-destructive/10 py-2.5"
            >
              <Icon as={Trash2} size={14} className="text-destructive" />
              <Text className="text-sm font-medium text-destructive">Delete</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

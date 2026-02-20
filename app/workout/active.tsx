import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { SetRow } from '@/components/workout/set-row';
import { RestTimer } from '@/components/workout/rest-timer';
import { useWorkoutStore } from '@/stores/workout-store';
import { useHistoryStore } from '@/stores/history-store';
import { useWorkoutTimer } from '@/hooks/use-workout-timer';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { createDefaultSet } from '@/lib/defaults';
import { generateId } from '@/lib/id';
import { formatDuration, exerciseTypeLabel } from '@/lib/format';
import { mediumHaptic, successHaptic } from '@/lib/haptics';
import { saveWorkoutToHealthKit } from '@/lib/healthkit';
import type { Exercise, WorkoutLog } from '@/lib/types';

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#f2f2f2' : '#1c1008';

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const toggleSetComplete = useWorkoutStore((s) => s.toggleSetComplete);
  const addSet = useWorkoutStore((s) => s.addSet);
  const removeSet = useWorkoutStore((s) => s.removeSet);
  const addExercise = useWorkoutStore((s) => s.addExercise);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);
  const reorderExercises = useWorkoutStore((s) => s.reorderExercises);
  const endWorkout = useWorkoutStore((s) => s.endWorkout);
  const discardWorkout = useWorkoutStore((s) => s.discardWorkout);
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);
  const addLog = useHistoryStore((s) => s.addLog);

  const elapsed = useWorkoutTimer(activeWorkout?.startedAt ?? null);
  const { isActive: isRestActive, remaining: restRemaining, stop: stopRest } = useRestTimer();
  const [restTotal, setRestTotal] = useState(0);

  if (!activeWorkout) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">No active workout</Text>
      </SafeAreaView>
    );
  }

  const handleToggleSet = (exerciseId: string, setId: string, exercise: Exercise) => {
    const set = exercise.sets.find((s) => s.id === setId);
    const wasCompleted = set?.completed ?? false;

    toggleSetComplete(exerciseId, setId);
    mediumHaptic();

    // Start rest timer if set was just completed
    if (!wasCompleted && exercise.restTimeSeconds > 0) {
      setRestTotal(exercise.restTimeSeconds);
      startRestTimer(exercise.restTimeSeconds);
    }
  };

  const handleAddSet = (exercise: Exercise) => {
    const newSet = createDefaultSet(exercise.type);
    addSet(exercise.id, newSet);
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    if (!activeWorkout) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeWorkout.exercises.length) return;
    const exercises = [...activeWorkout.exercises];
    [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
    reorderExercises(exercises);
    mediumHaptic();
  };

  const handleAddExercise = () => {
    router.push('/exercise/create?source=active');
  };

  const handleEndWorkout = () => {
    Alert.alert('End Workout', 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardWorkout();
          router.dismissAll();
        },
      },
      {
        text: 'Save',
        onPress: () => {
          const workout = endWorkout();
          if (workout) {
            const completedSets = workout.exercises.reduce(
              (total, e) => total + e.sets.filter((s) => s.completed).length,
              0
            );

            const log: WorkoutLog = {
              id: generateId(),
              templateId: workout.templateId,
              templateName: workout.templateName,
              exercises: workout.exercises,
              startedAt: workout.startedAt,
              completedAt: new Date().toISOString(),
              durationSeconds: elapsed,
            };
            addLog(log);
            saveWorkoutToHealthKit(log);
            successHaptic();
            router.replace('/workout/complete');
          }
        },
      },
    ]);
  };

  const totalSets = activeWorkout.exercises.reduce((t, e) => t + e.sets.length, 0);
  const completedSets = activeWorkout.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <View className="flex-1">
          <Text className="text-lg font-bold">{activeWorkout.templateName}</Text>
          <Text className="text-sm text-primary font-medium">{formatDuration(elapsed)}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Badge variant="secondary">
            <Text className="text-xs">{completedSets}/{totalSets} sets</Text>
          </Badge>
        </View>
      </View>

      {/* Body */}
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-32">
        {activeWorkout.exercises.map((exercise, exerciseIndex) => (
          <View key={exercise.id} className="mt-6">
            {/* Exercise Header */}
            <View className="mb-2 flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-1">
                <View className="items-center justify-center">
                  <Pressable
                    onPress={() => handleMoveExercise(exerciseIndex, 'up')}
                    disabled={exerciseIndex === 0}
                    className="h-6 w-6 items-center justify-center"
                    style={{ opacity: exerciseIndex === 0 ? 0.25 : 1 }}
                  >
                    <ChevronUp size={14} color={iconColor} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleMoveExercise(exerciseIndex, 'down')}
                    disabled={exerciseIndex === activeWorkout.exercises.length - 1}
                    className="h-6 w-6 items-center justify-center"
                    style={{ opacity: exerciseIndex === activeWorkout.exercises.length - 1 ? 0.25 : 1 }}
                  >
                    <ChevronDown size={14} color={iconColor} />
                  </Pressable>
                </View>
                <View className="flex-1 flex-row items-center gap-2">
                  <Text className="text-base font-semibold">{exercise.name}</Text>
                  <Badge variant="outline">
                    <Text className="text-xs">{exerciseTypeLabel(exercise.type)}</Text>
                  </Badge>
                </View>
              </View>
              <View className="flex-row items-center gap-1">
                <Pressable
                  onPress={() => handleAddSet(exercise)}
                  className="h-8 w-8 items-center justify-center rounded-md bg-secondary"
                >
                  <Plus size={14} color={iconColor} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert('Remove Exercise', `Remove ${exercise.name}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => removeExercise(exercise.id),
                      },
                    ]);
                  }}
                  className="h-8 w-8 items-center justify-center"
                >
                  <X size={14} color="#ef4444" />
                </Pressable>
              </View>
            </View>

            {/* Set rows */}
            <View className="gap-1">
              {exercise.sets.map((set, setIndex) => (
                <SetRow
                  key={set.id}
                  set={set}
                  index={setIndex}
                  onUpdate={(updates) => updateSet(exercise.id, set.id, updates)}
                  onToggleComplete={() => handleToggleSet(exercise.id, set.id, exercise)}
                  onRemove={() => removeSet(exercise.id, set.id)}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Add Exercise Button */}
        <Pressable
          onPress={handleAddExercise}
          className="mt-6 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-4"
        >
          <Plus size={20} color={isDark ? '#fb923c' : '#f97316'} />
          <Text className="font-medium text-primary">Add Exercise</Text>
        </Pressable>
      </ScrollView>

      {/* Footer */}
      <View className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-4 pb-8 pt-4">
        <Pressable
          onPress={handleEndWorkout}
          className="items-center rounded-xl bg-destructive py-4"
        >
          <Text className="font-semibold text-destructive-foreground">End Workout</Text>
        </Pressable>
      </View>

      {/* Rest Timer Overlay */}
      {isRestActive && (
        <RestTimer
          remaining={restRemaining}
          total={restTotal}
          onSkip={stopRest}
        />
      )}
    </SafeAreaView>
  );
}

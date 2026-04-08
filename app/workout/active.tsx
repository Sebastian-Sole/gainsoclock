import React, { useCallback } from 'react';
import { View, ScrollView, Pressable, Alert, Keyboard } from 'react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import Animated, { FadeInDown, FadeOutDown, Layout } from 'react-native-reanimated';

import { SetRow } from '@/components/workout/set-row';
import { useWorkoutStore } from '@/stores/workout-store';
import { useHistoryStore } from '@/stores/history-store';
import { useWorkoutTimer } from '@/hooks/use-workout-timer';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { createDefaultSet } from '@/lib/defaults';
import { generateId } from '@/lib/id';
import { formatDuration, formatTime } from '@/lib/format';
import { mediumHaptic, successHaptic } from '@/lib/haptics';
import { saveWorkoutToHealthKit } from '@/lib/healthkit';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';
import type { Exercise, WorkoutLog, WorkoutLogExercise, WorkoutSet } from '@/lib/types';
import { schedulePostWorkoutNotification, rescheduleReminderAfterWorkout } from '@/lib/notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { useTemplateStore } from '@/stores/template-store';

interface MemoizedSetRowProps {
  set: WorkoutSet;
  index: number;
  exerciseId: string;
  exercise: Exercise;
  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onToggleSet: (exerciseId: string, setId: string, exercise: Exercise) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
}

const MemoizedSetRow = React.memo(function MemoizedSetRow({
  set, index, exerciseId, exercise, onUpdateSet, onToggleSet, onRemoveSet,
}: MemoizedSetRowProps) {
  const handleUpdate = useCallback(
    (updates: Partial<WorkoutSet>) => onUpdateSet(exerciseId, set.id, updates),
    [onUpdateSet, exerciseId, set.id]
  );
  const handleToggle = useCallback(
    () => onToggleSet(exerciseId, set.id, exercise),
    [onToggleSet, exerciseId, set.id, exercise]
  );
  const handleRemove = useCallback(
    () => onRemoveSet(exerciseId, set.id),
    [onRemoveSet, exerciseId, set.id]
  );

  return (
    <SetRow
      set={set}
      index={index}
      onUpdate={handleUpdate}
      onToggleComplete={handleToggle}
      onRemove={handleRemove}
    />
  );
});

export default function ActiveWorkoutScreen() {
  const router = useRouter();

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const updateSetsFromIndex = useWorkoutStore((s) => s.updateSetsFromIndex);
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
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const templateNotes = useTemplateStore((s) =>
    activeWorkout?.templateId ? s.templates.find((t) => t.id === activeWorkout.templateId)?.notes : undefined
  );

  const elapsed = useWorkoutTimer(activeWorkout?.startedAt ?? null);
  const { isActive: isRestActive, remaining: restRemaining, stop: stopRest } = useRestTimer();

  // "Apply to all below" prompt — shown when user edits any set
  const [applyAllPrompt, setApplyAllPrompt] = React.useState<{
    exerciseId: string;
    setIndex: number;
    field: string;
    value: number;
    label: string;
  } | null>(null);

  const handleToggleSet = useCallback((exerciseId: string, setId: string, exercise: Exercise) => {
    Keyboard.dismiss();
    const set = exercise.sets.find((s) => s.id === setId);
    const wasCompleted = set?.completed ?? false;

    toggleSetComplete(exerciseId, setId);
    mediumHaptic();

    // Start rest timer if set was just completed
    if (!wasCompleted && exercise.restTimeSeconds > 0) {
      startRestTimer(exercise.restTimeSeconds);
    }
  }, [toggleSetComplete, startRestTimer]);

  const handleAddSet = useCallback((exercise: Exercise) => {
    Keyboard.dismiss();
    const newSet = createDefaultSet(exercise.type);
    addSet(exercise.id, newSet);
  }, [addSet]);

  const handleMoveExercise = useCallback((index: number, direction: 'up' | 'down') => {
    Keyboard.dismiss();
    if (!activeWorkout) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeWorkout.exercises.length) return;
    const exercises = [...activeWorkout.exercises];
    [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
    reorderExercises(exercises);
    mediumHaptic();
  }, [activeWorkout, reorderExercises]);

  const handleAddExercise = useCallback(() => {
    Keyboard.dismiss();
    router.push('/exercise/create?source=active');
  }, [router]);

  const handleUpdateSet = useCallback((exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => {
    updateSet(exerciseId, setId, updates);

    // Show "Apply to all below" when editing a set that has sets after it
    const exercise = activeWorkout?.exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const setIndex = exercise.sets.findIndex((s) => s.id === setId);
    if (setIndex === -1 || setIndex >= exercise.sets.length - 1) return; // no sets below

    if ('weight' in updates && updates.weight !== undefined) {
      setApplyAllPrompt({ exerciseId, setIndex, field: 'weight', value: updates.weight, label: `${updates.weight} ${weightUnit}` });
    } else if ('reps' in updates && updates.reps !== undefined) {
      setApplyAllPrompt({ exerciseId, setIndex, field: 'reps', value: updates.reps, label: `${updates.reps} reps` });
    } else if ('distance' in updates && updates.distance !== undefined) {
      setApplyAllPrompt({ exerciseId, setIndex, field: 'distance', value: updates.distance, label: `${updates.distance} ${distanceUnit}` });
    }
  }, [updateSet, activeWorkout, weightUnit, distanceUnit]);

  const handleRemoveSet = useCallback((exerciseId: string, setId: string) => {
    removeSet(exerciseId, setId);
  }, [removeSet]);

  if (!activeWorkout) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">No active workout</Text>
      </SafeAreaView>
    );
  }

  const handleEndWorkout = () => {
    Keyboard.dismiss();
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

            const logExercises: WorkoutLogExercise[] = workout.exercises.map((e, i) => ({
              id: generateId(),
              exerciseId: e.exerciseId,
              name: e.name,
              type: e.type,
              order: i,
              restTimeSeconds: e.restTimeSeconds,
              sets: e.sets,
            }));

            const log: WorkoutLog = {
              id: generateId(),
              templateId: workout.templateId,
              templateName: workout.templateName,
              exercises: logExercises,
              startedAt: workout.startedAt,
              completedAt: new Date().toISOString(),
              durationSeconds: elapsed,
            };
            addLog(log);
            saveWorkoutToHealthKit(log);

            // Schedule post-workout summary notification
            schedulePostWorkoutNotification({
              templateName: log.templateName,
              exerciseCount: log.exercises.length,
              completedSets,
              durationSeconds: log.durationSeconds,
              delayMinutes: useSettingsStore.getState().notificationsPostWorkoutDelay,
            });

            // Cancel today's workout reminder (workout done)
            rescheduleReminderAfterWorkout();

            // Update plan day status if workout was started from a plan
            if (workout.planDayId) {
              const parts = workout.planDayId.split(':');
              if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                const [planClientId, weekStr, dayStr] = parts;
                const week = Number(weekStr);
                const dayOfWeek = Number(dayStr);
                if (!isNaN(week) && !isNaN(dayOfWeek)) {
                  syncToConvex(api.plans.updatePlanDayStatus, {
                    planClientId,
                    week,
                    dayOfWeek,
                    status: 'completed' as const,
                    workoutLogClientId: log.id,
                  });
                }
              }
            }

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
      {/* Header — fixed height so rest-timer swap doesn't shift layout */}
      <View className={`h-16 flex-row items-center justify-between border-b px-4 ${isRestActive ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
        {isRestActive ? (
          <>
            <View key="rest-header" className="flex-1 flex-row items-center gap-3">
              <Text className="text-2xl font-bold tabular-nums text-primary">{formatTime(restRemaining)}</Text>
              <Text className="text-sm text-muted-foreground">rest</Text>
            </View>
            <Pressable onPress={stopRest} className="rounded-lg bg-secondary px-4 py-2">
              <Text className="text-sm font-semibold text-secondary-foreground">Skip</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View key="workout-header" className="flex-1">
              <Text className="text-lg font-bold" numberOfLines={1}>{activeWorkout.templateName}</Text>
              <Text className="text-sm text-primary font-medium">{formatDuration(elapsed)}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Badge variant="secondary">
                <Text className="text-xs">{completedSets}/{totalSets} sets</Text>
              </Badge>
            </View>
          </>
        )}
      </View>

      {/* Template notes */}
      {templateNotes && (
        <View className="border-b border-border bg-muted/30 px-4 py-2">
          <Text className="text-xs text-muted-foreground italic">{templateNotes}</Text>
        </View>
      )}

      {/* Body */}
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-32" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
                    <Icon as={ChevronUp} size={14} className="text-foreground" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleMoveExercise(exerciseIndex, 'down')}
                    disabled={exerciseIndex === activeWorkout.exercises.length - 1}
                    className="h-6 w-6 items-center justify-center"
                    style={{ opacity: exerciseIndex === activeWorkout.exercises.length - 1 ? 0.25 : 1 }}
                  >
                    <Icon as={ChevronDown} size={14} className="text-foreground" />
                  </Pressable>
                </View>
                <Text className="flex-1 text-base font-semibold" numberOfLines={1}>{exercise.name}</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Pressable
                  onPress={() => handleAddSet(exercise)}
                  className="h-8 w-8 items-center justify-center rounded-md bg-secondary"
                >
                  <Icon as={Plus} size={14} className="text-foreground" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
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
                  <Icon as={X} size={14} className="text-destructive" />
                </Pressable>
              </View>
            </View>

            {/* Column headers */}
            <View className="flex-row items-center gap-2 px-3 py-1">
              <Text className="w-8 text-center text-xs text-muted-foreground">Set</Text>
              <View className="flex-1 flex-row items-center gap-2">
                {exercise.type === 'reps_weight' && (
                  <>
                    <Text className="flex-1 text-center text-xs text-muted-foreground">{weightUnit}</Text>
                    <Text className="flex-1 text-center text-xs text-muted-foreground">Reps</Text>
                  </>
                )}
                {exercise.type === 'reps_time' && (
                  <>
                    <Text className="flex-[2] text-center text-xs text-muted-foreground">Time</Text>
                    <Text className="flex-1 text-center text-xs text-muted-foreground">Reps</Text>
                  </>
                )}
                {exercise.type === 'time_only' && (
                  <Text className="flex-1 text-center text-xs text-muted-foreground">Time</Text>
                )}
                {exercise.type === 'time_distance' && (
                  <>
                    <Text className="flex-[2] text-center text-xs text-muted-foreground">Time</Text>
                    <Text className="flex-1 text-center text-xs text-muted-foreground">{distanceUnit}</Text>
                  </>
                )}
                {exercise.type === 'reps_only' && (
                  <Text className="flex-1 text-center text-xs text-muted-foreground">Reps</Text>
                )}
              </View>
              <View className="w-[68px]" />
            </View>

            {/* Set rows */}
            <Animated.View className="gap-1">
              {exercise.sets.map((set, setIndex) => (
                <Animated.View key={set.id} layout={Layout.duration(200)}>
                  <MemoizedSetRow
                    set={set}
                    index={setIndex}
                    exerciseId={exercise.id}
                    exercise={exercise}
                    onUpdateSet={handleUpdateSet}
                    onToggleSet={handleToggleSet}
                    onRemoveSet={handleRemoveSet}
                  />
                  {applyAllPrompt?.exerciseId === exercise.id && applyAllPrompt.setIndex === setIndex && (
                    <Animated.View
                      entering={FadeInDown.duration(200)}
                      exiting={FadeOutDown.duration(150)}
                      layout={Layout.duration(200)}
                      className="mx-3 my-1 flex-row items-center rounded-lg border border-primary bg-primary/10"
                    >
                      <Pressable
                        onPress={() => {
                          updateSetsFromIndex(exercise.id, applyAllPrompt.setIndex, { [applyAllPrompt.field]: applyAllPrompt.value } as Partial<WorkoutSet>);
                          setApplyAllPrompt(null);
                        }}
                        className="flex-1 items-center py-2"
                      >
                        <Text className="text-sm font-semibold text-primary">
                          Apply {applyAllPrompt.label} to all sets below
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setApplyAllPrompt(null)}
                        className="aspect-square items-center justify-center self-stretch"
                        style={{ minWidth: 40 }}
                      >
                        <Icon as={X} size={14} className="text-primary" />
                      </Pressable>
                    </Animated.View>
                  )}
                </Animated.View>
              ))}
            </Animated.View>
          </View>
        ))}

        {/* Add Exercise Button */}
        <Pressable
          onPress={handleAddExercise}
          className="mt-6 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-4"
        >
          <Icon as={Plus} size={20} className="text-primary" />
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

    </SafeAreaView>
  );
}

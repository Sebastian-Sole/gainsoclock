import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Dumbbell, BookmarkPlus } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

import { useWorkoutStore } from '@/stores/workout-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { useWorkoutTimer } from '@/hooks/use-workout-timer';
import { createDefaultSet, createIntervalSet } from '@/lib/defaults';
import { generateId } from '@/lib/id';
import { formatTime, formatDuration } from '@/lib/format';
import type { Exercise, WorkoutSet } from '@/lib/types';
import { hasIncompleteSets } from '@/lib/workout-progress';
import { setActiveWorkoutVisible, cancelRestTimerNotification } from '@/lib/notifications';
import { endRestActivity } from '@/lib/live-activity';
import { FocusLogger } from '@/components/workout/focus/focus-logger';
import { SaveTemplateSheet } from '@/components/workout/save-template-sheet';
import { FocusReward } from '@/components/workout/focus/focus-reward';
import { FocusGradient } from '@/components/workout/focus/focus-gradient';

// Isolated so the 1 Hz elapsed tick doesn't re-render the whole logger.
function ElapsedTimer({ startedAt }: { startedAt: string | null }) {
  const elapsed = useWorkoutTimer(startedAt);
  return <Text className="font-mono text-xs text-muted-foreground">{formatDuration(elapsed)}</Text>;
}

// Isolated so the rest countdown tick stays out of the pager's render path.
function RestIndicator() {
  const { isActive, remaining, stop } = useRestTimer();
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);
  if (!isActive) {
    return (
      <Text testID="workout-rest-idle" className="font-mono text-[10px] text-muted-foreground">
        rest · auto
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-2 rounded-full border border-primary/40 bg-card px-2 py-1">
      <Text className="font-mono text-xs font-semibold text-primary" style={{ minWidth: 34, textAlign: 'center' }}>
        {formatTime(remaining)}
      </Text>
      <Pressable onPress={() => startRestTimer(remaining + 15)} accessibilityRole="button" accessibilityLabel="Add 15 seconds rest">
        <Text className="font-mono text-xs text-muted-foreground">+15</Text>
      </Pressable>
      <Pressable
        onPress={() => stop()}
        accessibilityRole="button"
        accessibilityLabel="Skip rest"
        testID="workout-rest-skip"
      >
        <Text className="font-mono text-xs text-muted-foreground">Skip</Text>
      </Pressable>
    </View>
  );
}

export default function ActiveWorkoutScreen() {
  const router = useRouter();

  // Set when create.tsx dismisses back here after adding an exercise mid-
  // workout (summary, empty state, or the logger's pills bar) — the pager
  // should open on the newly added exercise (#113, #126). Also set when the
  // summary's exercise rows navigate back to a specific exercise.
  const { focusExerciseId } = useLocalSearchParams<{ focusExerciseId?: string }>();

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const toggleSetComplete = useWorkoutStore((s) => s.toggleSetComplete);
  const addSet = useWorkoutStore((s) => s.addSet);
  const removeSet = useWorkoutStore((s) => s.removeSet);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);
  const moveExercise = useWorkoutStore((s) => s.moveExercise);
  const addExerciseMetric = useWorkoutStore((s) => s.addExerciseMetric);
  const removeExerciseMetric = useWorkoutStore((s) => s.removeExerciseMetric);
  const updateSetsFromIndex = useWorkoutStore((s) => s.updateSetsFromIndex);
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);
  const stopRestTimer = useWorkoutStore((s) => s.stopRestTimer);

  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const [rewardTick, setRewardTick] = useState(0);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Suppress the rest-timer notification alert while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      setActiveWorkoutVisible(true);
      return () => setActiveWorkoutVisible(false);
    }, [])
  );

  // If the workout is cleared (discarded) while the logger is the top screen,
  // leave the workout modal instead of rendering a blank screen. Gated on
  // focus: during finishWorkout the store clears while the summary/complete
  // screen is on top, and an unguarded dismissAll here races the finish
  // navigation and closes the complete screen before it's seen (#118).
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!activeWorkout && isFocused) router.dismissAll();
  }, [activeWorkout, isFocused, router]);

  const handleAddSet = (exercise: Exercise) => {
    if (exercise.type === 'intervals') {
      const lastSet = exercise.sets[exercise.sets.length - 1];
      addSet(exercise.id, createIntervalSet(lastSet?.distanceUnit ?? 'km'));
      return;
    }
    const last = exercise.sets[exercise.sets.length - 1];
    const newSet: WorkoutSet = last
      ? { ...last, id: generateId(), completed: false }
      : createDefaultSet(exercise.type, exercise.metrics);
    addSet(exercise.id, newSet);
  };

  const handleSetCompleted = (exercise: Exercise) => {
    // The store already reflects this completion (the toggle runs before this
    // callback), so read it fresh: if that was the workout's last remaining
    // set there is no next set to rest for — the logger is about to route to
    // the summary — so don't start a timer or schedule its notification (#135).
    // 0 stays an explicit "no rest timer".
    const exercisesNow = useWorkoutStore.getState().activeWorkout?.exercises ?? [];
    if (exercise.restTimeSeconds > 0 && hasIncompleteSets(exercisesNow)) {
      startRestTimer(exercise.restTimeSeconds, exercise.name);
    }
    setRewardTick((t) => t + 1);
  };

  const handleAllComplete = () => {
    // Every set is logged — a rest timer still running from an earlier set has
    // no next set, so stop it and cancel its OS notification + Live Activity
    // before the summary takes over (#135). All three are no-ops when idle.
    stopRestTimer();
    cancelRestTimerNotification();
    endRestActivity();
    router.push('/workout/summary');
  };

  if (!activeWorkout) return null;

  const exercises = activeWorkout.exercises;

  // --- empty workout ---
  if (exercises.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <FocusGradient />
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Minimize workout"
          className="absolute right-4 top-14 h-10 w-10 items-center justify-center"
        >
          <Icon as={X} size={22} className="text-foreground" />
        </Pressable>
        <Icon as={Dumbbell} size={40} className="text-muted-foreground" />
        <Text className="text-center text-lg font-semibold text-foreground">Empty workout</Text>
        <Text className="text-center text-sm text-muted-foreground">Add an exercise to start logging.</Text>
        <Pressable
          onPress={() => router.push('/exercise/create?source=active')}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          testID="workout-add-exercise"
          className="mt-2 rounded-xl bg-primary px-6 py-3"
        >
          <Text className="font-semibold text-primary-foreground">Add exercise</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/workout/summary')} accessibilityRole="button" accessibilityLabel="Finish workout">
          <Text className="text-sm font-medium text-muted-foreground">Finish workout</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']} testID="workout-active-screen">
      <FocusGradient />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Top bar */}
        <View className="flex-row items-center gap-3 px-4 pb-1 pt-1">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Minimize workout"
            className="h-9 w-9 items-center justify-center rounded-xl border border-border"
          >
            <Icon as={X} size={18} className="text-muted-foreground" />
          </Pressable>
          <ElapsedTimer startedAt={activeWorkout.startedAt} />
          <View className="ml-auto flex-row items-center gap-3">
            <RestIndicator />
            <Pressable
              onPress={() => setShowSaveTemplate(true)}
              accessibilityRole="button"
              accessibilityLabel="Save as template"
              testID="workout-save-template"
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-xl border border-border"
            >
              <Icon as={BookmarkPlus} size={18} className="text-muted-foreground" />
            </Pressable>
            <Pressable
              onPress={() => router.push('/workout/summary')}
              accessibilityRole="button"
              accessibilityLabel="Finish workout"
              testID="workout-finish"
              className="rounded-lg bg-secondary px-3 py-1.5"
            >
              <Text className="text-xs font-semibold text-secondary-foreground">Finish</Text>
            </Pressable>
          </View>
        </View>

        <FocusLogger
          exercises={exercises}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          onUpdateSet={updateSet}
          onToggleSetComplete={toggleSetComplete}
          onAddSet={handleAddSet}
          onRemoveSet={removeSet}
          onRemoveExercise={removeExercise}
          onMoveExercise={moveExercise}
          onAddMetric={addExerciseMetric}
          onRemoveMetric={removeExerciseMetric}
          onUpdateSetsFromIndex={updateSetsFromIndex}
          onAddExercise={() => router.push('/exercise/create?source=active')}
          onSetCompleted={handleSetCompleted}
          onAllComplete={handleAllComplete}
          focusExerciseId={focusExerciseId}
        />
      </KeyboardAvoidingView>

      <FocusReward trigger={rewardTick} />
      <SaveTemplateSheet visible={showSaveTemplate} onClose={() => setShowSaveTemplate(false)} />
    </SafeAreaView>
  );
}

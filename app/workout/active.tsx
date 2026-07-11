import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { X, MoreHorizontal, Trash2, ChevronUp, ChevronDown, Plus, Dumbbell } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

import { useWorkoutStore } from '@/stores/workout-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { useWorkoutTimer } from '@/hooks/use-workout-timer';
import { createDefaultSet } from '@/lib/defaults';
import { generateId } from '@/lib/id';
import { formatTime, formatDuration } from '@/lib/format';
import { resolveExerciseMetrics, METRIC_LIST, MAX_METRICS_PER_EXERCISE } from '@/lib/metrics';
import type { WorkoutSet } from '@/lib/types';
import { successHaptic, lightHaptic, mediumHaptic } from '@/lib/haptics';
import { setActiveWorkoutVisible } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { FocusSetCard } from '@/components/workout/focus/focus-set-card';
import { FocusReward } from '@/components/workout/focus/focus-reward';
import { ProgressRing } from '@/components/workout/focus/progress-ring';
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
    return <Text className="font-mono text-[10px] text-muted-foreground">rest · auto</Text>;
  }
  return (
    <View className="flex-row items-center gap-2 rounded-full border border-primary/40 bg-card px-2 py-1">
      <Text className="font-mono text-xs font-semibold text-primary" style={{ minWidth: 34, textAlign: 'center' }}>
        {formatTime(remaining)}
      </Text>
      <Pressable onPress={() => startRestTimer(remaining + 15)} accessibilityRole="button" accessibilityLabel="Add 15 seconds rest">
        <Text className="font-mono text-xs text-muted-foreground">+15</Text>
      </Pressable>
      <Pressable onPress={() => stop()} accessibilityRole="button" accessibilityLabel="Skip rest">
        <Text className="font-mono text-xs text-muted-foreground">Skip</Text>
      </Pressable>
    </View>
  );
}

export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const ring = {
    primary: isDark ? '#fb8b3c' : '#f97316',
    track: isDark ? '#302820' : '#e7e1d8',
    good: '#22c55e',
  };

  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const updateSet = useWorkoutStore((s) => s.updateSet);
  const toggleSetComplete = useWorkoutStore((s) => s.toggleSetComplete);
  const addSet = useWorkoutStore((s) => s.addSet);
  const removeSet = useWorkoutStore((s) => s.removeSet);
  const removeExercise = useWorkoutStore((s) => s.removeExercise);
  const moveExercise = useWorkoutStore((s) => s.moveExercise);
  const addExerciseMetric = useWorkoutStore((s) => s.addExerciseMetric);
  const removeExerciseMetric = useWorkoutStore((s) => s.removeExerciseMetric);
  const startRestTimer = useWorkoutStore((s) => s.startRestTimer);

  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [rewardTick, setRewardTick] = useState(0);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [showExMenu, setShowExMenu] = useState(false);
  const [pageW, setPageW] = useState(0);
  const tx = useSharedValue(0);

  // Suppress the rest-timer notification alert while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      setActiveWorkoutVisible(true);
      return () => setActiveWorkoutVisible(false);
    }, [])
  );

  // If the workout is cleared (discarded, or finished) while the logger is the
  // top screen, leave the workout modal instead of rendering a blank screen.
  useEffect(() => {
    if (!activeWorkout) router.dismissAll();
  }, [activeWorkout, router]);

  // Point the pager at a specific exercise when asked to via params — e.g.
  // after adding an exercise from the workout summary, create.tsx dismisses
  // back here with `focusExerciseId` set to the newly added exercise.
  const { focusExerciseId } = useLocalSearchParams<{ focusExerciseId?: string }>();
  useEffect(() => {
    if (!focusExerciseId) return;
    const list = useWorkoutStore.getState().activeWorkout?.exercises ?? [];
    const idx = list.findIndex((e) => e.id === focusExerciseId);
    if (idx !== -1) {
      setExIdx(idx);
      setSetIdx(0);
    }
  }, [focusExerciseId]);

  const exercises = activeWorkout?.exercises ?? [];
  const safeExIdx = Math.min(exIdx, Math.max(0, exercises.length - 1));
  const exercise = exercises[safeExIdx];
  const sets = exercise?.sets ?? [];
  const safeSetIdx = Math.min(setIdx, Math.max(0, sets.length - 1));

  const prevSet = sets[safeSetIdx - 1];
  const curSet = sets[safeSetIdx];
  const nextSet = sets[safeSetIdx + 1];
  const hasPrev = !!prevSet;
  const hasNext = !!nextSet;

  // Recenter the pager whenever the current set/exercise (or width) changes.
  useEffect(() => {
    tx.value = -pageW;
  }, [pageW, safeSetIdx, safeExIdx, tx]);

  const commitPrev = useCallback(() => {
    lightHaptic();
    setSetIdx((i) => Math.max(0, i - 1));
    tx.value = -pageW;
  }, [pageW, tx]);
  const commitNext = useCallback(() => {
    lightHaptic();
    setSetIdx((i) => Math.min(sets.length - 1, i + 1));
    tx.value = -pageW;
  }, [pageW, sets.length, tx]);

  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .onUpdate((e) => {
      'worklet';
      let base = -pageW + e.translationX;
      if ((!hasPrev && e.translationX > 0) || (!hasNext && e.translationX < 0)) {
        base = -pageW + e.translationX * 0.28; // rubber-band at the ends
      }
      tx.value = base;
    })
    .onEnd((e) => {
      'worklet';
      const threshold = pageW * 0.22;
      if (e.translationX < -threshold && hasNext) {
        tx.value = withTiming(-2 * pageW, { duration: 190 }, (f) => {
          if (f) runOnJS(commitNext)();
        });
      } else if (e.translationX > threshold && hasPrev) {
        tx.value = withTiming(0, { duration: 190 }, (f) => {
          if (f) runOnJS(commitPrev)();
        });
      } else {
        tx.value = withTiming(-pageW, { duration: 170 });
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const goToSet = (i: number) => {
    setSetIdx(Math.max(0, Math.min(i, sets.length - 1)));
  };
  const selectExercise = (i: number) => {
    lightHaptic();
    setExIdx(i);
    setSetIdx(0);
  };

  const advanceAfterComplete = useCallback(() => {
    const wk = useWorkoutStore.getState().activeWorkout;
    if (!wk) return;
    const ex = wk.exercises[safeExIdx];
    if (!ex) return;
    // Any remaining incomplete set in this exercise → go log it.
    const nextInEx = ex.sets.findIndex((s) => !s.completed);
    if (nextInEx !== -1) {
      goToSet(nextInEx);
      return;
    }
    // Exercise fully complete → next exercise with incomplete sets (prefer later).
    const after = wk.exercises.findIndex((e, i) => i > safeExIdx && e.sets.some((s) => !s.completed));
    const any = wk.exercises.findIndex((e) => e.sets.some((s) => !s.completed));
    const target = after !== -1 ? after : any;
    if (target !== -1) {
      lightHaptic();
      setExIdx(target);
      setSetIdx(Math.max(0, wk.exercises[target].sets.findIndex((s) => !s.completed)));
      return;
    }
    // Everything is logged → workout summary.
    router.push('/workout/summary');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeExIdx, sets.length, router]);

  const handleComplete = () => {
    if (!exercise || !curSet) return;
    if (!curSet.completed) {
      toggleSetComplete(exercise.id, curSet.id);
      // 0 is an explicit "no rest timer" (same rule as the classic screen).
      if (exercise.restTimeSeconds > 0) startRestTimer(exercise.restTimeSeconds);
      successHaptic();
      setRewardTick((t) => t + 1);
    }
    setTimeout(advanceAfterComplete, 360);
  };

  const handleAddSet = () => {
    if (!exercise) return;
    mediumHaptic();
    const last = sets[sets.length - 1];
    const newSet: WorkoutSet = last
      ? { ...last, id: generateId(), completed: false }
      : createDefaultSet(exercise.type, exercise.metrics);
    addSet(exercise.id, newSet);
    setSetIdx(sets.length);
  };

  const handleRemoveSet = () => {
    if (!exercise || sets.length <= 1 || !curSet) return;
    mediumHaptic();
    removeSet(exercise.id, curSet.id);
    setSetIdx((i) => Math.max(0, Math.min(i, sets.length - 2)));
  };

  const handleMoveExercise = (direction: 'up' | 'down') => {
    if (!exercise) return;
    lightHaptic();
    moveExercise(exercise.id, direction);
    setExIdx((i) => (direction === 'up' ? Math.max(0, i - 1) : Math.min(exercises.length - 1, i + 1)));
    setShowExMenu(false);
  };

  const handleRemoveExercise = () => {
    if (!exercise || exercises.length <= 1) {
      setShowExMenu(false);
      return;
    }
    mediumHaptic();
    removeExercise(exercise.id);
    setExIdx((i) => Math.max(0, Math.min(i, exercises.length - 2)));
    setSetIdx(0);
    setShowExMenu(false);
  };

  if (!activeWorkout) return null;

  // --- empty workout ---
  if (!exercise) {
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

  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  const metrics = resolveExerciseMetrics(exercise.type, exercise.metrics);
  const addableMetrics = METRIC_LIST.filter((spec) => !metrics.includes(spec.id));

  const renderPage = (pageSet: WorkoutSet | undefined, key: string, editable: boolean) => (
    <View key={key} style={{ width: pageW }} className="px-5">
      {pageSet ? (
        <FocusSetCard
          exercise={exercise}
          set={pageSet}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          editable={editable}
          onUpdate={(updates) => updateSet(exercise.id, pageSet.id, updates)}
          onAddMetric={() => setShowAddMetric(true)}
          onRemoveMetric={(m) => removeExerciseMetric(exercise.id, m)}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']} testID="workout-active-screen">
      <FocusGradient />
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

      {/* Session progress */}
      <View className="flex-row items-center gap-2 px-4 pb-1">
        <ProgressRing progress={totalSets ? doneSets / totalSets : 0} size={22} strokeWidth={3} color={ring.good} trackColor={ring.track} />
        <Text className="text-xs text-muted-foreground">
          <Text className="font-semibold text-foreground">{doneSets}</Text> / {totalSets} sets logged
        </Text>
      </View>

      {/* Exercise pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        contentContainerClassName="items-center gap-2 px-4 py-2"
      >
        {exercises.map((e, i) => {
          const p = e.sets.length ? e.sets.filter((s) => s.completed).length / e.sets.length : 0;
          const selected = i === safeExIdx;
          return (
            <Pressable
              key={e.id}
              onPress={() => selectExercise(i)}
              accessibilityRole="button"
              accessibilityLabel={e.name}
              accessibilityState={{ selected }}
              className={cn(
                'flex-row items-center gap-2 rounded-full border py-2 pl-2 pr-3.5',
                selected ? 'border-primary bg-accent' : 'border-border bg-card'
              )}
            >
              <ProgressRing progress={p} size={18} strokeWidth={3} color={p >= 1 ? ring.good : ring.primary} trackColor={ring.track} />
              <Text className={cn('text-sm font-semibold', selected ? 'text-foreground' : 'text-muted-foreground')}>
                {e.name}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => router.push('/exercise/create?source=active')}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          testID="workout-add-exercise"
          className="flex-row items-center gap-1 rounded-full border border-border bg-card px-3.5 py-2"
        >
          <Icon as={Plus} size={14} className="text-primary" />
          <Text className="text-sm font-semibold text-primary">Exercise</Text>
        </Pressable>
      </ScrollView>

      {/* Exercise header */}
      <View className="flex-row items-center justify-between px-5 pb-1 pt-1">
        <Text className="text-sm text-muted-foreground">
          {exercise.name} · {metrics.length} metrics
        </Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleRemoveSet}
            disabled={sets.length <= 1}
            accessibilityRole="button"
            accessibilityLabel="Remove this set"
            className="h-7 w-8 items-center justify-center rounded-lg border border-border"
          >
            <Icon as={Trash2} size={13} className={cn('text-muted-foreground', sets.length <= 1 && 'opacity-30')} />
          </Pressable>
          <Pressable
            onPress={() => setShowExMenu(true)}
            accessibilityRole="button"
            accessibilityLabel="Reorder or remove exercise"
            className="h-7 w-8 items-center justify-center rounded-lg border border-border"
          >
            <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-baseline gap-2 px-5 pb-2">
        <Text className="text-2xl font-extrabold text-foreground">Set {safeSetIdx + 1}</Text>
        <Text className="font-mono text-xs uppercase tracking-wide text-muted-foreground">of {sets.length}</Text>
      </View>

      {/* Swipeable set pager */}
      <View className="flex-1 overflow-hidden" onLayout={(e) => setPageW(e.nativeEvent.layout.width)}>
        {pageW > 0 && (
          <GestureDetector gesture={pan}>
            <Animated.View style={[{ width: pageW * 3, flexDirection: 'row' }, rowStyle]}>
              {renderPage(prevSet, `prev-${prevSet?.id ?? 'x'}`, false)}
              {renderPage(curSet, `cur-${curSet?.id ?? 'x'}`, true)}
              {renderPage(nextSet, `next-${nextSet?.id ?? 'x'}`, false)}
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* Set dots */}
      <View className="flex-row flex-wrap items-center justify-center gap-2 px-4 py-2">
        {sets.map((s, i) => {
          const st = s.completed ? 'done' : i === safeSetIdx ? 'cur' : 'todo';
          return (
            <Pressable
              key={s.id}
              onPress={() => { lightHaptic(); goToSet(i); }}
              accessibilityRole="button"
              accessibilityLabel={`Set ${i + 1}${s.completed ? ', logged' : ''}`}
              className={cn(
                'h-6 w-6 items-center justify-center rounded-full border',
                st === 'done' && 'border-green-500 bg-green-500',
                st === 'cur' && 'border-primary',
                st === 'todo' && 'border-border'
              )}
            >
              <Text
                className={cn(
                  'font-mono text-[10px]',
                  st === 'done' && 'text-white',
                  st === 'cur' && 'text-primary',
                  st === 'todo' && 'text-muted-foreground'
                )}
              >
                {s.completed ? '✓' : i + 1}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={handleAddSet}
          accessibilityRole="button"
          accessibilityLabel="Add set"
          className="h-6 w-6 items-center justify-center rounded-full border border-dashed border-primary"
        >
          <Icon as={Plus} size={12} className="text-primary" />
        </Pressable>
      </View>

      {/* CTA */}
      <View className="px-5 pb-2 pt-1">
        <Pressable
          onPress={handleComplete}
          accessibilityRole="button"
          accessibilityLabel={curSet?.completed ? 'Next set' : 'Complete set'}
          testID="focus-complete-set"
          className={cn('h-14 items-center justify-center rounded-2xl', curSet?.completed ? 'border border-green-500 bg-card' : 'bg-primary')}
        >
          <Text className={cn('text-base font-bold', curSet?.completed ? 'text-green-500' : 'text-primary-foreground')}>
            {curSet?.completed ? 'Set logged ✓' : 'Complete set'}
          </Text>
        </Pressable>
      </View>

      <FocusReward trigger={rewardTick} />

      {/* Add-metric sheet */}
      {showAddMetric && (
        <View className="absolute inset-0" style={{ zIndex: 60 }}>
          <Pressable className="absolute inset-0 bg-black/50" onPress={() => setShowAddMetric(false)} />
          <View className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card px-5 pb-10 pt-4">
            <View className="mb-3 h-1 w-9 self-center rounded-full bg-border" />
            <Text className="text-base font-bold text-foreground">Track another metric</Text>
            <Text className="mb-3 text-xs text-muted-foreground">
              Adds it to every set of {exercise.name} · leave it blank where it doesn&apos;t apply.
            </Text>
            {addableMetrics.length === 0 ? (
              <Text className="py-4 text-sm text-muted-foreground">
                {metrics.length >= MAX_METRICS_PER_EXERCISE
                  ? `That's the ${MAX_METRICS_PER_EXERCISE}-metric limit — remove one first.`
                  : 'Every metric is already tracked.'}
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {addableMetrics.map((spec) => (
                  <Pressable
                    key={spec.id}
                    onPress={() => {
                      lightHaptic();
                      addExerciseMetric(exercise.id, spec.id);
                      setShowAddMetric(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${spec.label}`}
                    className="rounded-xl border border-border bg-secondary px-3.5 py-2.5"
                  >
                    <Text className="text-sm font-semibold text-foreground">{spec.label}</Text>
                    {spec.unit ? (
                      <Text className="font-mono text-[10px] uppercase text-muted-foreground">{spec.unit}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Exercise options sheet */}
      {showExMenu && (
        <View className="absolute inset-0" style={{ zIndex: 60 }}>
          <Pressable className="absolute inset-0 bg-black/50" onPress={() => setShowExMenu(false)} />
          <View className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card px-5 pb-10 pt-4">
            <View className="mb-3 h-1 w-9 self-center rounded-full bg-border" />
            <Text className="mb-3 text-base font-bold text-foreground">{exercise.name}</Text>
            <Pressable
              onPress={() => handleMoveExercise('up')}
              disabled={safeExIdx === 0}
              accessibilityRole="button"
              accessibilityLabel="Move exercise earlier"
              className={cn('flex-row items-center gap-3 rounded-xl border border-border px-4 py-3', safeExIdx === 0 && 'opacity-40')}
            >
              <Icon as={ChevronUp} size={18} className="text-foreground" />
              <Text className="font-semibold text-foreground">Move earlier</Text>
            </Pressable>
            <Pressable
              onPress={() => handleMoveExercise('down')}
              disabled={safeExIdx === exercises.length - 1}
              accessibilityRole="button"
              accessibilityLabel="Move exercise later"
              className={cn('mt-2 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3', safeExIdx === exercises.length - 1 && 'opacity-40')}
            >
              <Icon as={ChevronDown} size={18} className="text-foreground" />
              <Text className="font-semibold text-foreground">Move later</Text>
            </Pressable>
            <Pressable
              onPress={handleRemoveExercise}
              disabled={exercises.length <= 1}
              accessibilityRole="button"
              accessibilityLabel="Remove exercise"
              className={cn('mt-2 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3', exercises.length <= 1 && 'opacity-40')}
            >
              <Icon as={Trash2} size={18} className="text-destructive" />
              <Text className="font-semibold text-destructive">Remove exercise</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View, Pressable, ScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ChevronDown, ChevronUp, MoreHorizontal, Plus, Trash2 } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { FocusSetCard } from '@/components/workout/focus/focus-set-card';
import { ProgressRing, useRingColors } from '@/components/shared/progress-ring';
import { lightHaptic, mediumHaptic, successHaptic } from '@/lib/haptics';
import { MAX_METRICS_PER_EXERCISE, METRIC_LIST, resolveExerciseMetrics } from '@/lib/metrics';
import { firstIncompleteSetIndex } from '@/lib/set-progress';
import type { Exercise, LoadMode, MetricId, WorkoutSet } from '@/lib/types';
import { LOAD_MODE_OPTIONS, resolveLoadMode } from '@/lib/load-mode';
import { cn } from '@/lib/utils';

export interface FocusLoggerProps {
  /** WorkoutLogExercise is structurally a superset of Exercise, so the edit
   *  screen can pass its own exercises straight through. */
  exercises: Exercise[];
  weightUnit: string;
  distanceUnit: string;

  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onToggleSetComplete: (exerciseId: string, setId: string) => void;
  /** The caller adds the set(s) — intervals need a work/rest pair. */
  onAddSet: (exercise: Exercise) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onMoveExercise: (exerciseId: string, direction: 'up' | 'down') => void;
  onAddMetric: (exerciseId: string, metricId: MetricId) => void;
  onRemoveMetric: (exerciseId: string, metricId: MetricId) => void;
  onAddExercise: () => void;
  /** Change how the exercise's weight is counted (#142). Makes the weight
   *  metric row's label a load-mode picker when provided. */
  onChangeLoadMode?: (exercise: Exercise, loadMode: LoadMode) => void;
  /** Scope note under the load-mode control — differs between the active
   *  logger (row + library definition) and edit-log (this log only). */
  loadModeHint?: string;
  /** Apply `updates` to every set at index >= fromIndex — the stores'
   *  updateSetsFromIndex. Enables the per-metric "apply to following sets"
   *  affordance (#146) when provided. */
  onUpdateSetsFromIndex?: (
    exerciseId: string,
    fromIndex: number,
    updates: Partial<WorkoutSet>
  ) => void;

  /** Fired when a set flips to complete — the active logger starts its rest timer. */
  onSetCompleted?: (exercise: Exercise) => void;
  /** Fired once every set is complete — the active logger routes to the summary. */
  onAllComplete?: () => void;
  /** Advance to the next unlogged set after completing one. Off while editing. */
  autoAdvance?: boolean;
  completeLabel?: string;
  /** Point the pager at this exercise when set/changed — e.g. after adding an
   *  exercise mid-workout from any entry point (#113, #126). */
  focusExerciseId?: string;
  /** Bumped for every focus request so re-focusing the SAME exercise (e.g.
   *  tapping its summary row twice) still re-fires the jump (#141). */
  focusNonce?: number;
}

/** Left padding of the pills scroll content (`px-4`), subtracted from a pill's
 *  measured x so the active pill lands flush left with its usual inset. */
const PILLS_LEFT_PADDING = 16;

// --- Set pager tuning (#134) ---
/** Flicks faster than this (pt/s) turn the page even under the drag threshold. */
const FLICK_VELOCITY = 500;
/** Fraction of the page width that must be dragged to commit a page turn. */
const PAGE_THRESHOLD = 0.22;
/** Drag resistance past the first/last set (rubber-band). */
const OVERDRAG_RESISTANCE = 0.28;
/** Release spring, seeded with the gesture velocity on release. Clamped so an
 *  overshoot can never expose the unmounted slot beyond the target page. */
const PAGER_SPRING = {
  stiffness: 300,
  damping: 30,
  mass: 1,
  overshootClamping: true,
} as const;

interface SetSlotProps {
  exercise: Exercise;
  set: WorkoutSet;
  pageW: number;
  offsetX: number;
  weightUnit: string;
  distanceUnit: string;
  editable: boolean;
  onUpdateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  onShowAddMetric: () => void;
  onRemoveMetric: (exerciseId: string, metricId: MetricId) => void;
  canApplyToFollowing: boolean;
  onApplyToFollowing?: (updates: Partial<WorkoutSet>, label: string) => void;
  onPressLoadMode?: () => void;
}

/** One page of the set pager, absolutely positioned at its set's offset inside
 *  the translated row. Memoized and keyed by set id so a swipe commit only
 *  mounts the slot entering the 3-slot window — the visible cards (and their
 *  focused inputs) are never remounted or repositioned by a page turn, which
 *  is what keeps the commit frame flicker-free (#134). */
const SetSlot = React.memo(function SetSlot({
  exercise,
  set,
  pageW,
  offsetX,
  weightUnit,
  distanceUnit,
  editable,
  onUpdateSet,
  onShowAddMetric,
  onRemoveMetric,
  canApplyToFollowing,
  onApplyToFollowing,
  onPressLoadMode,
}: SetSlotProps) {
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: offsetX, width: pageW }}>
      <ScrollView
        contentContainerClassName="px-5 pb-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <FocusSetCard
          exercise={exercise}
          set={set}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          editable={editable}
          onUpdate={(updates) => onUpdateSet(exercise.id, set.id, updates)}
          onAddMetric={onShowAddMetric}
          onRemoveMetric={(m) => onRemoveMetric(exercise.id, m)}
          canApplyToFollowing={canApplyToFollowing}
          onApplyToFollowing={onApplyToFollowing}
          onPressLoadMode={onPressLoadMode}
        />
      </ScrollView>
    </View>
  );
});

/**
 * The one-set-at-a-time swipeable logger. Shared by the active workout and the
 * edit-log screen so both look and behave identically; the screens supply their
 * own chrome (top bar, gradient, save/finish) around it.
 */
export function FocusLogger({
  exercises,
  weightUnit,
  distanceUnit,
  onUpdateSet,
  onToggleSetComplete,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onMoveExercise,
  onAddMetric,
  onRemoveMetric,
  onAddExercise,
  onChangeLoadMode,
  loadModeHint = 'Applies to this exercise going forward · past workouts are unchanged.',
  onUpdateSetsFromIndex,
  onSetCompleted,
  onAllComplete,
  autoAdvance = true,
  completeLabel = 'Complete set',
  focusExerciseId,
  focusNonce,
}: FocusLoggerProps) {
  const ring = useRingColors();

  const [exIdx, setExIdx] = useState(0);
  // Open on the earliest incomplete set — resuming a half-done workout should
  // land where the user actually is, not back on set 1 (#140).
  const [setIdx, setSetIdx] = useState(() =>
    firstIncompleteSetIndex(exercises[0]?.sets ?? [])
  );
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [showExMenu, setShowExMenu] = useState(false);
  const [showLoadMode, setShowLoadMode] = useState(false);
  const [pageW, setPageW] = useState(0);
  // Row translateX. At rest it sits at -safeSetIdx * pageW; each set's slot is
  // absolutely positioned at index * pageW, so no commit ever has to reset it.
  const tx = useSharedValue(0);
  // tx captured at gesture start, so a drag that catches the row mid-settle
  // continues from where the row actually is instead of jumping.
  const panStartX = useSharedValue(0);
  // Set right before a gesture-driven setSetIdx commit: the release spring
  // already owns the motion, so the index-sync effect must not re-drive tx
  // (that would kill the spring's velocity).
  const fromGestureRef = useRef(false);

  const safeExIdx = Math.min(exIdx, Math.max(0, exercises.length - 1));
  const exercise = exercises[safeExIdx];
  const sets = exercise?.sets ?? [];
  const safeSetIdx = Math.min(setIdx, Math.max(0, sets.length - 1));

  const curSet = sets[safeSetIdx];
  const hasPrev = safeSetIdx > 0;
  const hasNext = safeSetIdx < sets.length - 1;

  // advanceAfterComplete runs on a timer, after the store has moved on — read
  // the latest exercises from a ref rather than the closed-over prop.
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;

  // Auto-scroll the pills bar so the active pill sits flush left (#119).
  // Offsets are measured per pill via onLayout (pill width varies with the
  // exercise name) and keyed by exercise id so add/remove/reorder stay correct.
  const reducedMotion = useReducedMotion();
  const pillsScrollRef = useRef<ScrollView>(null);
  const pillOffsetsRef = useRef<Map<string, number>>(new Map());
  const activeExerciseId = exercise?.id;

  const scrollToActivePill = useCallback(
    (exerciseId: string) => {
      const x = pillOffsetsRef.current.get(exerciseId);
      if (x === undefined) return;
      pillsScrollRef.current?.scrollTo({
        x: Math.max(0, x - PILLS_LEFT_PADDING),
        animated: !reducedMotion,
      });
    },
    [reducedMotion]
  );

  useEffect(() => {
    if (activeExerciseId) scrollToActivePill(activeExerciseId);
  }, [activeExerciseId, scrollToActivePill]);

  // Pin the row to the active set whenever the index changes outside the pan
  // gesture (set dots, auto-advance, add/remove set, exercise switch, layout).
  // Instant, matching the previous non-swipe behavior.
  useEffect(() => {
    if (fromGestureRef.current) {
      fromGestureRef.current = false;
      return;
    }
    tx.value = -safeSetIdx * pageW;
  }, [pageW, safeSetIdx, safeExIdx, tx]);

  // Jump to a caller-designated exercise — e.g. one just added or tapped on
  // the summary screen — landing on its earliest incomplete set (#140).
  useEffect(() => {
    if (!focusExerciseId) return;
    const idx = exercisesRef.current.findIndex((e) => e.id === focusExerciseId);
    if (idx !== -1) {
      setExIdx(idx);
      setSetIdx(firstIncompleteSetIndex(exercisesRef.current[idx].sets));
    }
  }, [focusExerciseId, focusNonce]);

  const openAddMetric = useCallback(() => setShowAddMetric(true), []);
  const openLoadMode = useCallback(() => setShowLoadMode(true), []);

  // Per-metric "apply to following sets" (#146): writes the tapped metric's
  // current value onto this set and every set after it. Values rarely change
  // set-to-set, so this saves re-entering them. Later sets that are already
  // logged are never overwritten silently — a confirm interposes.
  const applyToFollowingSets = useCallback(
    (updates: Partial<WorkoutSet>, label: string) => {
      if (!onUpdateSetsFromIndex) return;
      const ex = exercisesRef.current[safeExIdx];
      if (!ex) return;
      const fromIndex = Math.min(setIdx, Math.max(0, ex.sets.length - 1));
      const apply = () => {
        lightHaptic();
        onUpdateSetsFromIndex(ex.id, fromIndex, updates);
      };
      const completedAfter = ex.sets.filter((s, i) => i > fromIndex && s.completed).length;
      if (completedAfter > 0) {
        Alert.alert(
          'Overwrite logged sets?',
          `${completedAfter} of the following sets ${completedAfter === 1 ? 'is' : 'are'} already logged. Apply this ${label.toLowerCase()} to ${completedAfter === 1 ? 'it' : 'them'} too?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Apply', onPress: apply },
          ]
        );
      } else {
        apply();
      }
    },
    [onUpdateSetsFromIndex, safeExIdx, setIdx]
  );

  const commitFromGesture = useCallback((target: number) => {
    fromGestureRef.current = true;
    lightHaptic();
    setSetIdx(target);
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .onStart(() => {
      'worklet';
      panStartX.value = tx.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (pageW <= 0) return; // detector mounts before the first layout pass
      const raw = panStartX.value + e.translationX;
      const min = -(sets.length - 1) * pageW;
      if (raw > 0) {
        tx.value = raw * OVERDRAG_RESISTANCE; // rubber-band before the first set
      } else if (raw < min) {
        tx.value = min + (raw - min) * OVERDRAG_RESISTANCE; // …and past the last
      } else {
        tx.value = raw;
      }
    })
    .onEnd((e) => {
      'worklet';
      if (pageW <= 0) return;
      // Fractional set index under the viewport at release.
      const idxF = -tx.value / pageW;
      let target = safeSetIdx;
      if (hasNext && (idxF - safeSetIdx > PAGE_THRESHOLD || e.velocityX < -FLICK_VELOCITY)) {
        target = safeSetIdx + 1;
      } else if (hasPrev && (safeSetIdx - idxF > PAGE_THRESHOLD || e.velocityX > FLICK_VELOCITY)) {
        target = safeSetIdx - 1;
      }
      // Carry the finger's velocity into the settle so flicks feel fast and
      // slow drags ease in gently. The commit runs immediately: the target
      // slot is already mounted, so the React re-render only swaps which
      // offscreen neighbor exists — nothing visible moves at commit (#134).
      tx.value = withSpring(-target * pageW, { ...PAGER_SPRING, velocity: e.velocityX });
      if (target !== safeSetIdx) runOnJS(commitFromGesture)(target);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const goToSet = (i: number) => setSetIdx(Math.max(0, Math.min(i, sets.length - 1)));
  const selectExercise = (i: number) => {
    lightHaptic();
    setExIdx(i);
    setSetIdx(firstIncompleteSetIndex(exercises[i]?.sets ?? []));
  };

  const advanceAfterComplete = useCallback(() => {
    const list = exercisesRef.current;
    const ex = list[safeExIdx];
    if (!ex) return;
    const nextInEx = ex.sets.findIndex((s) => !s.completed);
    if (nextInEx !== -1) {
      setSetIdx(nextInEx);
      return;
    }
    const after = list.findIndex((e, i) => i > safeExIdx && e.sets.some((s) => !s.completed));
    const any = list.findIndex((e) => e.sets.some((s) => !s.completed));
    const target = after !== -1 ? after : any;
    if (target !== -1) {
      lightHaptic();
      setExIdx(target);
      setSetIdx(Math.max(0, list[target].sets.findIndex((s) => !s.completed)));
      return;
    }
    onAllComplete?.();
  }, [safeExIdx, onAllComplete]);

  const handleComplete = () => {
    if (!exercise || !curSet) return;
    if (!curSet.completed) {
      onToggleSetComplete(exercise.id, curSet.id);
      successHaptic();
      onSetCompleted?.(exercise);
    } else if (!autoAdvance) {
      // Editing: the CTA is a toggle, so a second press un-logs the set.
      onToggleSetComplete(exercise.id, curSet.id);
      lightHaptic();
      return;
    }
    if (autoAdvance) setTimeout(advanceAfterComplete, 360);
  };

  const handleAddSet = () => {
    if (!exercise) return;
    mediumHaptic();
    onAddSet(exercise);
    setSetIdx(sets.length);
  };

  const handleRemoveSet = () => {
    if (!exercise || sets.length <= 1 || !curSet) return;
    mediumHaptic();
    onRemoveSet(exercise.id, curSet.id);
    setSetIdx((i) => Math.max(0, Math.min(i, sets.length - 2)));
  };

  const handleMoveExercise = (direction: 'up' | 'down') => {
    if (!exercise) return;
    lightHaptic();
    onMoveExercise(exercise.id, direction);
    setExIdx((i) => (direction === 'up' ? Math.max(0, i - 1) : Math.min(exercises.length - 1, i + 1)));
    setShowExMenu(false);
  };

  const handleRemoveExercise = () => {
    if (!exercise || exercises.length <= 1) {
      setShowExMenu(false);
      return;
    }
    mediumHaptic();
    onRemoveExercise(exercise.id);
    setExIdx((i) => Math.max(0, Math.min(i, exercises.length - 2)));
    setSetIdx(0);
    setShowExMenu(false);
  };

  if (!exercise) return null;

  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  const metrics = resolveExerciseMetrics(exercise.type, exercise.metrics);
  const addableMetrics = METRIC_LIST.filter((spec) => !metrics.includes(spec.id));

  return (
    <>
      {/* Session progress */}
      <View className="flex-row items-center gap-2 px-4 pb-1">
        <ProgressRing
          progress={totalSets ? doneSets / totalSets : 0}
          size={22}
          strokeWidth={3}
          color={ring.good}
          trackColor={ring.track}
        />
        <Text className="text-xs text-muted-foreground">
          <Text className="font-semibold text-foreground">{doneSets}</Text> / {totalSets} sets logged
        </Text>
      </View>

      {/* Exercise pills */}
      <ScrollView
        ref={pillsScrollRef}
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
              onLayout={(ev) => {
                // layout.x is relative to the content container, so it already
                // accounts for the px-4 inset and gap-2 spacing.
                pillOffsetsRef.current.set(e.id, ev.nativeEvent.layout.x);
                // Re-fires on add/remove/reorder (and first mount, which can
                // land after the scroll effect) — keep the active pill flush.
                if (selected) scrollToActivePill(e.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={e.name}
              accessibilityState={{ selected }}
              className={cn(
                'flex-row items-center gap-2 rounded-full border py-2 pl-2 pr-3.5',
                selected ? 'border-primary bg-accent' : 'border-border bg-card'
              )}
            >
              <ProgressRing
                progress={p}
                size={18}
                strokeWidth={3}
                color={p >= 1 ? ring.good : ring.primary}
                trackColor={ring.track}
              />
              <Text
                className={cn(
                  'text-sm font-semibold',
                  selected ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {e.name}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onAddExercise}
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
          {exercise.name} ·{' '}
          {exercise.type === 'intervals' ? 'intervals' : `${metrics.length} metrics`}
        </Text>
        <Pressable
          onPress={() => setShowExMenu(true)}
          accessibilityRole="button"
          accessibilityLabel="Reorder or remove exercise"
          testID="focus-exercise-menu"
          className="h-7 w-8 items-center justify-center rounded-lg border border-border"
        >
          <Icon as={MoreHorizontal} size={16} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* Set header — the remove-set control lives here, next to the set it
          deletes, not up with the exercise-level controls. */}
      <View className="flex-row items-center justify-between px-5 pb-2">
        <View className="flex-row items-baseline gap-2">
          <Text className="text-2xl font-extrabold text-foreground">Set {safeSetIdx + 1}</Text>
          <Text className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            of {sets.length}
          </Text>
        </View>
        <Pressable
          onPress={handleRemoveSet}
          disabled={sets.length <= 1}
          accessibilityRole="button"
          accessibilityLabel="Remove this set"
          className="h-7 w-8 items-center justify-center rounded-lg border border-border"
        >
          <Icon
            as={Trash2}
            size={13}
            className={cn('text-muted-foreground', sets.length <= 1 && 'opacity-30')}
          />
        </Pressable>
      </View>

      {/* Swipeable set pager. The detector sits on the (untranslated) viewport
          so the pan hit area covers the screen at every page; the translated
          row inside holds a 3-slot window of absolutely positioned pages. */}
      <GestureDetector gesture={pan}>
        <View
          className="flex-1 overflow-hidden"
          onLayout={(e) => setPageW(e.nativeEvent.layout.width)}
        >
          {pageW > 0 && (
            <Animated.View style={[{ flex: 1 }, rowStyle]}>
              {sets.map((s, i) =>
                Math.abs(i - safeSetIdx) > 1 ? null : (
                  <SetSlot
                    key={s.id}
                    exercise={exercise}
                    set={s}
                    pageW={pageW}
                    offsetX={i * pageW}
                    weightUnit={weightUnit}
                    distanceUnit={distanceUnit}
                    editable={i === safeSetIdx}
                    onUpdateSet={onUpdateSet}
                    onShowAddMetric={openAddMetric}
                    onRemoveMetric={onRemoveMetric}
                    canApplyToFollowing={i === safeSetIdx && hasNext}
                    onApplyToFollowing={
                      onUpdateSetsFromIndex ? applyToFollowingSets : undefined
                    }
                    onPressLoadMode={onChangeLoadMode ? openLoadMode : undefined}
                  />
                )
              )}
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      {/* Set dots */}
      <View className="flex-row flex-wrap items-center justify-center gap-2 px-4 py-2">
        {sets.map((s, i) => {
          const st = s.completed ? 'done' : i === safeSetIdx ? 'cur' : 'todo';
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                lightHaptic();
                goToSet(i);
              }}
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
          accessibilityLabel={curSet?.completed ? 'Next set' : completeLabel}
          testID="focus-complete-set"
          className={cn(
            'h-14 items-center justify-center rounded-2xl',
            curSet?.completed ? 'border border-green-500 bg-card' : 'bg-primary'
          )}
        >
          <Text
            className={cn(
              'text-base font-bold',
              curSet?.completed ? 'text-green-500' : 'text-primary-foreground'
            )}
          >
            {curSet?.completed ? 'Next' : completeLabel}
          </Text>
        </Pressable>
      </View>

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
                      onAddMetric(exercise.id, spec.id);
                      setShowAddMetric(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${spec.label}`}
                    className="rounded-xl border border-border bg-secondary px-3.5 py-2.5"
                  >
                    <Text className="text-sm font-semibold text-foreground">{spec.label}</Text>
                    {spec.unit ? (
                      <Text className="font-mono text-[10px] uppercase text-muted-foreground">
                        {spec.unit}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Load-mode sheet (#142) — opened from the weight row's unit chip. */}
      {showLoadMode && onChangeLoadMode && (
        <View className="absolute inset-0" style={{ zIndex: 60 }}>
          <Pressable
            className="absolute inset-0 bg-black/50"
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setShowLoadMode(false)}
          />
          <View className="absolute bottom-0 left-0 right-0 rounded-t-3xl border-t border-border bg-card px-5 pb-10 pt-4">
            <View className="mb-3 h-1 w-9 self-center rounded-full bg-border" />
            <Text className="mb-3 text-base font-bold text-foreground">Weight is entered as</Text>
            <View
              className="flex-row rounded-lg bg-secondary"
              accessibilityRole="radiogroup"
              accessibilityLabel="Weight entry mode"
            >
              {LOAD_MODE_OPTIONS.map((option) => {
                const selected = resolveLoadMode(exercise.loadMode) === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      lightHaptic();
                      onChangeLoadMode(exercise, option.id);
                    }}
                    className={cn(
                      'min-h-[44px] flex-1 items-center justify-center rounded-lg px-2 py-3',
                      selected && 'bg-primary'
                    )}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityHint={option.description}
                    accessibilityState={{ checked: selected }}
                    testID={`focus-load-mode-${option.id}`}
                  >
                    <Text
                      className={cn(
                        'text-sm font-medium',
                        selected ? 'text-primary-foreground' : 'text-secondary-foreground'
                      )}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-1.5 text-xs text-muted-foreground">
              {LOAD_MODE_OPTIONS.find((o) => o.id === resolveLoadMode(exercise.loadMode))?.description}
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">{loadModeHint}</Text>
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
              className={cn(
                'flex-row items-center gap-3 rounded-xl border border-border px-4 py-3',
                safeExIdx === 0 && 'opacity-40'
              )}
            >
              <Icon as={ChevronUp} size={18} className="text-foreground" />
              <Text className="font-semibold text-foreground">Move earlier</Text>
            </Pressable>
            <Pressable
              onPress={() => handleMoveExercise('down')}
              disabled={safeExIdx === exercises.length - 1}
              accessibilityRole="button"
              accessibilityLabel="Move exercise later"
              className={cn(
                'mt-2 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3',
                safeExIdx === exercises.length - 1 && 'opacity-40'
              )}
            >
              <Icon as={ChevronDown} size={18} className="text-foreground" />
              <Text className="font-semibold text-foreground">Move later</Text>
            </Pressable>
            <Pressable
              onPress={handleRemoveExercise}
              disabled={exercises.length <= 1}
              accessibilityRole="button"
              accessibilityLabel="Remove exercise"
              testID="focus-remove-exercise"
              className={cn(
                'mt-2 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3',
                exercises.length <= 1 && 'opacity-40'
              )}
            >
              <Icon as={Trash2} size={18} className="text-destructive" />
              <Text className="font-semibold text-destructive">Remove exercise</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}

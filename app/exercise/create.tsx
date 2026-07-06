import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, FlatList, Keyboard } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ChevronLeft, Search } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';

import { ExercisePresetSelector } from '@/components/workout/exercise-preset-selector';
import { MetricPicker } from '@/components/workout/metric-picker';
import { RestTimerPresets } from '@/components/workout/rest-timer-presets';
import { StepIndicator } from '@/components/shared/step-indicator';
import { NumericInput } from '@/components/shared/numeric-input';

import type { Exercise, ExerciseType, ExerciseDefinition, IntervalDistanceUnit, MetricId, TemplateExercise } from '@/lib/types';
import { createDefaultSets } from '@/lib/defaults';
import { resolveExerciseMetrics } from '@/lib/metrics';
import { generateId } from '@/lib/id';
import { lightHaptic } from '@/lib/haptics';
import { exerciseTypeLabel } from '@/lib/format';
import { useTemplateCreateStore } from '@/stores/exercise-draft-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useEditLogStore } from '@/stores/edit-log-store';
import { useExerciseLibraryStore } from '@/stores/exercise-library-store';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

// Wizard steps (picker is -1).
const STEP_PRESET = 0;
const STEP_METRICS = 1;
const STEP_NAME = 2;
const STEP_CONFIG = 3;
const STEP_REST = 4;
const TOTAL_STEPS = 5;

export default function CreateExerciseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isActiveWorkout = source === 'active';
  const addTemplateExercise = useTemplateCreateStore((s) => s.addExercise);
  const allExercises = useExerciseLibraryStore((s) => s.exercises);
  const getOrCreate = useExerciseLibraryStore((s) => s.getOrCreate);
  const userDefaultRestTime = useSettingsStore((s) => s.defaultRestTime);
  const userDefaultSetsCount = useSettingsStore((s) => s.defaultSetsCount);
  const userDefaultRepsCount = useSettingsStore((s) => s.defaultRepsCount);
  const userDistanceUnit = useSettingsStore((s) => s.distanceUnit);
  const weightUnit = useSettingsStore((s) => s.weightUnit);

  // -1 = picker, 0-4 = wizard steps
  const [step, setStep] = useState(-1);
  const [presetId, setPresetId] = useState<string | undefined>();
  const [exerciseType, setExerciseType] = useState<ExerciseType | undefined>();
  const [metrics, setMetrics] = useState<MetricId[]>([]);
  const [name, setName] = useState('');
  const [setsCount, setSetsCount] = useState(userDefaultSetsCount);
  const [repsCount, setRepsCount] = useState(userDefaultRepsCount);
  const [restTime, setRestTime] = useState(userDefaultRestTime);
  const [intervalUnit, setIntervalUnit] = useState<IntervalDistanceUnit>(userDistanceUnit);
  // Template suggested defaults (duration captured in minutes, stored as seconds).
  const [suggestedWeight, setSuggestedWeight] = useState(20);
  const [suggestedDurationMin, setSuggestedDurationMin] = useState(10);
  const [suggestedDistance, setSuggestedDistance] = useState(5);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const isIntervals = exerciseType === 'intervals';
  const hasReps = metrics.includes('reps');
  const hasWeight = metrics.includes('weight');
  const hasDuration = metrics.includes('duration');
  const hasDistance = metrics.includes('distance');
  // Suggested defaults are template-only; the active/edit-log flows keep the
  // registry defaults so logging starts from a clean slate.
  const isTemplateFlow = !isActiveWorkout && source !== 'edit-log';

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const filteredExercises = useMemo(() => {
    if (!searchQuery) return allExercises;
    const q = searchQuery.toLowerCase();
    return allExercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [allExercises, searchQuery]);

  const canProceed = useCallback(() => {
    switch (step) {
      case STEP_PRESET: return exerciseType !== undefined;
      case STEP_METRICS: return isIntervals || metrics.length > 0;
      case STEP_NAME: return name.trim().length > 0;
      case STEP_CONFIG: return setsCount > 0;
      case STEP_REST: return true;
      default: return false;
    }
  }, [step, exerciseType, isIntervals, metrics, name, setsCount]);

  const handleSelectPreset = (preset: { id: string; metrics: MetricId[]; isIntervals?: boolean }) => {
    setPresetId(preset.id);
    setExerciseType(preset.isIntervals ? 'intervals' : 'metrics');
    setMetrics(preset.isIntervals ? [] : preset.metrics);
    lightHaptic();
  };

  const handleSelectExisting = (exercise: ExerciseDefinition) => {
    setSelectedExercise(exercise);
    setName(exercise.name);
    setPresetId('existing');
    setExerciseType(exercise.type);
    setMetrics(resolveExerciseMetrics(exercise.type, exercise.metrics));
    lightHaptic();
    // Skip preset/metrics/name steps, go straight to sets config
    setStep(STEP_CONFIG);
  };

  const handleCreateNew = () => {
    setSelectedExercise(null);
    setPresetId(undefined);
    setExerciseType(undefined);
    setMetrics([]);
    setName(searchQuery);
    lightHaptic();
    setStep(STEP_PRESET);
  };

  const handleNext = () => {
    if (!canProceed()) return;
    lightHaptic();
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = () => {
    lightHaptic();
    if (step === -1) {
      router.back();
    } else if (step === STEP_PRESET) {
      setStep(-1);
    } else if (selectedExercise && step === STEP_CONFIG) {
      // Came from picker, go back to picker
      setSelectedExercise(null);
      setExerciseType(undefined);
      setPresetId(undefined);
      setMetrics([]);
      setName('');
      setStep(-1);
    } else {
      setStep(step - 1);
    }
  };

  const handleSave = () => {
    if (!exerciseType) return;
    const trimmedName = name.trim();

    // Ensure exercise exists in the library
    const exerciseDef = getOrCreate(trimmedName, exerciseType, metrics);

    const suggested = {
      ...(hasReps ? { suggestedReps: repsCount } : {}),
      ...(isTemplateFlow && hasWeight ? { suggestedWeight } : {}),
      ...(isTemplateFlow && hasDuration ? { suggestedTime: suggestedDurationMin * 60 } : {}),
      ...(isTemplateFlow && hasDistance ? { suggestedDistance } : {}),
      ...(isIntervals ? { intervalDistanceUnit: intervalUnit } : {}),
    };

    if (isActiveWorkout || source === 'edit-log') {
      const exercise: Exercise = {
        id: generateId(),
        exerciseId: exerciseDef.id,
        name: trimmedName,
        type: exerciseType,
        metrics,
        sets: createDefaultSets(exerciseType, metrics, setsCount, suggested),
        restTimeSeconds: restTime,
      };
      if (isActiveWorkout) {
        useWorkoutStore.getState().addExercise(exercise);
      } else {
        useEditLogStore.getState().addExercise(exercise);
      }
    } else {
      const templateExercise: TemplateExercise = {
        id: generateId(),
        exerciseId: exerciseDef.id,
        name: trimmedName,
        type: exerciseType,
        metrics,
        order: useTemplateCreateStore.getState().exercises.length,
        restTimeSeconds: restTime,
        defaultSetsCount: setsCount,
        ...(hasReps ? { suggestedReps: repsCount } : {}),
        ...(hasWeight ? { suggestedWeight } : {}),
        ...(hasDuration ? { suggestedTime: suggestedDurationMin * 60 } : {}),
        ...(hasDistance ? { suggestedDistance } : {}),
      };
      addTemplateExercise(templateExercise);
    }
    router.back();
  };

  // Picker screen
  if (step === -1) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center">
              <Icon as={X} size={24} className="text-foreground" />
            </Pressable>
            <Text className="text-base font-semibold">Add Exercise</Text>
            <View className="w-10" />
          </View>

          {/* Search */}
          <View className="px-4 pb-2">
            <View className="flex-row items-center rounded-xl border border-input bg-card px-3">
              <Icon as={Search} size={18} className="text-muted-foreground" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search exercises..."
                placeholderTextColor="#9ca3af"
                autoFocus
                className="flex-1 px-3 py-3 text-[16px] text-foreground"
              />
            </View>
          </View>

          {/* Exercise List */}
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 pb-24"
            ListHeaderComponent={
              <Pressable
                onPress={handleCreateNew}
                className="mb-2 flex-row items-center gap-3 rounded-xl border border-dashed border-primary bg-accent px-4 py-4"
              >
                <Text className="text-2xl text-primary">+</Text>
                <View>
                  <Text className="font-medium text-primary">
                    {searchQuery ? `Create "${searchQuery}"` : 'Create New Exercise'}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Build a custom exercise
                  </Text>
                </View>
              </Pressable>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectExisting(item)}
                className="mb-1 flex-row items-center justify-between rounded-xl bg-card px-4 py-3"
              >
                <View>
                  <Text className="font-medium">{item.name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {exerciseTypeLabel(item.type, item.metrics)}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              searchQuery ? (
                <View className="items-center py-8">
                  <Text className="text-muted-foreground">No matching exercises</Text>
                </View>
              ) : null
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const renderStep = () => {
    switch (step) {
      case STEP_PRESET:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-preset" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">Exercise Type</Text>
            <Text className="mb-6 text-muted-foreground">Pick a starting point — you can tweak what it tracks next.</Text>
            <ExercisePresetSelector selectedId={presetId} onSelect={handleSelectPreset} />
          </Animated.View>
        );
      case STEP_METRICS:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-metrics" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">What to track</Text>
            {isIntervals ? (
              <Text className="text-muted-foreground">
                Intervals track pace, distance, or speed per work/rest pair — you&apos;ll set that on each set.
              </Text>
            ) : (
              <>
                <Text className="mb-6 text-muted-foreground">Choose the values you want to log for this exercise.</Text>
                <MetricPicker metrics={metrics} onChange={setMetrics} />
              </>
            )}
          </Animated.View>
        );
      case STEP_NAME:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-name" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">Exercise Name</Text>
            <Text className="mb-6 text-muted-foreground">Give your exercise a name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Bench Press"
              placeholderTextColor="#9ca3af"
              autoFocus
              className="rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
            />
          </Animated.View>
        );
      case STEP_CONFIG: {
        const countLabel = isIntervals ? 'Intervals' : 'Sets';
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-config" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">
              {isIntervals ? 'Intervals' : `Sets${hasReps ? ' & Reps' : ''}`}
            </Text>
            <Text className="mb-6 text-muted-foreground">
              {isIntervals
                ? 'Each interval is one work + one rest pair'
                : hasReps
                  ? 'Configure sets and default reps'
                  : 'How many sets for this exercise?'}
            </Text>
            <View className="gap-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-medium">{countLabel}</Text>
                <NumericInput value={setsCount} onValueChange={setSetsCount} min={1} max={20} />
              </View>
              {hasReps && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-medium">Reps</Text>
                  <NumericInput value={repsCount} onValueChange={setRepsCount} min={1} max={100} />
                </View>
              )}
              {isTemplateFlow && hasWeight && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-medium">Weight ({weightUnit})</Text>
                  <NumericInput value={suggestedWeight} onValueChange={setSuggestedWeight} min={0} max={2000} step={5} label="suggested weight" />
                </View>
              )}
              {isTemplateFlow && hasDuration && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-medium">Duration (min)</Text>
                  <NumericInput value={suggestedDurationMin} onValueChange={setSuggestedDurationMin} min={1} max={600} label="suggested duration in minutes" />
                </View>
              )}
              {isTemplateFlow && hasDistance && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-medium">Distance ({userDistanceUnit})</Text>
                  <NumericInput value={suggestedDistance} onValueChange={setSuggestedDistance} min={1} max={1000} label="suggested distance" />
                </View>
              )}
              {isIntervals && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-medium">Distance unit</Text>
                  <View className="flex-row rounded-lg bg-secondary">
                    {(['km', 'mi'] as const).map((unit) => (
                      <Pressable
                        key={unit}
                        onPress={() => setIntervalUnit(unit)}
                        className={cn(
                          'rounded-lg px-4 py-2',
                          intervalUnit === unit && 'bg-primary'
                        )}
                        accessibilityRole="button"
                        accessibilityLabel={`Distance unit ${unit}`}
                      >
                        <Text
                          className={cn(
                            'text-sm font-medium',
                            intervalUnit === unit
                              ? 'text-primary-foreground'
                              : 'text-secondary-foreground'
                          )}
                        >
                          {unit}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </Animated.View>
        );
      }
      case STEP_REST:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-rest" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">Rest Time</Text>
            <Text className="mb-6 text-muted-foreground">Rest between sets</Text>
            <RestTimerPresets selected={restTime} onSelect={setRestTime} />
          </Animated.View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={handleBack} className="h-10 w-10 items-center justify-center">
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <StepIndicator totalSteps={TOTAL_STEPS} currentStep={step} />
        <View className="w-10" />
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
        {renderStep()}
      </ScrollView>

      {/* Footer */}
      <View style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight - insets.bottom + 16 : 16 }} className="px-6">
        <Pressable
          onPress={handleNext}
          disabled={!canProceed()}
          className={`items-center rounded-xl py-4 ${
            canProceed() ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <Text
            className={`text-base font-semibold ${
              canProceed() ? 'text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {step === TOTAL_STEPS - 1 ? 'Add Exercise' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

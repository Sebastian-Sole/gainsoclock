import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, ChevronLeft, Search } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';

import { ExerciseTypeSelector } from '@/components/workout/exercise-type-selector';
import { RestTimerPresets } from '@/components/workout/rest-timer-presets';
import { StepIndicator } from '@/components/shared/step-indicator';
import { NumericInput } from '@/components/shared/numeric-input';

import type { Exercise, ExerciseType, ExerciseDefinition, TemplateExercise } from '@/lib/types';
import { createDefaultSets } from '@/lib/defaults';
import { generateId } from '@/lib/id';
import { DEFAULT_REST_TIME } from '@/lib/defaults';
import { lightHaptic } from '@/lib/haptics';
import { exerciseTypeLabel } from '@/lib/format';
import { useTemplateCreateStore } from '@/stores/exercise-draft-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { useEditLogStore } from '@/stores/edit-log-store';
import { useExerciseLibraryStore } from '@/stores/exercise-library-store';

const TOTAL_STEPS = 4;

export default function CreateExerciseScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#f2f2f2' : '#1c1008';
  const { source } = useLocalSearchParams<{ source?: string }>();
  const isActiveWorkout = source === 'active';
  const addTemplateExercise = useTemplateCreateStore((s) => s.addExercise);
  const allExercises = useExerciseLibraryStore((s) => s.exercises);
  const getOrCreate = useExerciseLibraryStore((s) => s.getOrCreate);

  // -1 = picker, 0-3 = wizard steps
  const [step, setStep] = useState(allExercises.length > 0 ? -1 : 0);
  const [exerciseType, setExerciseType] = useState<ExerciseType | undefined>();
  const [name, setName] = useState('');
  const [setsCount, setSetsCount] = useState(3);
  const [restTime, setRestTime] = useState(DEFAULT_REST_TIME);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExercises = useMemo(() => {
    if (!searchQuery) return allExercises;
    const q = searchQuery.toLowerCase();
    return allExercises.filter((e) => e.name.toLowerCase().includes(q));
  }, [allExercises, searchQuery]);

  const canProceed = useCallback(() => {
    switch (step) {
      case 0: return exerciseType !== undefined;
      case 1: return name.trim().length > 0;
      case 2: return setsCount > 0;
      case 3: return true;
      default: return false;
    }
  }, [step, exerciseType, name, setsCount]);

  const handleSelectExisting = (exercise: ExerciseDefinition) => {
    setSelectedExercise(exercise);
    setName(exercise.name);
    setExerciseType(exercise.type);
    lightHaptic();
    // Skip type and name steps, go straight to sets count
    setStep(2);
  };

  const handleCreateNew = () => {
    setSelectedExercise(null);
    setName(searchQuery);
    lightHaptic();
    setStep(0);
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
    } else if (step === 0) {
      if (allExercises.length > 0) {
        setStep(-1);
      } else {
        router.back();
      }
    } else if (selectedExercise && step === 2) {
      // Came from picker, go back to picker
      setSelectedExercise(null);
      setExerciseType(undefined);
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
    const exerciseDef = getOrCreate(trimmedName, exerciseType);

    if (isActiveWorkout || source === 'edit-log') {
      const exercise: Exercise = {
        id: generateId(),
        exerciseId: exerciseDef.id,
        name: trimmedName,
        type: exerciseType,
        sets: createDefaultSets(exerciseType, setsCount),
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
        order: useTemplateCreateStore.getState().exercises.length,
        restTimeSeconds: restTime,
        defaultSetsCount: setsCount,
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
              <X size={24} color={iconColor} />
            </Pressable>
            <Text className="text-base font-semibold">Add Exercise</Text>
            <View className="w-10" />
          </View>

          {/* Search */}
          <View className="px-4 pb-2">
            <View className="flex-row items-center rounded-xl border border-input bg-card px-3">
              <Search size={18} color="#9ca3af" />
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
                    {exerciseTypeLabel(item.type)}
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
      case 0:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-0" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">Exercise Type</Text>
            <Text className="mb-6 text-muted-foreground">What kind of exercise is this?</Text>
            <ExerciseTypeSelector selected={exerciseType} onSelect={setExerciseType} />
          </Animated.View>
        );
      case 1:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-1" className="flex-1">
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
      case 2:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-2" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">Number of Sets</Text>
            <Text className="mb-6 text-muted-foreground">How many sets for this exercise?</Text>
            <View className="items-center">
              <NumericInput value={setsCount} onValueChange={setSetsCount} min={1} max={20} />
            </View>
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View entering={FadeInRight} exiting={FadeOutLeft} key="step-3" className="flex-1">
            <Text className="mb-2 text-2xl font-bold">Rest Time</Text>
            <Text className="mb-6 text-muted-foreground">Rest between sets</Text>
            <RestTimerPresets selected={restTime} onSelect={setRestTime} />
          </Animated.View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <Pressable onPress={handleBack} className="h-10 w-10 items-center justify-center">
            <ChevronLeft size={24} color={iconColor} />
          </Pressable>
          <StepIndicator totalSteps={TOTAL_STEPS} currentStep={step} />
          <View className="w-10" />
        </View>

        {/* Content */}
        <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
          {renderStep()}
        </ScrollView>

        {/* Footer */}
        <View className="px-6 pb-4">
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Alert, TextInput, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Icon } from '@/components/ui/icon';
import Animated, { FadeInDown, FadeOutDown, Layout } from 'react-native-reanimated';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

import { SetRow } from '@/components/workout/set-row';
import { useEditLogStore } from '@/stores/edit-log-store';
import { useHistoryStore } from '@/stores/history-store';
import { useSettingsStore } from '@/stores/settings-store';
import { createDefaultSet, createEmptyLog, createLogFromTemplate } from '@/lib/defaults';
import { lightHaptic, mediumHaptic, successHaptic } from '@/lib/haptics';
import { useTemplateStore } from '@/stores/template-store';
import type { WorkoutLogExercise, WorkoutSet } from '@/lib/types';

export default function EditLogScreen() {
  const { id, date, templateId } = useLocalSearchParams<{ id: string; date?: string; templateId?: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const isNewLog = id === 'new';
  const logs = useHistoryStore((s) => s.logs);
  const updateLog = useHistoryStore((s) => s.updateLog);
  const addLog = useHistoryStore((s) => s.addLog);
  const originalLog = isNewLog ? undefined : logs.find((l) => l.id === id);
  const template = useTemplateStore((s) => templateId ? s.templates.find((t) => t.id === templateId) : undefined);

  const editingLog = useEditLogStore((s) => s.editingLog);
  const loadLog = useEditLogStore((s) => s.loadLog);
  const clearLog = useEditLogStore((s) => s.clearLog);
  const setTemplateName = useEditLogStore((s) => s.setTemplateName);
  const setStartedAt = useEditLogStore((s) => s.setStartedAt);
  const setCompletedAt = useEditLogStore((s) => s.setCompletedAt);
  const addExercise = useEditLogStore((s) => s.addExercise);
  const removeExercise = useEditLogStore((s) => s.removeExercise);
  const reorderExercises = useEditLogStore((s) => s.reorderExercises);
  const addSet = useEditLogStore((s) => s.addSet);
  const removeSet = useEditLogStore((s) => s.removeSet);
  const updateSet = useEditLogStore((s) => s.updateSet);
  const updateSetsFromIndex = useEditLogStore((s) => s.updateSetsFromIndex);
  const toggleSetComplete = useEditLogStore((s) => s.toggleSetComplete);

  // "Apply to all below" prompt — shown when user edits any set
  const [applyAllPrompt, setApplyAllPrompt] = useState<{
    exerciseId: string;
    setIndex: number;
    field: string;
    value: number;
    label: string;
  } | null>(null);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showCompletedPicker, setShowCompletedPicker] = useState(false);
  const [startPickerMode, setStartPickerMode] = useState<'date' | 'time'>('date');
  const [completedPickerMode, setCompletedPickerMode] = useState<'date' | 'time'>('date');

  useEffect(() => {
    if (isNewLog) {
      const targetDate = date ? new Date(date) : new Date();
      if (template) {
        loadLog(createLogFromTemplate(targetDate, template));
      } else {
        loadLog(createEmptyLog(targetDate));
      }
    } else if (originalLog) {
      loadLog(originalLog);
    }
    return () => clearLog();
  }, [isNewLog, originalLog?.id, template?.id]);

  const saveLog = () => {
    if (!editingLog) return;
    const duration = Math.max(
      0,
      Math.round(
        (new Date(editingLog.completedAt).getTime() -
          new Date(editingLog.startedAt).getTime()) /
          1000
      )
    );
    const logData = {
      templateName: editingLog.templateName.trim(),
      exercises: editingLog.exercises.map((e, i) => ({ ...e, order: i })),
      startedAt: editingLog.startedAt,
      completedAt: editingLog.completedAt,
      durationSeconds: duration,
    };

    if (isNewLog) {
      addLog({ ...editingLog, ...logData });
    } else {
      updateLog(editingLog.id, logData);
    }
    successHaptic();
    router.back();
  };

  const handleSave = () => {
    if (!editingLog) return;
    if (!editingLog.templateName.trim()) {
      Alert.alert('Error', 'Please enter a workout name');
      return;
    }

    const startDate = new Date(editingLog.startedAt);
    const endDate = new Date(editingLog.completedAt);

    if (endDate.getTime() < startDate.getTime()) {
      Alert.alert('Invalid Time', 'End time cannot be before start time.');
      return;
    }

    const spansMultipleDays =
      startDate.getFullYear() !== endDate.getFullYear() ||
      startDate.getMonth() !== endDate.getMonth() ||
      startDate.getDate() !== endDate.getDate();

    if (spansMultipleDays) {
      Alert.alert(
        'Multi-Day Workout',
        `This workout spans from ${format(startDate, 'MMM d')} to ${format(endDate, 'MMM d')}. Is that correct?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: saveLog },
        ]
      );
      return;
    }

    saveLog();
  };

  const handleAddSet = (exercise: WorkoutLogExercise) => {
    const newSet = createDefaultSet(exercise.type);
    addSet(exercise.id, newSet);
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    if (!editingLog) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editingLog.exercises.length) return;
    const exercises = [...editingLog.exercises];
    [exercises[index], exercises[targetIndex]] = [exercises[targetIndex], exercises[index]];
    reorderExercises(exercises);
    mediumHaptic();
  };

  const handleAddExercise = () => {
    router.push('/exercise/create?source=edit-log');
  };

  const handleStartDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (date && editingLog) {
      if (date.getTime() > new Date(editingLog.completedAt).getTime()) {
        Alert.alert('Invalid Time', 'Start time cannot be after end time.');
        return;
      }
      setStartedAt(date.toISOString());
      if (Platform.OS === 'android' && startPickerMode === 'date') {
        setStartPickerMode('time');
        setShowStartPicker(true);
      }
    }
  };

  const handleCompletedDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowCompletedPicker(false);
    if (date && editingLog) {
      if (date.getTime() < new Date(editingLog.startedAt).getTime()) {
        Alert.alert('Invalid Time', 'End time cannot be before start time.');
        return;
      }
      setCompletedAt(date.toISOString());
      if (Platform.OS === 'android' && completedPickerMode === 'date') {
        setCompletedPickerMode('time');
        setShowCompletedPicker(true);
      }
    }
  };

  if (!editingLog && !isNewLog) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Workout not found</Text>
      </SafeAreaView>
    );
  }

  if (!editingLog) return null;

  const totalSets = editingLog.exercises.reduce((t, e) => t + e.sets.length, 0);
  const completedSets = editingLog.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: isNewLog ? 'Log Workout' : 'Edit Workout',
          headerLeft: isNewLog
            ? () => (
                <Pressable
                  onPress={() => {
                    Alert.alert('Discard Workout?', 'This workout has not been saved yet.', [
                      { text: 'Keep Editing', style: 'cancel' },
                      {
                        text: 'Discard',
                        style: 'destructive',
                        onPress: () => router.back(),
                      },
                    ]);
                  }}
                >
                  <Text className="text-base text-primary">Cancel</Text>
                </Pressable>
              )
            : undefined,
          headerRight: () => (
            <Pressable onPress={handleSave}>
              <Text className="text-base font-semibold text-primary">Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-32"
        keyboardShouldPersistTaps="handled"
      >
        {/* Workout Name */}
        <Text className="mb-2 mt-4 text-sm font-medium text-muted-foreground">
          WORKOUT NAME
        </Text>
        <TextInput
          value={editingLog.templateName}
          onChangeText={setTemplateName}
          placeholder="e.g. Push Day"
          placeholderTextColor="#9ca3af"
          className="mb-6 rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
        />

        {/* Date/Time */}
        <Text className="mb-2 text-sm font-medium text-muted-foreground">
          STARTED AT
        </Text>
        <Pressable
          onPress={() => {
            setStartPickerMode('date');
            setShowStartPicker(true);
          }}
          className="mb-4 rounded-xl border border-input bg-card px-4 py-4"
        >
          <Text className="text-base text-foreground">
            {format(new Date(editingLog.startedAt), 'MMM d, yyyy h:mm a')}
          </Text>
        </Pressable>
        {showStartPicker && (
          <View className="mb-4">
            <DateTimePicker
              value={new Date(editingLog.startedAt)}
              mode={Platform.OS === 'ios' ? 'datetime' : startPickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleStartDateChange}
              themeVariant={isDark ? 'dark' : 'light'}
            />
            {Platform.OS === 'ios' && (
              <Pressable
                onPress={() => setShowStartPicker(false)}
                className="mt-2 items-center"
              >
                <Text className="text-sm font-medium text-primary">Done</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text className="mb-2 text-sm font-medium text-muted-foreground">
          COMPLETED AT
        </Text>
        <Pressable
          onPress={() => {
            setCompletedPickerMode('date');
            setShowCompletedPicker(true);
          }}
          className="mb-6 rounded-xl border border-input bg-card px-4 py-4"
        >
          <Text className="text-base text-foreground">
            {format(new Date(editingLog.completedAt), 'MMM d, yyyy h:mm a')}
          </Text>
        </Pressable>
        {showCompletedPicker && (
          <View className="mb-6">
            <DateTimePicker
              value={new Date(editingLog.completedAt)}
              mode={Platform.OS === 'ios' ? 'datetime' : completedPickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleCompletedDateChange}
              themeVariant={isDark ? 'dark' : 'light'}
            />
            {Platform.OS === 'ios' && (
              <Pressable
                onPress={() => setShowCompletedPicker(false)}
                className="mt-2 items-center"
              >
                <Text className="text-sm font-medium text-primary">Done</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Exercises */}
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-sm font-medium text-muted-foreground">
            EXERCISES
          </Text>
          <Badge variant="secondary">
            <Text className="text-xs">{completedSets}/{totalSets} sets</Text>
          </Badge>
        </View>

        {editingLog.exercises.map((exercise, exerciseIndex) => (
          <View key={exercise.id} className="mt-4">
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
                    disabled={exerciseIndex === editingLog.exercises.length - 1}
                    className="h-6 w-6 items-center justify-center"
                    style={{ opacity: exerciseIndex === editingLog.exercises.length - 1 ? 0.25 : 1 }}
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
                  <SetRow
                    set={set}
                    index={setIndex}
                    onUpdate={(updates) => {
                      updateSet(exercise.id, set.id, updates);
                      // Show "Apply to all below" when editing a set that has sets after it
                      if (setIndex >= exercise.sets.length - 1) return;
                      if ('weight' in updates && updates.weight !== undefined) {
                        setApplyAllPrompt({ exerciseId: exercise.id, setIndex, field: 'weight', value: updates.weight, label: `${updates.weight} ${weightUnit}` });
                      } else if ('reps' in updates && updates.reps !== undefined) {
                        setApplyAllPrompt({ exerciseId: exercise.id, setIndex, field: 'reps', value: updates.reps, label: `${updates.reps} reps` });
                      } else if ('distance' in updates && updates.distance !== undefined) {
                        setApplyAllPrompt({ exerciseId: exercise.id, setIndex, field: 'distance', value: updates.distance, label: `${updates.distance} ${distanceUnit}` });
                      }
                    }}
                    onToggleComplete={() => {
                      toggleSetComplete(exercise.id, set.id);
                      lightHaptic();
                    }}
                    onRemove={() => removeSet(exercise.id, set.id)}
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

    </>
  );
}

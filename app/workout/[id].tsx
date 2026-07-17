import React, { useEffect, useState } from 'react';
import { View, Pressable, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronUp, Dumbbell, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Icon } from '@/components/ui/icon';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

import { FocusLogger } from '@/components/workout/focus/focus-logger';
import { FocusGradient } from '@/components/workout/focus/focus-gradient';
import { useEditLogStore } from '@/stores/edit-log-store';
import { useHistoryStore } from '@/stores/history-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTemplateStore } from '@/stores/template-store';
import { createDefaultSet, createEmptyLog, createIntervalSet, createLogFromTemplate } from '@/lib/defaults';
import { generateId } from '@/lib/id';
import { successHaptic } from '@/lib/haptics';
import type { Exercise, WorkoutSet } from '@/lib/types';

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
  const template = useTemplateStore((s) => (templateId ? s.templates.find((t) => t.id === templateId) : undefined));

  const editingLog = useEditLogStore((s) => s.editingLog);
  const loadLog = useEditLogStore((s) => s.loadLog);
  const clearLog = useEditLogStore((s) => s.clearLog);
  const setTemplateName = useEditLogStore((s) => s.setTemplateName);
  const setStartedAt = useEditLogStore((s) => s.setStartedAt);
  const setCompletedAt = useEditLogStore((s) => s.setCompletedAt);
  const removeExercise = useEditLogStore((s) => s.removeExercise);
  const moveExercise = useEditLogStore((s) => s.moveExercise);
  const addExerciseMetric = useEditLogStore((s) => s.addExerciseMetric);
  const removeExerciseMetric = useEditLogStore((s) => s.removeExerciseMetric);
  const addSet = useEditLogStore((s) => s.addSet);
  const removeSet = useEditLogStore((s) => s.removeSet);
  const updateSet = useEditLogStore((s) => s.updateSet);
  const toggleSetComplete = useEditLogStore((s) => s.toggleSetComplete);
  const updateSetsFromIndex = useEditLogStore((s) => s.updateSetsFromIndex);

  const [showDetails, setShowDetails] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showCompletedPicker, setShowCompletedPicker] = useState(false);
  const [startPickerMode, setStartPickerMode] = useState<'date' | 'time'>('date');
  const [completedPickerMode, setCompletedPickerMode] = useState<'date' | 'time'>('date');

  useEffect(() => {
    if (isNewLog) {
      const targetDate = date ? new Date(date) : new Date();
      loadLog(template ? createLogFromTemplate(targetDate, template) : createEmptyLog(targetDate));
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
        (new Date(editingLog.completedAt).getTime() - new Date(editingLog.startedAt).getTime()) / 1000
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

  const handleStartDateChange = (_: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShowStartPicker(false);
    if (picked && editingLog) {
      if (picked.getTime() > new Date(editingLog.completedAt).getTime()) {
        Alert.alert('Invalid Time', 'Start time cannot be after end time.');
        return;
      }
      setStartedAt(picked.toISOString());
      if (Platform.OS === 'android' && startPickerMode === 'date') {
        setStartPickerMode('time');
        setShowStartPicker(true);
      }
    }
  };

  const handleCompletedDateChange = (_: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShowCompletedPicker(false);
    if (picked && editingLog) {
      if (picked.getTime() < new Date(editingLog.startedAt).getTime()) {
        Alert.alert('Invalid Time', 'End time cannot be before start time.');
        return;
      }
      setCompletedAt(picked.toISOString());
      if (Platform.OS === 'android' && completedPickerMode === 'date') {
        setCompletedPickerMode('time');
        setShowCompletedPicker(true);
      }
    }
  };

  const confirmCancel = () => {
    Alert.alert('Discard Workout?', 'This workout has not been saved yet.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (!editingLog && !isNewLog) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Workout not found</Text>
      </SafeAreaView>
    );
  }

  if (!editingLog) return null;

  const exercises = editingLog.exercises;
  const startedLabel = format(new Date(editingLog.startedAt), 'MMM d, yyyy h:mm a');

  return (
    <>
      {/* No native header: it would paint an opaque band over the top glow.
          A custom bar lets FocusGradient bleed from the true top, matching
          the active logger. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']} testID="workout-edit-screen">
        <FocusGradient />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          {/* Top bar */}
          <View className="flex-row items-center gap-3 px-4 pb-1 pt-1">
            <Pressable
              onPress={isNewLog ? confirmCancel : () => router.back()}
              accessibilityRole="button"
              accessibilityLabel={isNewLog ? 'Discard workout' : 'Back'}
              className="h-9 w-9 items-center justify-center rounded-xl border border-border"
            >
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
            <Text className="text-base font-semibold text-foreground">
              {isNewLog ? 'Log Workout' : 'Edit Workout'}
            </Text>
            <Pressable
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityLabel="Save workout"
              testID="edit-workout-save"
              className="ml-auto rounded-lg bg-primary px-4 py-1.5"
            >
              <Text className="text-xs font-semibold text-primary-foreground">Save</Text>
            </Pressable>
          </View>

          {/* Details — collapsed by default so the logger stays the focus. */}
          <Pressable
            onPress={() => setShowDetails((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showDetails ? 'Hide workout details' : 'Show workout details'}
            accessibilityState={{ expanded: showDetails }}
            className="flex-row items-center gap-2 px-4 py-2"
          >
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {editingLog.templateName || 'Untitled workout'}
              </Text>
              <Text className="text-xs text-muted-foreground">{startedLabel}</Text>
            </View>
            <Icon as={showDetails ? ChevronUp : ChevronDown} size={18} className="text-muted-foreground" />
          </Pressable>

          {showDetails && (
            <ScrollView className="max-h-[340px]" contentContainerClassName="px-4 pb-3" keyboardShouldPersistTaps="handled">
              <Text className="mb-2 text-sm font-medium text-muted-foreground">WORKOUT NAME</Text>
              <Input
                value={editingLog.templateName}
                onChangeText={setTemplateName}
                placeholder="e.g. Push Day"
                className="mb-4"
              />

              <Text className="mb-2 text-sm font-medium text-muted-foreground">STARTED AT</Text>
              <Pressable
                onPress={() => {
                  setStartPickerMode('date');
                  setShowStartPicker(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Change start time"
                className="mb-4 h-14 justify-center rounded-xl border border-input bg-card px-4"
              >
                <Text className="text-base text-foreground">{startedLabel}</Text>
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
                    <Pressable onPress={() => setShowStartPicker(false)} className="mt-2 items-center">
                      <Text className="text-sm font-medium text-primary">Done</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <Text className="mb-2 text-sm font-medium text-muted-foreground">COMPLETED AT</Text>
              <Pressable
                onPress={() => {
                  setCompletedPickerMode('date');
                  setShowCompletedPicker(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Change end time"
                className="mb-2 h-14 justify-center rounded-xl border border-input bg-card px-4"
              >
                <Text className="text-base text-foreground">
                  {format(new Date(editingLog.completedAt), 'MMM d, yyyy h:mm a')}
                </Text>
              </Pressable>
              {showCompletedPicker && (
                <View className="mb-2">
                  <DateTimePicker
                    value={new Date(editingLog.completedAt)}
                    mode={Platform.OS === 'ios' ? 'datetime' : completedPickerMode}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleCompletedDateChange}
                    themeVariant={isDark ? 'dark' : 'light'}
                  />
                  {Platform.OS === 'ios' && (
                    <Pressable onPress={() => setShowCompletedPicker(false)} className="mt-2 items-center">
                      <Text className="text-sm font-medium text-primary">Done</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </ScrollView>
          )}

          {exercises.length === 0 ? (
            <View className="flex-1 items-center justify-center gap-4 px-8">
              <Icon as={Dumbbell} size={40} className="text-muted-foreground" />
              <Text className="text-center text-lg font-semibold text-foreground">No exercises</Text>
              <Text className="text-center text-sm text-muted-foreground">Add an exercise to start logging.</Text>
              <Pressable
                onPress={() => router.push('/exercise/create?source=edit-log')}
                accessibilityRole="button"
                accessibilityLabel="Add exercise"
                className="mt-2 rounded-xl bg-primary px-6 py-3"
              >
                <Text className="font-semibold text-primary-foreground">Add exercise</Text>
              </Pressable>
            </View>
          ) : (
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
              onAddExercise={() => router.push('/exercise/create?source=edit-log')}
              // Editing an existing log: the CTA toggles the set instead of
              // marching to the next one, and there's no "workout finished".
              autoAdvance={false}
              completeLabel="Mark set logged"
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

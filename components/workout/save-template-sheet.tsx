import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { generateId } from '@/lib/id';
import { successHaptic } from '@/lib/haptics';
import { suggestedTemplateName, workoutToTemplateExercises } from '@/lib/workout-to-template';
import { useTemplateStore } from '@/stores/template-store';
import { useWorkoutStore } from '@/stores/workout-store';

interface SaveTemplateSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * "Save as template" prompt for the active workout. Captures the current
 * exercises (order, metrics, set count, rest, last-completed-set suggestions)
 * into a named template via the template store, whose create already routes
 * through the offline sync queue (lib/convex-sync.ts).
 */
export function SaveTemplateSheet({ visible, onClose }: SaveTemplateSheetProps) {
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const [name, setName] = useState('');

  // Re-prefill each time the sheet opens (the workout name may be stale from
  // a previous open).
  useEffect(() => {
    if (!visible) return;
    const workout = useWorkoutStore.getState().activeWorkout;
    setName(workout ? suggestedTemplateName(workout) : '');
  }, [visible]);

  const exerciseCount = activeWorkout?.exercises.length ?? 0;

  const handleSave = () => {
    const workout = useWorkoutStore.getState().activeWorkout;
    if (!workout || workout.exercises.length === 0) {
      onClose();
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name your template', 'Please enter a template name.');
      return;
    }
    addTemplate(trimmed, workoutToTemplateExercises(workout.exercises, generateId));
    successHaptic();
    // Confirm on top of the sheet, then close — an alert fired mid-dismissal
    // can be swallowed on iOS.
    Alert.alert(
      'Template saved',
      `“${trimmed}” was added to your templates.`,
      [{ text: 'OK', onPress: onClose }],
      { cancelable: false }
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
        testID="save-template-sheet"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Text className="text-xl font-bold">Save as template</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="save-template-close"
            className="h-11 w-11 items-center justify-center"
          >
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        <View className="flex-1 px-4 pt-4">
          <Text className="mb-2 text-sm font-medium text-muted-foreground" nativeID="save-template-name-label">
            TEMPLATE NAME
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Push Day"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
            accessibilityLabel="Template name"
            testID="save-template-name-input"
          />
          <Text className="mt-3 text-sm text-muted-foreground">
            Saves {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} with their set
            counts and rest times. Weights and reps from your last completed sets become the
            template&apos;s suggestions.
          </Text>
        </View>

        {/* Save CTA */}
        <View className="px-4 pb-6">
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="Save template"
            testID="save-template-save"
            className="h-14 items-center justify-center rounded-2xl bg-primary"
          >
            <Text className="text-base font-bold text-primary-foreground">Save template</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

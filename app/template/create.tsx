import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter, Stack } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { ExerciseRow } from '@/components/workout/exercise-row';
import { useTemplateStore } from '@/stores/template-store';
import { useTemplateCreateStore } from '@/stores/exercise-draft-store';
import { lightHaptic } from '@/lib/haptics';

export default function CreateTemplateScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#f2f2f2' : '#1c1008';

  const [name, setName] = useState('');
  const exercises = useTemplateCreateStore((s) => s.exercises);
  const removeExercise = useTemplateCreateStore((s) => s.removeExercise);
  const clearExercises = useTemplateCreateStore((s) => s.clearExercises);
  const addTemplate = useTemplateStore((s) => s.addTemplate);

  useEffect(() => {
    clearExercises();
  }, []);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a template name');
      return;
    }
    if (exercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise');
      return;
    }
    addTemplate(name.trim(), exercises);
    clearExercises();
    lightHaptic();
    router.back();
  };

  const handleAddExercise = () => {
    router.push('/exercise/create');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Template',
          headerRight: () => (
            <Pressable onPress={handleSave}>
              <Text className="text-base font-semibold text-primary">Save</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-background">
        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* Template Name */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">TEMPLATE NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Push Day"
            placeholderTextColor="#9ca3af"
            autoFocus
            className="mb-6 rounded-xl border border-input bg-card px-4 py-4 text-lg text-foreground"
          />

          {/* Exercises */}
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-muted-foreground">EXERCISES</Text>
            <Text className="text-sm text-muted-foreground">{exercises.length} total</Text>
          </View>

          {exercises.length === 0 ? (
            <View className="items-center rounded-xl border border-dashed border-border py-12">
              <Text className="text-muted-foreground">No exercises yet</Text>
              <Text className="mt-1 text-sm text-muted-foreground">Tap the button below to add one</Text>
            </View>
          ) : (
            <View className="gap-1 rounded-xl border border-border bg-card px-3">
              {exercises.map((exercise, index) => (
                <View key={exercise.id} className="flex-row items-center">
                  <View className="flex-1">
                    <ExerciseRow exercise={exercise} index={index} />
                  </View>
                  <Pressable
                    onPress={() => {
                      lightHaptic();
                      removeExercise(exercise.id);
                    }}
                    className="h-8 w-8 items-center justify-center"
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Add Exercise Button */}
          <Pressable
            onPress={handleAddExercise}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-4"
          >
            <Plus size={20} color={isDark ? '#fb923c' : '#f97316'} />
            <Text className="font-medium text-primary">Add Exercise</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

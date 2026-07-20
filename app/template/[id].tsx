import { Text } from "@/components/ui/text";
import { Input } from '@/components/ui/input';
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { ExerciseRow } from "@/components/workout/exercise-row";
import { lightHaptic } from "@/lib/haptics";
import { useTemplateCreateStore } from "@/stores/exercise-draft-store";
import { useTemplateStore } from "@/stores/template-store";

export default function EditTemplateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const template = useTemplateStore((s) =>
    s.templates.find((t) => t.id === id),
  );
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const exercises = useTemplateCreateStore((s) => s.exercises);
  const removeExercise = useTemplateCreateStore((s) => s.removeExercise);
  const setExercises = useTemplateCreateStore((s) => s.setExercises);
  const reorderExercises = useTemplateCreateStore((s) => s.reorderExercises);
  const clearExercises = useTemplateCreateStore((s) => s.clearExercises);

  const moveExercise = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= exercises.length) return;
    const next = [...exercises];
    [next[index], next[target]] = [next[target], next[index]];
    lightHaptic();
    reorderExercises(next);
  };

  const [name, setName] = useState("");

  useEffect(() => {
    if (template) {
      setName(template.name);
      setExercises(template.exercises);
    }
    return () => clearExercises();
  }, [template?.id]);

  const handleSave = () => {
    if (!id) return;
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a template name");
      return;
    }
    updateTemplate(id, { name: name.trim(), exercises });
    lightHaptic();
    router.back();
  };

  const handleAddExercise = () => {
    router.push("/exercise/create");
  };

  if (!template) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">Template not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Template",
          headerRight: () => (
            <Pressable onPress={handleSave}>
              <Text className="text-base font-semibold text-primary">Save</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-background"
      >
        <ScrollView
          className="flex-1 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="mb-2 text-sm font-medium text-muted-foreground">
            TEMPLATE NAME
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Push Day"
            className="mb-6"
          />

          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-muted-foreground">
              EXERCISES
            </Text>
            <Text className="text-sm text-muted-foreground">
              {exercises.length} total
            </Text>
          </View>

          {exercises.length === 0 ? (
            <View className="items-center rounded-xl border border-dashed border-border py-12">
              <Text className="text-muted-foreground">No exercises</Text>
            </View>
          ) : (
            <View className="gap-1 rounded-xl border border-border bg-card px-3">
              {exercises.map((exercise, index) => {
                const isFirst = index === 0;
                const isLast = index === exercises.length - 1;
                const chevronColor = isDark ? "#a1a1aa" : "#71717a";
                const disabledColor = isDark ? "#3f3f46" : "#d4d4d8";
                return (
                  <View key={exercise.id} className="flex-row items-center">
                    <View className="flex-1">
                      <ExerciseRow exercise={exercise} index={index} />
                    </View>
                    <Pressable
                      onPress={() => moveExercise(index, -1)}
                      disabled={isFirst}
                      accessibilityRole="button"
                      accessibilityLabel="Move exercise up"
                      accessibilityState={{ disabled: isFirst }}
                      className="h-11 w-11 items-center justify-center"
                    >
                      <ChevronUp
                        size={20}
                        color={isFirst ? disabledColor : chevronColor}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => moveExercise(index, 1)}
                      disabled={isLast}
                      accessibilityRole="button"
                      accessibilityLabel="Move exercise down"
                      accessibilityState={{ disabled: isLast }}
                      className="h-11 w-11 items-center justify-center"
                    >
                      <ChevronDown
                        size={20}
                        color={isLast ? disabledColor : chevronColor}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        lightHaptic();
                        removeExercise(exercise.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove exercise"
                      className="h-11 w-11 items-center justify-center"
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={handleAddExercise}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-4"
          >
            <Plus size={20} color={isDark ? "#fb923c" : "#f97316"} />
            <Text className="font-medium text-primary">Add Exercise</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

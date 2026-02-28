import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { lightHaptic } from '@/lib/haptics';
import { useRecipeStore } from '@/stores/recipe-store';
import type { Ingredient, Macros } from '@/lib/types';

interface IngredientDraft extends Ingredient {
  key: string;
  showMacros: boolean;
}

let keyCounter = 0;
function nextKey() {
  return `ing-${++keyCounter}`;
}

function emptyIngredient(): IngredientDraft {
  return { key: nextKey(), name: '', amount: '', unit: '', showMacros: false };
}

export default function CreateRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ recipeId?: string }>();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#f2f2f2' : '#1c1008';
  const primaryColor = isDark ? '#fb923c' : '#f97316';

  const addRecipe = useRecipeStore((s) => s.addRecipe);
  const updateRecipe = useRecipeStore((s) => s.updateRecipe);
  const getRecipe = useRecipeStore((s) => s.getRecipe);

  const isEditing = !!params.recipeId;
  const existingRecipe = isEditing ? getRecipe(params.recipeId!) : undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [servings, setServings] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [tags, setTags] = useState('');

  // Pre-populate when editing
  useEffect(() => {
    if (existingRecipe) {
      setTitle(existingRecipe.title);
      setDescription(existingRecipe.description);
      setNotes(existingRecipe.notes ?? '');
      setIngredients(
        existingRecipe.ingredients.length > 0
          ? existingRecipe.ingredients.map((ing) => ({
              ...ing,
              key: nextKey(),
              showMacros: !!ing.macros,
            }))
          : [emptyIngredient()]
      );
      setInstructions(
        existingRecipe.instructions.length > 0
          ? existingRecipe.instructions
          : ['']
      );
      setServings(existingRecipe.servings?.toString() ?? '');
      setPrepTime(existingRecipe.prepTimeMinutes?.toString() ?? '');
      setCookTime(existingRecipe.cookTimeMinutes?.toString() ?? '');
      setTags(existingRecipe.tags?.join(', ') ?? '');
    }
  }, [existingRecipe?.id]);

  // Auto-calculate macros from ingredients
  const calculatedMacros = useMemo((): Macros | undefined => {
    let hasMacros = false;
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    for (const ing of ingredients) {
      if (ing.macros) {
        hasMacros = true;
        calories += ing.macros.calories;
        protein += ing.macros.protein;
        carbs += ing.macros.carbs;
        fat += ing.macros.fat;
      }
    }
    if (!hasMacros) return undefined;
    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    };
  }, [ingredients]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a recipe title');
      return;
    }

    const cleanIngredients: Ingredient[] = ingredients
      .filter((ing) => ing.name.trim())
      .map(({ key, showMacros, ...rest }) => ({
        ...rest,
        macros: rest.macros?.calories ? rest.macros : undefined,
      }));

    const cleanInstructions = instructions.filter((s) => s.trim());
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const recipeData = {
      title: title.trim(),
      description: description.trim(),
      notes: notes.trim() || undefined,
      ingredients: cleanIngredients,
      instructions: cleanInstructions,
      servings: servings ? parseInt(servings, 10) : undefined,
      prepTimeMinutes: prepTime ? parseInt(prepTime, 10) : undefined,
      cookTimeMinutes: cookTime ? parseInt(cookTime, 10) : undefined,
      macros: calculatedMacros,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
    };

    if (isEditing && params.recipeId) {
      updateRecipe(params.recipeId, recipeData);
    } else {
      addRecipe(recipeData);
    }

    lightHaptic();
    router.back();
  };

  const updateIngredient = (index: number, updates: Partial<IngredientDraft>) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, ...updates } : ing))
    );
  };

  const updateIngredientMacros = (index: number, field: keyof Macros, value: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const current = ing.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
        return {
          ...ing,
          macros: { ...current, [field]: parseFloat(value) || 0 },
        };
      })
    );
  };

  const removeIngredient = (index: number) => {
    lightHaptic();
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const addIngredientRow = () => {
    lightHaptic();
    setIngredients((prev) => [...prev, emptyIngredient()]);
  };

  const addInstructionStep = () => {
    lightHaptic();
    setInstructions((prev) => [...prev, '']);
  };

  const removeInstructionStep = (index: number) => {
    lightHaptic();
    setInstructions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Recipe' : 'New Recipe',
          headerRight: () => (
            <Pressable onPress={handleSave}>
              <Text className="text-base font-semibold text-primary">Save</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
      >
        <ScrollView
          className="flex-1 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">TITLE</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. High-Protein Chicken Bowl"
            placeholderTextColor="#9ca3af"
            autoFocus={!isEditing}
            className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
          />

          {/* Description */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">DESCRIPTION</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of the recipe"
            placeholderTextColor="#9ca3af"
            multiline
            className="mb-4 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
            style={{ minHeight: 60 }}
          />

          {/* Notes */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">NOTES</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Personal notes (optional)"
            placeholderTextColor="#9ca3af"
            multiline
            className="mb-4 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
            style={{ minHeight: 50 }}
          />

          {/* Quick Settings Row */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="mb-2 text-sm font-medium text-muted-foreground">SERVINGS</Text>
              <TextInput
                value={servings}
                onChangeText={setServings}
                placeholder="e.g. 4"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-4 py-3 text-foreground"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-2 text-sm font-medium text-muted-foreground">PREP (min)</Text>
              <TextInput
                value={prepTime}
                onChangeText={setPrepTime}
                placeholder="e.g. 15"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-4 py-3 text-foreground"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-2 text-sm font-medium text-muted-foreground">COOK (min)</Text>
              <TextInput
                value={cookTime}
                onChangeText={setCookTime}
                placeholder="e.g. 30"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-4 py-3 text-foreground"
              />
            </View>
          </View>

          {/* Ingredients */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-muted-foreground">INGREDIENTS</Text>
            <Text className="text-sm text-muted-foreground">
              {ingredients.filter((i) => i.name.trim()).length} total
            </Text>
          </View>

          {ingredients.length === 0 ? (
            <View className="items-center rounded-xl border border-dashed border-border py-8 mb-2">
              <Text className="text-muted-foreground">No ingredients yet</Text>
            </View>
          ) : (
            <View className="gap-2 mb-2">
              {ingredients.map((ing, index) => (
                <View key={ing.key} className="rounded-xl border border-border bg-card p-3">
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={ing.name}
                      onChangeText={(v) => updateIngredient(index, { name: v })}
                      placeholder="Ingredient name"
                      placeholderTextColor="#9ca3af"
                      className="flex-1 text-foreground"
                    />
                    <Pressable onPress={() => removeIngredient(index)} className="p-1">
                      <Trash2 size={16} color="#ef4444" />
                    </Pressable>
                  </View>
                  <View className="flex-row items-center gap-2 mt-2">
                    <TextInput
                      value={ing.amount}
                      onChangeText={(v) => updateIngredient(index, { amount: v })}
                      placeholder="Amount"
                      placeholderTextColor="#9ca3af"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <TextInput
                      value={ing.unit ?? ''}
                      onChangeText={(v) => updateIngredient(index, { unit: v })}
                      placeholder="Unit (g, cups...)"
                      placeholderTextColor="#9ca3af"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </View>

                  {/* Per-ingredient macros toggle */}
                  <Pressable
                    onPress={() => updateIngredient(index, { showMacros: !ing.showMacros })}
                    className="flex-row items-center gap-1 mt-2"
                  >
                    {ing.showMacros ? (
                      <ChevronUp size={14} color={primaryColor} />
                    ) : (
                      <ChevronDown size={14} color={primaryColor} />
                    )}
                    <Text className="text-xs text-primary">
                      {ing.showMacros ? 'Hide macros' : 'Add macros'}
                    </Text>
                  </Pressable>

                  {ing.showMacros && (
                    <View className="flex-row gap-2 mt-2">
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Cal</Text>
                        <TextInput
                          value={ing.macros?.calories?.toString() ?? ''}
                          onChangeText={(v) => updateIngredientMacros(index, 'calories', v)}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Protein</Text>
                        <TextInput
                          value={ing.macros?.protein?.toString() ?? ''}
                          onChangeText={(v) => updateIngredientMacros(index, 'protein', v)}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Carbs</Text>
                        <TextInput
                          value={ing.macros?.carbs?.toString() ?? ''}
                          onChangeText={(v) => updateIngredientMacros(index, 'carbs', v)}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Fat</Text>
                        <TextInput
                          value={ing.macros?.fat?.toString() ?? ''}
                          onChangeText={(v) => updateIngredientMacros(index, 'fat', v)}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={addIngredientRow}
            className="mb-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
          >
            <Plus size={18} color={primaryColor} />
            <Text className="font-medium text-primary">Add Ingredient</Text>
          </Pressable>

          {/* Auto-calculated macros */}
          {calculatedMacros && (
            <View className="mb-4 rounded-xl border border-border bg-card p-4">
              <Text className="mb-2 text-sm font-semibold">
                Total Nutrition {servings ? `(${servings} servings)` : ''}
              </Text>
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-lg font-bold">{calculatedMacros.calories}</Text>
                  <Text className="text-xs text-muted-foreground">calories</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold" style={{ color: primaryColor }}>
                    {calculatedMacros.protein}g
                  </Text>
                  <Text className="text-xs text-muted-foreground">protein</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold">{calculatedMacros.carbs}g</Text>
                  <Text className="text-xs text-muted-foreground">carbs</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold">{calculatedMacros.fat}g</Text>
                  <Text className="text-xs text-muted-foreground">fat</Text>
                </View>
              </View>
              {servings && parseInt(servings, 10) > 1 && (
                <View className="mt-2 pt-2 border-t border-border">
                  <Text className="text-xs text-muted-foreground text-center">
                    Per serving: {Math.round(calculatedMacros.calories / parseInt(servings, 10))} cal · {Math.round(calculatedMacros.protein / parseInt(servings, 10))}g protein · {Math.round(calculatedMacros.carbs / parseInt(servings, 10))}g carbs · {Math.round(calculatedMacros.fat / parseInt(servings, 10))}g fat
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Instructions */}
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-medium text-muted-foreground">INSTRUCTIONS</Text>
            <Text className="text-sm text-muted-foreground">
              {instructions.filter((s) => s.trim()).length} steps
            </Text>
          </View>

          {instructions.map((step, index) => (
            <View key={index} className="flex-row items-start gap-2 mb-2">
              <View
                className="h-6 w-6 items-center justify-center rounded-full mt-3"
                style={{ backgroundColor: primaryColor }}
              >
                <Text className="text-xs font-bold text-white">{index + 1}</Text>
              </View>
              <TextInput
                value={step}
                onChangeText={(v) =>
                  setInstructions((prev) =>
                    prev.map((s, i) => (i === index ? v : s))
                  )
                }
                placeholder={`Step ${index + 1}`}
                placeholderTextColor="#9ca3af"
                multiline
                className="flex-1 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
              />
              {instructions.length > 1 && (
                <Pressable
                  onPress={() => removeInstructionStep(index)}
                  className="p-2 mt-2"
                >
                  <Trash2 size={16} color="#ef4444" />
                </Pressable>
              )}
            </View>
          ))}

          <Pressable
            onPress={addInstructionStep}
            className="mb-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
          >
            <Plus size={18} color={primaryColor} />
            <Text className="font-medium text-primary">Add Step</Text>
          </Pressable>

          {/* Tags */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">TAGS</Text>
          <TextInput
            value={tags}
            onChangeText={setTags}
            placeholder="e.g. high-protein, meal-prep, quick"
            placeholderTextColor="#9ca3af"
            className="mb-8 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
          />

          {/* Bottom padding */}
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

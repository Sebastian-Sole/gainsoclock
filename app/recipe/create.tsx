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
import { Input } from '@/components/ui/input';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { Plus, Trash2, ChevronDown, ChevronUp, Lock, BookOpen, ScanText } from 'lucide-react-native';
import { capture } from '@/lib/analytics';
import { lightHaptic } from '@/lib/haptics';
import { useRecipeStore } from '@/stores/recipe-store';
import { useIngredientStore } from '@/stores/ingredient-store';
import { IngredientLibraryModal } from '@/components/nutrition/ingredient-library-modal';
import { RecipeScanSheet } from '@/components/nutrition/recipe-scan-sheet';
import { scalePer100gMacros } from '@/lib/ingredient-macros';
import { normalizeQuantity, scannedIngredientMacros } from '@/lib/recipe-scan';
import type { ScannedRecipe } from '@/lib/recipe-scan';
import type { Ingredient, Macros, SavedIngredient } from '@/lib/types';
import { parseLocaleNumber } from '@/lib/format';

const SOURCE_TAGS = ['AI Generated', 'User Created'];

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
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showScanSheet, setShowScanSheet] = useState(false);
  // Total macros printed on a scanned source (label/PDF). Used as a fallback
  // when no per-ingredient macros exist to auto-calculate from.
  const [scannedMacros, setScannedMacros] = useState<Macros | undefined>(undefined);
  const savedIngredients = useIngredientStore((s) => s.ingredients);

  // Raw text for macro fields while they're being edited, keyed by
  // `${ingredientKey}:${field}`. Macros are stored as numbers, which can't
  // represent "empty", so without this a cleared field snaps back to "0" and
  // can't be cleared. While editing we show this text (which may be empty); on
  // blur we drop it and fall back to the stored number.
  const [macroText, setMacroText] = useState<Record<string, string>>({});

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
      setTags(existingRecipe.tags?.filter((t) => !SOURCE_TAGS.includes(t)).join(', ') ?? '');
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

  // Prefer macros calculated from ingredient rows; fall back to totals that
  // were printed on a scanned source. Still fully editable via ingredients.
  const effectiveMacros = calculatedMacros ?? scannedMacros;

  // Pre-fill the form from a scanned recipe. Nothing is saved until the user
  // reviews the fields and taps Save (the normal create path).
  const applyScannedRecipe = (recipe: ScannedRecipe) => {
    setShowScanSheet(false);
    setTitle(recipe.title);
    setServings(recipe.servings !== null ? String(recipe.servings) : '');
    setIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((ing) => {
            // Best-effort: map onto the saved ingredient library by name so
            // gram-quantified matches get macros pre-filled.
            const macros = scannedIngredientMacros(ing, savedIngredients);
            return {
              key: nextKey(),
              name: ing.name,
              amount: normalizeQuantity(ing.quantity),
              unit: ing.unit ?? '',
              macros: macros ?? undefined,
              showMacros: !!macros,
            };
          })
        : [emptyIngredient()]
    );
    setInstructions(recipe.steps.length > 0 ? recipe.steps : ['']);
    setScannedMacros(recipe.macros ?? undefined);
    lightHaptic();
  };

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a recipe title');
      return;
    }

    const cleanIngredients: Ingredient[] = ingredients
      .filter((ing) => ing.name.trim())
      .map(({ key, showMacros, ...rest }) => ({
        ...rest,
        macros: rest.macros?.calories != null && rest.macros.calories !== 0 ? rest.macros
          : (rest.macros?.protein || rest.macros?.carbs || rest.macros?.fat) ? rest.macros
          : undefined,
      }));

    const cleanInstructions = instructions.filter((s) => s.trim());
    const userTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !SOURCE_TAGS.includes(t));

    // Preserve source tags from the existing recipe when editing
    const sourceTags = isEditing && existingRecipe?.tags
      ? existingRecipe.tags.filter((t) => SOURCE_TAGS.includes(t))
      : [];
    const parsedTags = [...sourceTags, ...userTags];

    const recipeData = {
      title: title.trim(),
      description: description.trim(),
      notes: notes.trim() || undefined,
      ingredients: cleanIngredients,
      instructions: cleanInstructions,
      servings: servings ? parseInt(servings, 10) || 1 : undefined,
      prepTimeMinutes: prepTime ? parseInt(prepTime, 10) || undefined : undefined,
      cookTimeMinutes: cookTime ? parseInt(cookTime, 10) || undefined : undefined,
      macros: effectiveMacros,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
    };

    if (isEditing && params.recipeId) {
      updateRecipe(params.recipeId, recipeData);
    } else {
      addRecipe(recipeData);
      capture({
        name: 'recipe_created',
        props: {
          ingredientCount: cleanIngredients.length,
          hasMacros: effectiveMacros !== undefined,
        },
      });
    }

    lightHaptic();
    router.back();
  };

  const updateIngredient = (index: number, updates: Partial<IngredientDraft>) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, ...updates } : ing))
    );
  };

  const macroFieldKey = (ingKey: string, field: keyof Macros) => `${ingKey}:${field}`;

  const handleMacroChange = (index: number, field: keyof Macros, value: string) => {
    const key = macroFieldKey(ingredients[index].key, field);
    setMacroText((prev) => ({ ...prev, [key]: value }));
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const current = ing.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
        return {
          ...ing,
          macros: { ...current, [field]: parseLocaleNumber(value) || 0 },
        };
      })
    );
  };

  // On blur, drop the raw text so the field falls back to the stored number
  // (an empty field shows "0" — the value it was coerced to while editing).
  const handleMacroBlur = (index: number, field: keyof Macros) => {
    const key = macroFieldKey(ingredients[index].key, field);
    setMacroText((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const macroFieldValue = (ing: IngredientDraft, field: keyof Macros) =>
    macroText[macroFieldKey(ing.key, field)] ?? (ing.macros?.[field]?.toString() ?? '');

  const removeIngredient = (index: number) => {
    lightHaptic();
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const addIngredientRow = () => {
    lightHaptic();
    setIngredients((prev) => [...prev, emptyIngredient()]);
  };

  // Insert a row from the saved ingredient library: absolute macros for the
  // amount used, computed from the library's per-100g values.
  const addIngredientFromLibrary = (saved: SavedIngredient, grams: number) => {
    const macros = scalePer100gMacros(saved.per100g, grams);
    const row: IngredientDraft = {
      key: nextKey(),
      name: saved.name,
      amount: String(grams),
      unit: 'g',
      macros: macros ?? undefined,
      showMacros: !!macros,
    };
    setIngredients((prev) => {
      // Replace a single untouched empty row (the initial placeholder).
      if (prev.length === 1 && !prev[0].name.trim() && !prev[0].amount.trim()) {
        return [row];
      }
      return [...prev, row];
    });
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
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Scan / import entry point */}
          {!isEditing && (
            <Pressable
              onPress={() => {
                lightHaptic();
                setShowScanSheet(true);
              }}
              className="mb-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
              accessibilityRole="button"
              accessibilityLabel="Scan a recipe from a photo or PDF"
              accessibilityHint="Pre-fills this form; you review before saving"
              testID="recipe-scan-open"
            >
              <Icon as={ScanText} size={18} className="text-primary" />
              <Text className="font-medium text-primary">Scan from Photo or PDF</Text>
            </Pressable>
          )}

          {/* Title */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">TITLE</Text>
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. High-Protein Chicken Bowl"
            autoFocus={!isEditing}
            className="mb-4"
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
                      className="flex-1 py-1.5 text-[16px] text-foreground"
                    />
                    <Pressable onPress={() => removeIngredient(index)} className="p-1">
                      <Icon as={Trash2} size={16} className="text-destructive" />
                    </Pressable>
                  </View>
                  <View className="flex-row items-center gap-2 mt-2">
                    <TextInput
                      value={ing.amount}
                      onChangeText={(v) => updateIngredient(index, { amount: v })}
                      placeholder="Amount"
                      placeholderTextColor="#9ca3af"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-[14px] text-foreground"
                    />
                    <TextInput
                      value={ing.unit ?? ''}
                      onChangeText={(v) => updateIngredient(index, { unit: v })}
                      placeholder="Unit (g, cups...)"
                      placeholderTextColor="#9ca3af"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-[14px] text-foreground"
                    />
                  </View>

                  {/* Per-ingredient macros toggle */}
                  <Pressable
                    onPress={() => updateIngredient(index, { showMacros: !ing.showMacros })}
                    className="flex-row items-center gap-1 mt-2"
                  >
                    {ing.showMacros ? (
                      <Icon as={ChevronUp} size={14} className="text-primary" />
                    ) : (
                      <Icon as={ChevronDown} size={14} className="text-primary" />
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
                          value={macroFieldValue(ing, 'calories')}
                          onChangeText={(v) => handleMacroChange(index, 'calories', v)}
                          onBlur={() => handleMacroBlur(index, 'calories')}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Protein</Text>
                        <TextInput
                          value={macroFieldValue(ing, 'protein')}
                          onChangeText={(v) => handleMacroChange(index, 'protein', v)}
                          onBlur={() => handleMacroBlur(index, 'protein')}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Carbs</Text>
                        <TextInput
                          value={macroFieldValue(ing, 'carbs')}
                          onChangeText={(v) => handleMacroChange(index, 'carbs', v)}
                          onBlur={() => handleMacroBlur(index, 'carbs')}
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-center"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[10px] text-muted-foreground mb-1">Fat</Text>
                        <TextInput
                          value={macroFieldValue(ing, 'fat')}
                          onChangeText={(v) => handleMacroChange(index, 'fat', v)}
                          onBlur={() => handleMacroBlur(index, 'fat')}
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

          <View className="mb-4 flex-row gap-2">
            <Pressable
              onPress={addIngredientRow}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
              accessibilityRole="button"
              accessibilityLabel="Add empty ingredient row"
              testID="recipe-add-ingredient"
            >
              <Icon as={Plus} size={18} className="text-primary" />
              <Text className="font-medium text-primary">Add Ingredient</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                lightHaptic();
                setShowLibraryPicker(true);
              }}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
              accessibilityRole="button"
              accessibilityLabel="Add ingredient from saved library"
              testID="recipe-add-from-library"
            >
              <Icon as={BookOpen} size={18} className="text-primary" />
              <Text className="font-medium text-primary">From Library</Text>
            </Pressable>
          </View>

          {/* Auto-calculated (or scanned) macros */}
          {effectiveMacros && (
            <View className="mb-4 rounded-xl border border-border bg-card p-4">
              <Text className="mb-2 text-sm font-semibold">
                Total Nutrition {servings ? `(${servings} servings)` : ''}
              </Text>
              {!calculatedMacros && scannedMacros && (
                <Text className="mb-2 text-xs text-muted-foreground">
                  From the scanned source — adjust ingredient macros to override.
                </Text>
              )}
              <View className="flex-row justify-between">
                <View className="items-center">
                  <Text className="text-lg font-bold">{effectiveMacros.calories}</Text>
                  <Text className="text-xs text-muted-foreground">calories</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold text-primary">
                    {effectiveMacros.protein}g
                  </Text>
                  <Text className="text-xs text-muted-foreground">protein</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold">{effectiveMacros.carbs}g</Text>
                  <Text className="text-xs text-muted-foreground">carbs</Text>
                </View>
                <View className="items-center">
                  <Text className="text-lg font-bold">{effectiveMacros.fat}g</Text>
                  <Text className="text-xs text-muted-foreground">fat</Text>
                </View>
              </View>
              {servings && parseInt(servings, 10) > 1 && (
                <View className="mt-2 pt-2 border-t border-border">
                  <Text className="text-xs text-muted-foreground text-center">
                    Per serving: {Math.round(effectiveMacros.calories / parseInt(servings, 10))} cal · {Math.round(effectiveMacros.protein / parseInt(servings, 10))}g protein · {Math.round(effectiveMacros.carbs / parseInt(servings, 10))}g carbs · {Math.round(effectiveMacros.fat / parseInt(servings, 10))}g fat
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
                className="h-6 w-6 items-center justify-center rounded-full mt-3 bg-primary"
              >
                <Text className="text-xs font-bold text-primary-foreground">{index + 1}</Text>
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
                  <Icon as={Trash2} size={16} className="text-destructive" />
                </Pressable>
              )}
            </View>
          ))}

          <Pressable
            onPress={addInstructionStep}
            className="mb-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
          >
            <Icon as={Plus} size={18} className="text-primary" />
            <Text className="font-medium text-primary">Add Step</Text>
          </Pressable>

          {/* Tags */}
          <Text className="mb-2 text-sm font-medium text-muted-foreground">TAGS</Text>
          {/* Show locked source tags */}
          {isEditing && existingRecipe?.tags?.some((t) => SOURCE_TAGS.includes(t)) && (
            <View className="flex-row flex-wrap gap-2 mb-2">
              {existingRecipe.tags
                .filter((t) => SOURCE_TAGS.includes(t))
                .map((tag) => (
                  <View key={tag} className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1">
                    <Icon as={Lock} size={10} className="text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground">{tag}</Text>
                  </View>
                ))}
            </View>
          )}
          <TextInput
            value={tags}
            onChangeText={setTags}
            placeholder="e.g. high-protein, meal-prep, quick"
            placeholderTextColor="#9ca3af"
            className="mb-8 rounded-xl border border-input bg-card px-4 py-3 text-foreground"
          />

        </ScrollView>
      </KeyboardAvoidingView>

      <IngredientLibraryModal
        visible={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        onPick={addIngredientFromLibrary}
      />

      <RecipeScanSheet
        visible={showScanSheet}
        onClose={() => setShowScanSheet(false)}
        onParsed={applyScannedRecipe}
      />
    </>
  );
}

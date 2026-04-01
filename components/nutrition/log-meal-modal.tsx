import React, { useState, useMemo } from 'react';
import {
  View,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Search, UtensilsCrossed, SlidersHorizontal } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { useRecipeStore } from '@/stores/recipe-store';
import { useMealLogStore } from '@/stores/meal-log-store';
import { lightHaptic } from '@/lib/haptics';
import { RecipeFilterModal, DEFAULT_FILTERS, hasActiveFilters } from './recipe-filter-modal';
import { applyRecipeFilters } from '@/lib/recipe-filters';
import type { RecipeFilters } from './recipe-filter-modal';
import type { Recipe, Macros } from '@/lib/types';

interface LogMealModalProps {
  visible: boolean;
  onClose: () => void;
  date: string; // YYYY-MM-DD
}

export function LogMealModal({ visible, onClose, date }: LogMealModalProps) {
  const recipes = useRecipeStore((s) => s.recipes);
  const addRecipe = useRecipeStore((s) => s.addRecipe);
  const addMeal = useMealLogStore((s) => s.addMeal);

  const [mode, setMode] = useState<'pick' | 'quick'>('pick');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RecipeFilters>(DEFAULT_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [portion, setPortion] = useState('1');

  // Quick add fields
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCalories, setQuickCalories] = useState('');
  const [quickProtein, setQuickProtein] = useState('');
  const [quickCarbs, setQuickCarbs] = useState('');
  const [quickFat, setQuickFat] = useState('');

  const filteredRecipes = useMemo(() => {
    let result = recipes;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
      );
    }
    result = applyRecipeFilters(result, filters);
    return result;
  }, [recipes, search, filters]);

  const reset = () => {
    setMode('pick');
    setSearch('');
    setFilters(DEFAULT_FILTERS);
    setSelectedRecipe(null);
    setPortion('1');
    setQuickTitle('');
    setQuickCalories('');
    setQuickProtein('');
    setQuickCarbs('');
    setQuickFat('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLogFromRecipe = () => {
    if (!selectedRecipe) return;
    const mult = parseFloat(portion) || 1;
    const recipeMacros = selectedRecipe.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const servings = selectedRecipe.servings || 1;

    // Per-serving macros * portion
    const macros: Macros = {
      calories: Math.round((recipeMacros.calories / servings) * mult),
      protein: Math.round((recipeMacros.protein / servings) * mult),
      carbs: Math.round((recipeMacros.carbs / servings) * mult),
      fat: Math.round((recipeMacros.fat / servings) * mult),
    };

    addMeal({
      date,
      recipeClientId: selectedRecipe.id,
      title: selectedRecipe.title,
      portionMultiplier: mult,
      macros,
    });

    lightHaptic();
    handleClose();
  };

  const getQuickMacros = (): Macros => ({
    calories: parseInt(quickCalories, 10) || 0,
    protein: parseInt(quickProtein, 10) || 0,
    carbs: parseInt(quickCarbs, 10) || 0,
    fat: parseInt(quickFat, 10) || 0,
  });

  const handleQuickLog = () => {
    if (!quickTitle.trim()) return;

    addMeal({
      date,
      title: quickTitle.trim(),
      portionMultiplier: 1,
      macros: getQuickMacros(),
    });

    lightHaptic();
    handleClose();
  };

  const handleQuickLogAndSave = () => {
    if (!quickTitle.trim()) return;

    const macros = getQuickMacros();

    // Save as recipe
    const recipe = addRecipe({
      title: quickTitle.trim(),
      description: '',
      ingredients: [],
      instructions: [],
      servings: 1,
      macros: macros.calories || macros.protein || macros.carbs || macros.fat ? macros : undefined,
    });

    // Log the meal linked to the new recipe
    addMeal({
      date,
      recipeClientId: recipe.id,
      title: quickTitle.trim(),
      portionMultiplier: 1,
      macros,
    });

    lightHaptic();
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold">Log Meal</Text>
          <Pressable onPress={handleClose} className="p-2">
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {/* Mode Toggle */}
        <View className="flex-row gap-2 px-4 mb-3">
          <Pressable
            onPress={() => { setMode('pick'); setSelectedRecipe(null); }}
            className={`flex-1 items-center rounded-lg py-2 ${mode === 'pick' ? 'bg-primary' : 'border border-border'}`}
          >
            <Text className={mode === 'pick' ? 'font-medium text-primary-foreground' : 'font-medium text-foreground'}>
              From Recipe
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setMode('quick'); setSelectedRecipe(null); }}
            className={`flex-1 items-center rounded-lg py-2 ${mode === 'quick' ? 'bg-primary' : 'border border-border'}`}
          >
            <Text className={mode === 'quick' ? 'font-medium text-primary-foreground' : 'font-medium text-foreground'}>
              Quick Add
            </Text>
          </Pressable>
        </View>

        {mode === 'pick' ? (
          selectedRecipe ? (
            // Portion selection
            <View className="flex-1 px-4">
              <View className="rounded-xl border border-border bg-card p-4 mb-4">
                <Text className="font-semibold text-lg">{selectedRecipe.title}</Text>
                {selectedRecipe.macros && (
                  <Text className="text-sm text-muted-foreground mt-1">
                    {selectedRecipe.macros.calories} cal · {selectedRecipe.macros.protein}g P · {selectedRecipe.macros.carbs}g C · {selectedRecipe.macros.fat}g F
                    {selectedRecipe.servings ? ` (${selectedRecipe.servings} servings)` : ''}
                  </Text>
                )}
              </View>

              <Text className="mb-2 text-sm font-medium text-muted-foreground">PORTION SIZE</Text>
              <TextInput
                value={portion}
                onChangeText={setPortion}
                placeholder="1"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
              />

              {selectedRecipe.macros && (
                <View className="rounded-xl border border-border bg-card p-4 mb-6">
                  <Text className="text-sm font-semibold mb-2">Logged macros</Text>
                  <View className="flex-row justify-between">
                    {(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => {
                      const base = selectedRecipe.macros![key];
                      const servings = selectedRecipe.servings || 1;
                      const mult = parseFloat(portion) || 1;
                      const val = Math.round((base / servings) * mult);
                      return (
                        <View key={key} className="items-center">
                          <Text className="text-lg font-bold">
                            {val}{key !== 'calories' ? 'g' : ''}
                          </Text>
                          <Text className="text-xs text-muted-foreground">{key}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setSelectedRecipe(null)}
                  className="flex-1 items-center rounded-xl border border-border py-4"
                >
                  <Text className="font-medium">Back</Text>
                </Pressable>
                <Pressable
                  onPress={handleLogFromRecipe}
                  className="flex-1 items-center rounded-xl bg-primary py-4"
                >
                  <Text className="font-medium text-primary-foreground">Log Meal</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            // Recipe picker
            <View className="flex-1">
              <View className="px-4 mb-3">
                <View className="flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
                  <Icon as={Search} size={18} className="text-muted-foreground" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search recipes..."
                    placeholderTextColor="#9ca3af"
                    className="flex-1 py-3 text-foreground"
                  />
                  <Pressable onPress={() => setShowFilterModal(true)} className="p-1.5" hitSlop={8}>
                    <Icon
                      as={SlidersHorizontal}
                      size={18}
                      className={hasActiveFilters(filters) ? 'text-primary' : 'text-muted-foreground'}
                    />
                  </Pressable>
                </View>
              </View>

              {filteredRecipes.length === 0 ? (
                <View className="flex-1 items-center justify-center px-4">
                  <Icon as={UtensilsCrossed} size={28} className="text-primary" />
                  <Text className="mt-3 text-center text-muted-foreground">
                    {recipes.length === 0 ? 'No recipes yet. Create one first!' : 'No matching recipes'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredRecipes}
                  keyExtractor={(item) => item.id}
                  contentContainerClassName="px-4 pb-8 gap-2"
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setSelectedRecipe(item)}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <Text className="font-medium">{item.title}</Text>
                      {item.macros && (
                        <Text className="text-xs text-muted-foreground mt-0.5">
                          {item.macros.calories} cal · {item.macros.protein}g P
                          {item.servings ? ` · ${item.servings} servings` : ''}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              )}
            </View>
          )
        ) : (
          // Quick Add mode
          <View className="flex-1 px-4">
            <Text className="mb-2 text-sm font-medium text-muted-foreground">MEAL NAME</Text>
            <TextInput
              value={quickTitle}
              onChangeText={setQuickTitle}
              placeholder="e.g. Protein shake"
              placeholderTextColor="#9ca3af"
              autoFocus
              className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
            />

            <Text className="mb-2 text-sm font-medium text-muted-foreground">MACROS</Text>
            <View className="flex-row gap-2 mb-6">
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Calories</Text>
                <TextInput
                  value={quickCalories}
                  onChangeText={setQuickCalories}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Protein (g)</Text>
                <TextInput
                  value={quickProtein}
                  onChangeText={setQuickProtein}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Carbs (g)</Text>
                <TextInput
                  value={quickCarbs}
                  onChangeText={setQuickCarbs}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Fat (g)</Text>
                <TextInput
                  value={quickFat}
                  onChangeText={setQuickFat}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
                />
              </View>
            </View>

            <Pressable
              onPress={handleQuickLog}
              disabled={!quickTitle.trim()}
              className={`items-center rounded-xl py-4 ${quickTitle.trim() ? 'bg-primary' : 'bg-primary/30'}`}
            >
              <Text className={`font-medium ${quickTitle.trim() ? 'text-primary-foreground' : 'text-primary-foreground/50'}`}>
                Log Meal
              </Text>
            </Pressable>

            <Pressable
              onPress={handleQuickLogAndSave}
              disabled={!quickTitle.trim()}
              className={`items-center rounded-xl py-4 mt-3 border ${quickTitle.trim() ? 'border-primary' : 'border-primary/30'}`}
            >
              <Text className={`font-medium ${quickTitle.trim() ? 'text-primary' : 'text-primary/30'}`}>
                Log Meal & Save Recipe
              </Text>
            </Pressable>
          </View>
        )}
        <RecipeFilterModal
          visible={showFilterModal}
          onClose={() => setShowFilterModal(false)}
          filters={filters}
          onApply={setFilters}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

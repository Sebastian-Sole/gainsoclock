import React from 'react';
import { View, Modal, Pressable, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { lightHaptic } from '@/lib/haptics';
import { parseLocaleNumber } from '@/lib/format';
import { scalePer100gMacros } from '@/lib/ingredient-macros';
import { cn } from '@/lib/utils';
import { useIngredientStore } from '@/stores/ingredient-store';
import type { SavedIngredient } from '@/lib/types';

interface IngredientLibraryModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * When provided, the modal acts as a picker: tapping an ingredient asks for
   * the amount used (grams) and calls back with the ingredient + grams.
   * Without it, the modal is a plain library manager (list + delete).
   */
  onPick?: (ingredient: SavedIngredient, grams: number) => void;
}

function IngredientRow({
  item,
  onSelect,
}: {
  item: SavedIngredient;
  onSelect?: (item: SavedIngredient) => void;
}) {
  const deleteIngredient = useIngredientStore((s) => s.deleteIngredient);

  const summary = `${item.per100g.calories} cal · ${item.per100g.protein}g P · ${item.per100g.carbs}g C · ${item.per100g.fat}g F per 100 g`;

  const content = (
    <View className="flex-1">
      <Text className="font-medium" numberOfLines={1}>
        {item.name}
      </Text>
      <Text className="text-xs text-muted-foreground">{summary}</Text>
    </View>
  );

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {onSelect ? (
        <Pressable
          onPress={() => {
            lightHaptic();
            onSelect(item);
          }}
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name} to recipe`}
          accessibilityHint={summary}
          testID={`ingredient-pick-${item.id}`}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      <Pressable
        onPress={() => {
          deleteIngredient(item.id);
          lightHaptic();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.name} from ingredient library`}
        className="p-2"
        hitSlop={8}
        testID={`ingredient-delete-${item.id}`}
      >
        <Icon as={Trash2} size={16} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}

export function IngredientLibraryModal({
  visible,
  onClose,
  onPick,
}: IngredientLibraryModalProps) {
  const ingredients = useIngredientStore((s) => s.ingredients);

  // Picker sub-state: the ingredient awaiting an amount, and the raw grams
  // text (comma-decimal accepted via parseLocaleNumber).
  const [pending, setPending] = React.useState<SavedIngredient | null>(null);
  const [gramsText, setGramsText] = React.useState('100');

  const grams = parseLocaleNumber(gramsText);
  const pendingMacros = pending ? scalePer100gMacros(pending.per100g, grams) : null;

  const reset = () => {
    setPending(null);
    setGramsText('100');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelect = (item: SavedIngredient) => {
    setGramsText(String(item.servingSizeG ?? 100));
    setPending(item);
  };

  const handleConfirm = () => {
    if (!pending || grams === null || grams <= 0) return;
    onPick?.(pending, grams);
    lightHaptic();
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-bold">
              {onPick ? 'Add from Library' : 'Ingredient Library'}
            </Text>
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-xs font-medium text-muted-foreground">
                {ingredients.length}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleClose}
            className="p-2"
            accessibilityRole="button"
            accessibilityLabel="Close ingredient library"
            testID="ingredient-library-close"
          >
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        {pending ? (
          <View className="px-4 pt-2">
            <Text className="text-lg font-semibold" numberOfLines={2}>
              {pending.name}
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Per 100 g: {pending.per100g.calories} cal · {pending.per100g.protein}g P ·{' '}
              {pending.per100g.carbs}g C · {pending.per100g.fat}g F
            </Text>

            <Text
              nativeID="ingredient-amount-label"
              className="mb-2 mt-4 text-sm font-medium text-muted-foreground"
            >
              AMOUNT USED (GRAMS)
            </Text>
            <Input
              value={gramsText}
              onChangeText={setGramsText}
              placeholder="100"
              keyboardType="decimal-pad"
              autoFocus
              accessibilityLabel="Amount used in grams"
              accessibilityLabelledBy="ingredient-amount-label"
              testID="ingredient-picker-grams-input"
            />

            <View className="mt-3 flex-row justify-between rounded-xl border border-border bg-card p-4">
              {(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => (
                <View key={key} className="items-center">
                  <Text className="text-lg font-bold">
                    {pendingMacros ? pendingMacros[key] : '—'}
                    {key !== 'calories' && pendingMacros ? 'g' : ''}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{key}</Text>
                </View>
              ))}
            </View>

            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={reset}
                className="flex-1 items-center rounded-xl border border-border py-4"
                accessibilityRole="button"
                accessibilityLabel="Back to ingredient list"
                testID="ingredient-picker-back"
              >
                <Text className="font-medium">Back</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={!pendingMacros}
                className={cn(
                  'flex-1 items-center rounded-xl py-4',
                  pendingMacros ? 'bg-primary' : 'bg-primary/30',
                )}
                accessibilityRole="button"
                accessibilityLabel="Add ingredient to recipe"
                accessibilityState={{ disabled: !pendingMacros }}
                testID="ingredient-picker-confirm"
              >
                <Text
                  className={cn(
                    'font-medium',
                    pendingMacros ? 'text-primary-foreground' : 'text-primary-foreground/50',
                  )}
                >
                  Add to Recipe
                </Text>
              </Pressable>
            </View>
          </View>
        ) : ingredients.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-muted-foreground">
              No saved ingredients yet. Scan a barcode and tap “Save Ingredient” to build your
              library.
            </Text>
          </View>
        ) : (
          <FlatList
            data={ingredients}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <IngredientRow item={item} onSelect={onPick ? handleSelect : undefined} />
            )}
            contentContainerClassName="pb-4"
            testID="ingredient-library-list"
          />
        )}
      </View>
    </Modal>
  );
}

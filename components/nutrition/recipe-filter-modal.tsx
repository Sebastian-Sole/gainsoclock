import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Keyboard,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Check } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { lightHaptic } from '@/lib/haptics';

export interface RecipeFilters {
  savedOnly: boolean;
  source: 'all' | 'ai' | 'user';
  maxCookTime?: number;
  maxCalories?: number;
  maxProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
  minProtein?: number;
}

interface RecipeFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: RecipeFilters;
  onApply: (filters: RecipeFilters) => void;
}

export const DEFAULT_FILTERS: RecipeFilters = {
  savedOnly: false,
  source: 'all',
};

export function hasActiveFilters(filters: RecipeFilters): boolean {
  return (
    filters.savedOnly ||
    filters.source !== 'all' ||
    filters.maxCookTime !== undefined ||
    filters.maxCalories !== undefined ||
    filters.maxProtein !== undefined ||
    filters.maxCarbs !== undefined ||
    filters.maxFat !== undefined ||
    filters.minProtein !== undefined
  );
}

function ToggleChip({
  label,
  active,
  onPress,
  primaryColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  primaryColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full px-4 py-2 ${
        active ? 'border-2' : 'border border-border bg-card'
      }`}
      style={active ? { borderColor: primaryColor, backgroundColor: primaryColor + '15' } : undefined}
    >
      {active && <Icon as={Check} size={14} className="text-primary" />}
      <Text className={`text-sm ${active ? 'font-medium' : ''}`} style={active ? { color: primaryColor } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RecipeFilterModal({ visible, onClose, filters, onApply }: RecipeFilterModalProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = Colors[isDark ? 'dark' : 'light'].tint;

  const [local, setLocal] = useState<RecipeFilters>(filters);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleApply = () => {
    lightHaptic();
    onApply(local);
    onClose();
  };

  const handleReset = () => {
    lightHaptic();
    onApply(DEFAULT_FILTERS);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold">Filter Recipes</Text>
          <Pressable onPress={onClose} className="p-2">
            <Icon as={X} size={24} className="text-foreground" />
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Saved / Favorited */}
          <Text className="mb-2 mt-4 text-sm font-medium text-muted-foreground">PINNED</Text>
          <ToggleChip
            label="Pinned recipes only"
            active={local.savedOnly}
            onPress={() => setLocal((p) => ({ ...p, savedOnly: !p.savedOnly }))}
            primaryColor={primaryColor}
          />

          {/* Source */}
          <Text className="mb-2 mt-6 text-sm font-medium text-muted-foreground">SOURCE</Text>
          <View className="flex-row flex-wrap gap-2">
            <ToggleChip
              label="All"
              active={local.source === 'all'}
              onPress={() => setLocal((p) => ({ ...p, source: 'all' }))}
              primaryColor={primaryColor}
            />
            <ToggleChip
              label="AI Generated"
              active={local.source === 'ai'}
              onPress={() => setLocal((p) => ({ ...p, source: 'ai' }))}
              primaryColor={primaryColor}
            />
            <ToggleChip
              label="User Created"
              active={local.source === 'user'}
              onPress={() => setLocal((p) => ({ ...p, source: 'user' }))}
              primaryColor={primaryColor}
            />
          </View>

          {/* Cook Time */}
          <Text className="mb-2 mt-6 text-sm font-medium text-muted-foreground">MAX COOK TIME (minutes)</Text>
          <TextInput
            value={local.maxCookTime?.toString() ?? ''}
            onChangeText={(v) =>
              setLocal((p) => ({ ...p, maxCookTime: v ? parseInt(v, 10) || undefined : undefined }))
            }
            placeholder="e.g. 30"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            className="rounded-xl border border-input bg-card px-4 py-3 text-foreground"
          />

          {/* Macros & Calories */}
          <Text className="mb-2 mt-6 text-sm font-medium text-muted-foreground">CALORIES & MACROS</Text>
          <View className="gap-3">
            <View>
              <Text className="text-xs text-muted-foreground mb-1">Max Calories</Text>
              <TextInput
                value={local.maxCalories?.toString() ?? ''}
                onChangeText={(v) =>
                  setLocal((p) => ({ ...p, maxCalories: v ? parseInt(v, 10) || undefined : undefined }))
                }
                placeholder="e.g. 500"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-4 py-3 text-foreground"
              />
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Min Protein (g)</Text>
                <TextInput
                  value={local.minProtein?.toString() ?? ''}
                  onChangeText={(v) =>
                    setLocal((p) => ({ ...p, minProtein: v ? parseInt(v, 10) || undefined : undefined }))
                  }
                  placeholder="e.g. 20"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Max Carbs (g)</Text>
                <TextInput
                  value={local.maxCarbs?.toString() ?? ''}
                  onChangeText={(v) =>
                    setLocal((p) => ({ ...p, maxCarbs: v ? parseInt(v, 10) || undefined : undefined }))
                  }
                  placeholder="e.g. 50"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-muted-foreground mb-1">Max Fat (g)</Text>
                <TextInput
                  value={local.maxFat?.toString() ?? ''}
                  onChangeText={(v) =>
                    setLocal((p) => ({ ...p, maxFat: v ? parseInt(v, 10) || undefined : undefined }))
                  }
                  placeholder="e.g. 20"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  className="rounded-xl border border-input bg-card px-3 py-3 text-foreground"
                />
              </View>
            </View>
          </View>

          <View className="h-8" />
        </ScrollView>

        {/* Bottom Actions */}
        <View
          className="flex-row gap-3 px-4 pt-3 border-t border-border"
          style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : 32 }}
        >
          <Pressable
            onPress={handleReset}
            className="flex-1 items-center rounded-xl border border-border py-4"
          >
            <Text className="font-medium">Reset</Text>
          </Pressable>
          <Pressable
            onPress={handleApply}
            className="flex-1 items-center rounded-xl bg-primary py-4"
          >
            <Text className="font-medium text-primary-foreground">Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

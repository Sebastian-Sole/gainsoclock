import React, { useState, useEffect } from 'react';
import {
  View,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { useNutritionGoalsStore } from '@/stores/nutrition-goals-store';
import { lightHaptic } from '@/lib/haptics';

interface EditGoalsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditGoalsModal({ visible, onClose }: EditGoalsModalProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const goals = useNutritionGoalsStore((s) => s.goals);
  const setGoals = useNutritionGoalsStore((s) => s.setGoals);

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  useEffect(() => {
    if (visible) {
      setCalories(goals.calories.toString());
      setProtein(goals.protein.toString());
      setCarbs(goals.carbs.toString());
      setFat(goals.fat.toString());
    }
  }, [visible, goals]);

  const handleSave = () => {
    setGoals({
      calories: parseInt(calories, 10) || 0,
      protein: parseInt(protein, 10) || 0,
      carbs: parseInt(carbs, 10) || 0,
      fat: parseInt(fat, 10) || 0,
    });
    lightHaptic();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold">Edit Goals</Text>
          <Pressable onPress={onClose} className="p-2">
            <X size={24} color={isDark ? '#fff' : '#000'} />
          </Pressable>
        </View>

        <View className="flex-1 px-4 pt-4">
          <Text className="mb-2 text-sm font-medium text-muted-foreground">DAILY CALORIES</Text>
          <TextInput
            value={calories}
            onChangeText={setCalories}
            placeholder="2000"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            className="mb-4 rounded-xl border border-input bg-card px-4 py-4 text-[18px] text-foreground"
          />

          <Text className="mb-2 text-sm font-medium text-muted-foreground">MACROS (grams)</Text>
          <View className="flex-row gap-3 mb-6">
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground mb-1">Protein</Text>
              <TextInput
                value={protein}
                onChangeText={setProtein}
                placeholder="150"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground mb-1">Carbs</Text>
              <TextInput
                value={carbs}
                onChangeText={setCarbs}
                placeholder="250"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground mb-1">Fat</Text>
              <TextInput
                value={fat}
                onChangeText={setFat}
                placeholder="65"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="rounded-xl border border-input bg-card px-3 py-3 text-foreground text-center"
              />
            </View>
          </View>

          <Pressable
            onPress={handleSave}
            className="items-center rounded-xl bg-primary py-4"
          >
            <Text className="font-medium text-primary-foreground">Save Goals</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

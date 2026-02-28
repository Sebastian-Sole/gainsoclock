import React from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { Trash2, UtensilsCrossed } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useMealLogStore } from '@/stores/meal-log-store';
import { lightHaptic, heavyHaptic } from '@/lib/haptics';
import type { MealLog } from '@/lib/types';

interface MealLogCardProps {
  meal: MealLog;
}

export function MealLogCard({ meal }: MealLogCardProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const mutedColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';
  const router = useRouter();
  const deleteMeal = useMealLogStore((s) => s.deleteMeal);

  const handlePress = () => {
    if (meal.recipeClientId) {
      router.push(`/recipe/${meal.recipeClientId}`);
    }
  };

  const handleLongPress = () => {
    heavyHaptic();
    Alert.alert('Remove Meal', `Remove "${meal.title}" from today's log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteMeal(meal.id);
          lightHaptic();
        },
      },
    ]);
  };

  const time = new Date(meal.loggedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: `${primaryColor}15` }}
      >
        <UtensilsCrossed size={18} color={primaryColor} />
      </View>

      <View className="flex-1">
        <Text className="font-medium">{meal.title}</Text>
        <View className="flex-row items-center gap-2 mt-0.5">
          <Text className="text-xs text-muted-foreground">{time}</Text>
          {meal.portionMultiplier !== 1 && (
            <Text className="text-xs text-muted-foreground">
              · {meal.portionMultiplier}x portion
            </Text>
          )}
        </View>
      </View>

      <View className="items-end">
        <Text className="text-sm font-semibold">{meal.macros.calories} cal</Text>
        <Text className="text-xs text-muted-foreground">
          {meal.macros.protein}g P · {meal.macros.carbs}g C · {meal.macros.fat}g F
        </Text>
      </View>
    </Pressable>
  );
}

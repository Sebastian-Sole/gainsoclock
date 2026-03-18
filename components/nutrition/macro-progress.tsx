import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pencil } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import type { Macros, NutritionGoals } from '@/lib/types';

interface MacroProgressProps {
  consumed: Macros;
  goals: NutritionGoals;
  onEditGoals?: () => void;
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View className="h-2.5 rounded-full bg-secondary overflow-hidden">
      <View
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </View>
  );
}

export function MacroProgress({ consumed, goals, onEditGoals }: MacroProgressProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const mutedColor = colorScheme === 'dark' ? '#a8a29e' : '#78716c';
  const remaining = Math.max(0, goals.calories - consumed.calories);

  return (
    <View className="gap-4">
      {/* Edit Goals Button */}
      {onEditGoals && (
        <View className="absolute right-0 top-0 z-10">
          <Pressable onPress={onEditGoals} className="p-1" hitSlop={8}>
            <Pencil size={16} color={mutedColor} />
          </Pressable>
        </View>
      )}

      {/* Calories */}
      <View className="items-center">
        <Text className="text-4xl font-bold">{consumed.calories}</Text>
        <Text className="text-sm text-muted-foreground">
          of {goals.calories} cal · {remaining} remaining
        </Text>
        <View className="w-full mt-2">
          <ProgressBar
            value={consumed.calories}
            max={goals.calories}
            color={primaryColor}
          />
        </View>
      </View>

      {/* Macros row */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <View className="flex-row items-baseline justify-between mb-1">
            <Text className="text-xs font-medium text-muted-foreground">Protein</Text>
            <Text className="text-xs text-muted-foreground">
              {consumed.protein}g / {goals.protein}g
            </Text>
          </View>
          <ProgressBar value={consumed.protein} max={goals.protein} color="#3b82f6" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-baseline justify-between mb-1">
            <Text className="text-xs font-medium text-muted-foreground">Carbs</Text>
            <Text className="text-xs text-muted-foreground">
              {consumed.carbs}g / {goals.carbs}g
            </Text>
          </View>
          <ProgressBar value={consumed.carbs} max={goals.carbs} color="#eab308" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-baseline justify-between mb-1">
            <Text className="text-xs font-medium text-muted-foreground">Fat</Text>
            <Text className="text-xs text-muted-foreground">
              {consumed.fat}g / {goals.fat}g
            </Text>
          </View>
          <ProgressBar value={consumed.fat} max={goals.fat} color="#ef4444" />
        </View>
      </View>
    </View>
  );
}

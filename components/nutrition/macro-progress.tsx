import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pencil } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { ProgressRing, useRingColors } from '@/components/shared/progress-ring';
import { useTokenColors } from '@/hooks/use-token-colors';
import type { Macros, NutritionGoals } from '@/lib/types';

function MacroRing({
  label,
  value,
  goal,
  color,
  trackColor,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
  trackColor: string;
}) {
  return (
    <View className="flex-1 items-center gap-1">
      <ProgressRing
        progress={goal > 0 ? value / goal : 0}
        size={36}
        strokeWidth={4}
        color={color}
        trackColor={trackColor}
      />
      <Text>
        <Text className="text-sm font-extrabold">{value}</Text>
        <Text className="text-xs text-muted-foreground"> / {goal}</Text>
      </Text>
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">{label} g</Text>
    </View>
  );
}

/**
 * One goal card: calories and the three macros are facets of the same
 * user-set goal, so they share a card and the pencil edits all of it.
 */
export function MacroProgress({ consumed, goals, onEditGoals }: MacroProgressProps) {
  const ring = useRingColors();
  const tokens = useTokenColors();
  const remaining = Math.max(0, goals.calories - consumed.calories);

  return (
    <View>
      {/* Edit Goals Button */}
      {onEditGoals && (
        <View className="absolute right-0 top-0 z-10">
          <Pressable
            onPress={onEditGoals}
            className="p-1"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit nutrition goals"
          >
            <Icon as={Pencil} size={16} className="text-muted-foreground" />
          </Pressable>
        </View>
      )}

      {/* Calories */}
      <View className="flex-row items-center gap-4">
        <ProgressRing
          progress={goals.calories > 0 ? consumed.calories / goals.calories : 0}
          size={84}
          strokeWidth={8}
          color={ring.primary}
          trackColor={ring.track}
        />
        <View className="flex-1">
          <Text>
            <Text className="text-3xl font-extrabold">{consumed.calories}</Text>
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">
              {'  '}/ {goals.calories} cal
            </Text>
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">{remaining} cal remaining</Text>
        </View>
      </View>

      {/* Macros row */}
      <View className="mt-4 flex-row border-t border-border pt-3">
        <MacroRing
          label="Protein"
          value={consumed.protein}
          goal={goals.protein}
          color={tokens.chartProtein}
          trackColor={ring.track}
        />
        <MacroRing
          label="Carbs"
          value={consumed.carbs}
          goal={goals.carbs}
          color={tokens.chartCarbs}
          trackColor={ring.track}
        />
        <MacroRing
          label="Fat"
          value={consumed.fat}
          goal={goals.fat}
          color={tokens.chartFat}
          trackColor={ring.track}
        />
      </View>
    </View>
  );
}

interface MacroProgressProps {
  consumed: Macros;
  goals: NutritionGoals;
  onEditGoals?: () => void;
}

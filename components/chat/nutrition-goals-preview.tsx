import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Target } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

interface NutritionGoalsPreviewData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionGoalsPreviewProps {
  data: NutritionGoalsPreviewData;
  collapsed?: boolean;
}

export function NutritionGoalsPreview({ data, collapsed }: NutritionGoalsPreviewProps) {
  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <Icon as={Target} size={16} className="text-primary" />
        <Text className="font-semibold">Set Nutrition Goals</Text>
      </View>

      {/* Macros row */}
      <View className="flex-row gap-3 mt-2 mb-2">
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.calories}</Text>
          <Text className="text-[10px] text-muted-foreground">cal</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.protein}g</Text>
          <Text className="text-[10px] text-muted-foreground">protein</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.carbs}g</Text>
          <Text className="text-[10px] text-muted-foreground">carbs</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.fat}g</Text>
          <Text className="text-[10px] text-muted-foreground">fat</Text>
        </View>
      </View>

      {!collapsed && (
        <Text className="text-xs text-muted-foreground mt-3">
          Approve to replace your current daily nutrition goals with these targets.
        </Text>
      )}
    </View>
  );
}

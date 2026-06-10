import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { UtensilsCrossed } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

interface MealLogPreviewData {
  title: string;
  date?: string;
  macros: { calories: number; protein: number; carbs: number; fat: number };
  portionDescription?: string;
  notes?: string;
}

interface MealLogPreviewProps {
  data: MealLogPreviewData;
  collapsed?: boolean;
}

export function MealLogPreview({ data, collapsed }: MealLogPreviewProps) {
  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <Icon as={UtensilsCrossed} size={16} className="text-primary" />
        <Text className="font-semibold">Log Meal</Text>
      </View>
      <Text className="text-sm font-medium mt-2">{data.title}</Text>
      {data.date && (
        <Text className="text-xs text-muted-foreground mb-2">{data.date}</Text>
      )}

      {/* Macros row */}
      <View className="flex-row gap-3 mb-2">
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.macros.calories}</Text>
          <Text className="text-[10px] text-muted-foreground">cal</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.macros.protein}g</Text>
          <Text className="text-[10px] text-muted-foreground">protein</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.macros.carbs}g</Text>
          <Text className="text-[10px] text-muted-foreground">carbs</Text>
        </View>
        <View className="items-center">
          <Text className="text-xs font-semibold">{data.macros.fat}g</Text>
          <Text className="text-[10px] text-muted-foreground">fat</Text>
        </View>
      </View>

      {collapsed ? (
        data.portionDescription ? (
          <Text className="text-xs text-muted-foreground mt-1" numberOfLines={1}>
            {data.portionDescription}
          </Text>
        ) : null
      ) : (
        <>
          {data.portionDescription && (
            <>
              <Text className="text-xs font-medium text-muted-foreground mt-2 mb-1">
                Portion:
              </Text>
              <Text className="text-xs text-muted-foreground">
                {data.portionDescription}
              </Text>
            </>
          )}
          {data.notes && (
            <>
              <Text className="text-xs font-medium text-muted-foreground mt-2 mb-1">
                Notes:
              </Text>
              <Text className="text-xs text-muted-foreground">{data.notes}</Text>
            </>
          )}
          <Text className="text-xs text-muted-foreground mt-3">
            These are AI estimates — approve to add this meal to today&apos;s log.
          </Text>
        </>
      )}
    </View>
  );
}

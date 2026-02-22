import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChefHat } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';

interface RecipePreviewData {
  title: string;
  description: string;
  ingredients: Array<{ name: string; amount: string; unit?: string }>;
  instructions: string[];
  macros: { calories: number; protein: number; carbs: number; fat: number };
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
}

interface RecipePreviewProps {
  data: RecipePreviewData;
  collapsed?: boolean;
}

export function RecipePreview({ data, collapsed }: RecipePreviewProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <ChefHat size={16} color={primaryColor} />
        <Text className="font-semibold">Recipe Suggestion</Text>
      </View>
      <Text className="text-sm font-medium mt-2">{data.title}</Text>
      <Text className="text-xs text-muted-foreground mb-2">{data.description}</Text>

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

      {/* Time info */}
      {(data.prepTimeMinutes || data.cookTimeMinutes || data.servings) && (
        <Text className="text-xs text-muted-foreground">
          {[
            data.prepTimeMinutes && `${data.prepTimeMinutes}min prep`,
            data.cookTimeMinutes && `${data.cookTimeMinutes}min cook`,
            data.servings && `${data.servings} servings`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}

      {/* Ingredients */}
      {collapsed ? (
        <Text className="text-xs text-muted-foreground mt-1">
          {data.ingredients.length} ingredients
        </Text>
      ) : (
        <>
          <Text className="text-xs font-medium text-muted-foreground mt-2 mb-1">
            Ingredients ({data.ingredients.length}):
          </Text>
          {data.ingredients.map((ing, i) => (
            <Text key={i} className="text-xs text-muted-foreground">
              · {ing.amount}{ing.unit ? ` ${ing.unit}` : ''} {ing.name}
            </Text>
          ))}

          {/* Instructions */}
          <Text className="text-xs font-medium text-muted-foreground mt-3 mb-1">
            Instructions:
          </Text>
          {data.instructions.map((step, i) => (
            <Text key={i} className="text-xs text-muted-foreground mb-1">
              {i + 1}. {step}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

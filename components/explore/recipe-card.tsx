import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Clock, Flame, Bookmark } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

interface RecipeCardProps {
  title: string;
  description: string;
  calories: number;
  prepTime: string;
  protein: number;
}

export function RecipeCard({ title, description, calories, prepTime, protein }: RecipeCardProps) {
  return (
    <View className="rounded-xl border border-border bg-card">
      {/* Placeholder image area */}
      <View className="h-32 items-center justify-center rounded-t-xl bg-muted">
        <Text className="text-3xl">🍽️</Text>
      </View>
      <View className="gap-2 p-4">
        <View className="flex-row items-start justify-between">
          <Text className="flex-1 font-semibold">{title}</Text>
          <Pressable className="active:opacity-50">
            <Icon as={Bookmark} size={18} className="text-muted-foreground" />
          </Pressable>
        </View>
        <Text className="text-sm text-muted-foreground" numberOfLines={2}>
          {description}
        </Text>
        <View className="flex-row items-center gap-4 pt-1">
          <View className="flex-row items-center gap-1">
            <Icon as={Flame} size={14} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">{calories} cal</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon as={Clock} size={14} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">{prepTime}</Text>
          </View>
          <Text className="text-xs text-muted-foreground">{protein}g protein</Text>
        </View>
      </View>
    </View>
  );
}

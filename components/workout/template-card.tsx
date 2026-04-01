import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { exerciseTypeLabel } from '@/lib/format';
import type { WorkoutTemplate } from '@/lib/types';
import { MoreVertical, Play } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface TemplateCardProps {
  template: WorkoutTemplate;
  index: number;
  onPress: () => void;
  onStart: () => void;
  onLongPress: () => void;
}

export function TemplateCard({ template, index, onPress, onStart, onLongPress }: TemplateCardProps) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        className="mb-3 rounded-xl border border-border bg-card p-4"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-lg font-semibold">{template.name}</Text>
            <View className="mt-1 flex-row items-center gap-2">
              <Badge variant="secondary">
                <Text className="text-xs">
                  {template.exercises.length} exercise{template.exercises.length !== 1 ? 's' : ''}
                </Text>
              </Badge>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onStart}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary"
            >
              <Icon as={Play} size={18} className="text-primary-foreground fill-primary-foreground" />
            </Pressable>
            <Pressable onPress={onLongPress} className="h-10 w-10 items-center justify-center">
              <Icon as={MoreVertical} size={18} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {template.exercises.length > 0 && (
          <View className="mt-3 gap-1">
            {template.exercises.slice(0, 3).map((exercise) => (
              <View key={exercise.id} className="flex-row items-center gap-2">
                <Text className="text-sm text-muted-foreground">
                  {exercise.defaultSetsCount} x {exercise.name}
                </Text>
                <Text className="text-xs text-muted-foreground/60">
                  {exerciseTypeLabel(exercise.type)}
                </Text>
              </View>
            ))}
            {template.exercises.length > 3 && (
              <Text className="text-xs text-muted-foreground/60">
                +{template.exercises.length - 3} more
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

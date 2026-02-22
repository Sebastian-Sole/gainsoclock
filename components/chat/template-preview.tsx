import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Dumbbell } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings-store';

interface TemplatePreviewData {
  name: string;
  notes?: string;
  exercises: Array<{
    name: string;
    type: string;
    defaultSetsCount: number;
    restTimeSeconds: number;
    suggestedReps?: number;
    suggestedWeight?: number;
    suggestedTime?: number;
    suggestedDistance?: number;
  }>;
}

interface TemplatePreviewProps {
  data: TemplatePreviewData;
  collapsed?: boolean;
}

const MAX_COLLAPSED = 3;

function formatExerciseDetail(exercise: TemplatePreviewData['exercises'][number], weightUnit: string, distanceUnit: string): string {
  const { defaultSetsCount, suggestedReps, suggestedWeight, suggestedTime, suggestedDistance, restTimeSeconds } = exercise;

  let main = `${defaultSetsCount} sets`;

  if (suggestedReps && suggestedWeight) {
    main = `${defaultSetsCount}×${suggestedReps} @ ${suggestedWeight}${weightUnit}`;
  } else if (suggestedReps) {
    main = `${defaultSetsCount}×${suggestedReps}`;
  } else if (suggestedTime && suggestedDistance) {
    main = `${defaultSetsCount} sets × ${suggestedDistance}${distanceUnit}`;
  } else if (suggestedTime) {
    main = `${defaultSetsCount} sets × ${suggestedTime}s`;
  }

  return `${main} · ${restTimeSeconds}s rest`;
}

export function TemplatePreview({ data, collapsed }: TemplatePreviewProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const exercises = collapsed
    ? data.exercises.slice(0, MAX_COLLAPSED)
    : data.exercises;
  const remaining = data.exercises.length - MAX_COLLAPSED;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <Dumbbell size={16} color={primaryColor} />
        <Text className="font-semibold">New Template</Text>
      </View>
      <Text className="text-sm font-medium mt-2 mb-2">{data.name}</Text>
      {exercises.map((exercise, index) => (
        <View key={index} className="flex-row items-center gap-2 py-1.5">
          <Text className="text-xs text-muted-foreground w-5">{index + 1}.</Text>
          <View className="flex-1">
            <Text className="text-sm" numberOfLines={1}>{exercise.name}</Text>
            <Text className="text-xs text-muted-foreground">
              {formatExerciseDetail(exercise, weightUnit, distanceUnit)}
            </Text>
          </View>
        </View>
      ))}
      {collapsed && remaining > 0 && (
        <Text className="text-xs text-muted-foreground mt-1">
          +{remaining} more exercise{remaining !== 1 ? 's' : ''}
        </Text>
      )}
      {!collapsed && data.notes && (
        <View className="mt-2 pt-2 border-t border-border">
          <Text className="text-xs text-muted-foreground italic">{data.notes}</Text>
        </View>
      )}
    </View>
  );
}

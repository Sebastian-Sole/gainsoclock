import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Dumbbell } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { useSettingsStore } from '@/stores/settings-store';

interface TemplatePreviewData {
  name: string;
  notes?: string;
  exercises: {
    name: string;
    type: string;
    /** "total" | "per_hand" | "per_side"; suggestedWeight is per implement
     *  for the latter two (lib/load-mode.ts). Untyped: the payload is
     *  AI-authored JSON. */
    loadMode?: string;
    defaultSetsCount: number;
    restTimeSeconds: number;
    suggestedReps?: number;
    suggestedWeight?: number;
    suggestedTime?: number;
    suggestedDistance?: number;
  }[];
}

interface TemplatePreviewProps {
  data: TemplatePreviewData;
  collapsed?: boolean;
}

const MAX_COLLAPSED = 3;

function formatExerciseDetail(exercise: TemplatePreviewData['exercises'][number], weightUnit: string, distanceUnit: string): string {
  const { defaultSetsCount, suggestedReps, suggestedWeight, suggestedTime, suggestedDistance, restTimeSeconds, loadMode } = exercise;

  // Suggested weights follow the per-hand convention (lib/load-mode.ts):
  // "@ 10kg/hand" makes the AI's proposal unambiguous on the approval card.
  const weightQualifier =
    loadMode === 'per_hand' ? '/hand' : loadMode === 'per_side' ? '/side' : '';

  let main = `${defaultSetsCount} sets`;

  if (suggestedReps && suggestedWeight) {
    main = `${defaultSetsCount}×${suggestedReps} @ ${suggestedWeight}${weightUnit}${weightQualifier}`;
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
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const exercises = collapsed
    ? data.exercises.slice(0, MAX_COLLAPSED)
    : data.exercises;
  const remaining = data.exercises.length - MAX_COLLAPSED;

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-1 pb-2 border-b border-border">
        <Icon as={Dumbbell} size={16} className="text-primary" />
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

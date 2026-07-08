import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { ExerciseType, MetricId } from '@/lib/types';
import { METRICS, metricUnitOverride, resolveExerciseMetrics } from '@/lib/metrics';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

interface SetHeaderRowProps {
  type: ExerciseType;
  metrics: MetricId[];
}

/**
 * Column headers for a set table, derived from the exercise's metric list so
 * they always line up with the inputs rendered by SetRow. Weight/distance show
 * the user's unit; intervals keep their combined "Effort & Time" column.
 */
export function SetHeaderRow({ type, metrics }: SetHeaderRowProps) {
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const rpeEnabled = useSettingsStore((s) => s.rpeEnabled);

  const columnLabel = (id: MetricId): string =>
    metricUnitOverride(id, weightUnit, distanceUnit) ?? METRICS[id].columnLabel;

  return (
    <View className="flex-row items-center gap-2 px-3 py-1">
      <Text className="w-8 text-center text-xs text-muted-foreground">Set</Text>
      <View className="flex-1 flex-row items-center gap-2">
        {type === 'intervals' ? (
          <Text className="flex-1 text-xs text-muted-foreground">Effort &amp; Time</Text>
        ) : (
          resolveExerciseMetrics(type, metrics).map((id) => {
            const kind = METRICS[id].inputKind;
            const wide = kind === 'duration' || kind === 'pace';
            return (
              <Text
                key={id}
                className={cn(
                  'text-center text-xs text-muted-foreground',
                  wide ? 'flex-[2]' : 'flex-1'
                )}
              >
                {columnLabel(id)}
              </Text>
            );
          })
        )}
      </View>
      {rpeEnabled && (
        <Text className="min-w-[40px] text-center text-xs text-muted-foreground">RPE</Text>
      )}
      <View className="w-[68px]" />
    </View>
  );
}

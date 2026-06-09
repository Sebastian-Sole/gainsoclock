import { format } from 'date-fns';
import {
  Activity,
  Bike,
  Clock,
  Dumbbell,
  Footprints,
  Waves,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDistance, formatDuration } from '@/lib/format';
import { useSettingsStore, type DistanceUnit } from '@/stores/settings-store';
import type { ExternalWorkout } from '@/hooks/use-external-workouts';

// Final-label overrides applied after camelCase expansion, so both raw
// HealthKit enum names ("traditionalStrengthTraining") and already-humanized
// strings ("Traditional Strength Training") normalize the same way.
const ACTIVITY_LABEL_OVERRIDES: Record<string, string> = {
  'Traditional Strength Training': 'Strength Training',
  'High Intensity Interval Training': 'HIIT',
  Other: 'Workout',
};

/** "traditionalStrengthTraining" → "Strength Training", "running" → "Running". */
export function humanizeActivityType(activityType: string): string {
  const spaced = activityType
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim();
  const titled = spaced
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return ACTIVITY_LABEL_OVERRIDES[titled] ?? titled;
}

function activityIcon(activityType: string): LucideIcon {
  const t = activityType.toLowerCase();
  if (t.includes('run') || t.includes('walk') || t.includes('hik')) return Footprints;
  if (t.includes('cycl') || t.includes('bik')) return Bike;
  if (t.includes('swim') || t.includes('water') || t.includes('row')) return Waves;
  if (t.includes('strength') || t.includes('core') || t.includes('cross')) return Dumbbell;
  return Activity;
}

const METERS_PER_MILE = 1609.344;

function formatWorkoutDistance(meters: number, unit: DistanceUnit): string {
  const value = unit === 'mi' ? meters / METERS_PER_MILE : meters / 1000;
  return formatDistance(Math.round(value * 10) / 10, unit);
}

function spokenDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minute${mins === 1 ? '' : 's'}`;
  }
  if (mins > 0) return `${mins} minute${mins === 1 ? '' : 's'}`;
  return `${seconds} seconds`;
}

interface ExternalWorkoutCardProps {
  workout: ExternalWorkout;
}

/**
 * Read-only history card for a workout imported from Apple Health (e.g. a
 * Strava run or Garmin ride). Intentionally not a Pressable — there is no
 * detail screen for external workouts yet.
 */
export function ExternalWorkoutCard({ workout }: ExternalWorkoutCardProps) {
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const activityLabel = humanizeActivityType(workout.activityType);
  const ActivityIcon = activityIcon(workout.activityType);
  const startTime = format(new Date(workout.startedAt), 'h:mm a');

  const distance =
    workout.distanceMeters !== undefined && workout.distanceMeters > 0
      ? formatWorkoutDistance(workout.distanceMeters, distanceUnit)
      : null;
  const calories =
    workout.activeEnergyKcal !== undefined && workout.activeEnergyKcal > 0
      ? `${Math.round(workout.activeEnergyKcal)} kcal`
      : null;
  const heartRate =
    workout.avgHeartRateBpm !== undefined && workout.avgHeartRateBpm > 0
      ? `${Math.round(workout.avgHeartRateBpm)} bpm avg`
      : null;
  const stats = [distance, calories, heartRate].filter(
    (s): s is string => s !== null
  );

  const accessibilityLabel = [
    `${activityLabel} workout from ${workout.sourceName}`,
    `at ${startTime}`,
    spokenDuration(workout.durationSeconds),
    ...(distance
      ? [`${distance.replace(' km', ' kilometers').replace(' mi', ' miles')}`]
      : []),
    ...(calories ? [`${Math.round(workout.activeEnergyKcal ?? 0)} calories`] : []),
    ...(heartRate
      ? [`average heart rate ${Math.round(workout.avgHeartRateBpm ?? 0)}`]
      : []),
  ].join(', ');

  return (
    <View
      testID="history-external-workout-card"
      accessible
      accessibilityLabel={accessibilityLabel}
      className="mb-3 rounded-xl border border-dashed border-border bg-muted/30 p-4"
    >
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
          <Icon as={ActivityIcon} size={18} className="text-secondary-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold">{activityLabel}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">{startTime}</Text>
        </View>
        <View className="items-end gap-1">
          <View className="flex-row items-center gap-1">
            <Icon as={Clock} size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">
              {formatDuration(workout.durationSeconds)}
            </Text>
          </View>
          <View className="rounded-full bg-secondary px-2 py-0.5">
            <Text className="text-xs text-secondary-foreground">
              {workout.sourceName}
            </Text>
          </View>
        </View>
      </View>

      {stats.length > 0 && (
        <View className="mt-2 flex-row flex-wrap">
          <Text className="text-xs text-muted-foreground">
            {stats.join(' · ')}
          </Text>
        </View>
      )}
    </View>
  );
}

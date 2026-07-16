import { useMutation } from 'convex/react';
import { format } from 'date-fns';
import {
  Activity,
  Bike,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  Footprints,
  Link2,
  Waves,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { formatDistance, formatDuration } from '@/lib/format';
import { resolveHealthSourceName } from '@/lib/health-source';
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

/** A Fitbull log this imported workout could be merged into. */
export type MergeCandidate = { id: string; templateName: string };

interface ExternalWorkoutCardProps {
  workout: ExternalWorkout;
  /** Same-day log the app is confident is the same session (chip CTA). */
  suggested?: MergeCandidate | null;
  /** All same-day logs available to merge into (manual picker). */
  candidates?: MergeCandidate[];
}

/**
 * History card for a workout imported from Apple Health. When the day has a
 * Fitbull log it could belong to (#117), it offers a merge: a one-tap chip for
 * a confident same-activity match, or an expandable picker to choose the log.
 * With nothing to merge into, it stays a plain read-only card.
 */
export function ExternalWorkoutCard({
  workout,
  suggested = null,
  candidates = [],
}: ExternalWorkoutCardProps) {
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const linkWorkout = useMutation(api.healthData.linkExternalWorkout);
  const unlinkWorkout = useMutation(api.healthData.unlinkExternalWorkout);
  const [expanded, setExpanded] = useState(false);

  const activityLabel = humanizeActivityType(workout.activityType);
  const ActivityIcon = activityIcon(workout.activityType);
  const startTime = format(new Date(workout.startedAt), 'h:mm a');
  // Re-sanitize at display time so rows persisted before the fix for
  // issue #105 ("SourceProxy" leaking from HealthKit) also render cleanly.
  const sourceLabel = resolveHealthSourceName(
    workout.sourceName,
    workout.sourceBundleId
  );

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

  const canMerge = candidates.length > 0;

  const handleMerge = (logClientId: string) => {
    linkWorkout({
      healthKitUuid: workout.healthKitUuid,
      workoutLogClientId: logClientId,
    }).catch(() =>
      Alert.alert('Could Not Merge', 'Check your connection and try again.')
    );
  };

  const handleKeepSeparate = () => {
    unlinkWorkout({ healthKitUuid: workout.healthKitUuid }).catch(() =>
      Alert.alert('Something Went Wrong', 'Check your connection and try again.')
    );
  };

  const accessibilityLabel = [
    `${activityLabel} workout from ${sourceLabel}`,
    `at ${startTime}`,
    spokenDuration(workout.durationSeconds),
    ...(distance
      ? [`${distance.replace(' km', ' kilometers').replace(' mi', ' miles')}`]
      : []),
    ...(calories ? [`${Math.round(workout.activeEnergyKcal ?? 0)} calories`] : []),
    ...(heartRate
      ? [`average heart rate ${Math.round(workout.avgHeartRateBpm ?? 0)}`]
      : []),
    ...(suggested ? [`possible match: your ${suggested.templateName} workout`] : []),
  ].join(', ');

  return (
    <View
      testID="history-external-workout-card"
      className="mb-3 rounded-xl border border-dashed border-border bg-muted/30 p-4"
    >
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        className="flex-row items-start gap-3"
      >
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
            <Text className="text-xs text-secondary-foreground">{sourceLabel}</Text>
          </View>
        </View>
      </View>

      {stats.length > 0 && (
        <View className="mt-2 flex-row flex-wrap">
          <Text className="text-xs text-muted-foreground">{stats.join(' · ')}</Text>
        </View>
      )}

      {/* Suggested match — one-tap merge for a confident same-activity log. */}
      {suggested && !expanded && (
        <View className="mt-3 flex-row items-center gap-2 rounded-lg bg-primary/5 p-2 pl-3">
          <View className="flex-1">
            <Text className="text-xs text-muted-foreground">
              Same session as your{' '}
              <Text className="text-xs font-medium text-foreground">
                {suggested.templateName}
              </Text>{' '}
              workout?
            </Text>
          </View>
          <Pressable
            testID="external-merge-suggested"
            onPress={() => handleMerge(suggested.id)}
            accessibilityRole="button"
            accessibilityLabel={`Merge into your ${suggested.templateName} workout`}
            className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5"
          >
            <Icon as={Link2} size={13} className="text-primary-foreground" />
            <Text className="text-xs font-medium text-primary-foreground">Merge</Text>
          </Pressable>
        </View>
      )}

      {/* Manual picker — expand to choose which workout this belongs to. */}
      {canMerge && (
        <Pressable
          testID="external-merge-toggle"
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide merge options' : 'Merge into a workout'}
          accessibilityState={{ expanded }}
          className="mt-2 flex-row items-center gap-1 self-start py-1"
        >
          <Icon as={Link2} size={13} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">
            {suggested ? 'Choose a different workout' : 'Merge into a workout'}
          </Text>
          <Icon
            as={expanded ? ChevronUp : ChevronDown}
            size={13}
            className="text-muted-foreground"
          />
        </Pressable>
      )}

      {expanded && (
        <View className="mt-2 gap-2 border-t border-border pt-3">
          {candidates.map((c) => (
            <Pressable
              key={c.id}
              testID="external-merge-candidate"
              onPress={() => handleMerge(c.id)}
              accessibilityRole="button"
              accessibilityLabel={`Merge into ${c.templateName}`}
              className="flex-row items-center justify-between rounded-lg bg-background px-3 py-2.5"
            >
              <Text className="flex-1 text-sm font-medium">{c.templateName}</Text>
              <View className="flex-row items-center gap-1.5">
                <Icon as={Link2} size={13} className="text-primary" />
                <Text className="text-xs font-medium text-primary">Merge</Text>
              </View>
            </Pressable>
          ))}
          <Pressable
            testID="external-keep-separate"
            onPress={handleKeepSeparate}
            accessibilityRole="button"
            accessibilityLabel="Keep this workout separate"
            accessibilityHint="Stops suggesting a merge for this imported workout"
            className="items-center py-2"
          >
            <Text className="text-xs text-muted-foreground">Keep separate</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

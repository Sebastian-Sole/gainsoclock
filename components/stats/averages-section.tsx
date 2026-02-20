import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';

import { formatDuration } from '@/lib/format';
import type { AverageStats, TotalStats } from '@/lib/stats';

interface AveragesSectionProps {
  averages: AverageStats;
  totals: TotalStats;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between p-4">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="font-semibold">{value}</Text>
    </View>
  );
}

export function AveragesSection({ averages, totals }: AveragesSectionProps) {
  if (totals.totalWorkouts === 0) return null;

  return (
    <View>
      <Text className="mb-3 text-sm font-medium uppercase text-muted-foreground">
        Averages
      </Text>
      <View className="rounded-xl border border-border bg-card">
        <StatRow
          label="Avg. Workout Duration"
          value={formatDuration(Math.round(averages.avgWorkoutDuration))}
        />
        <View className="mx-4 h-px bg-border" />
        <StatRow
          label="Avg. Sets / Workout"
          value={averages.avgSetsPerWorkout.toFixed(1)}
        />
        <View className="mx-4 h-px bg-border" />
        <StatRow
          label="Avg. Exercises / Workout"
          value={averages.avgExercisesPerWorkout.toFixed(1)}
        />
        <View className="mx-4 h-px bg-border" />
        <StatRow
          label="Workouts / Week"
          value={averages.workoutsPerWeek.toFixed(1)}
        />
        <View className="mx-4 h-px bg-border" />
        <StatRow
          label="Total Sets"
          value={totals.totalSets.toLocaleString()}
        />
        <View className="mx-4 h-px bg-border" />
        <StatRow
          label="Total Reps"
          value={totals.totalReps.toLocaleString()}
        />
      </View>
    </View>
  );
}

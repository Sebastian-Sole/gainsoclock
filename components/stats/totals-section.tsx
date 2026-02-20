import React from 'react';
import { View } from 'react-native';
import { Dumbbell, Clock, Weight, Route } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { StatCard } from './stat-card';
import { formatDuration, formatWeight, formatDistance } from '@/lib/format';
import type { TotalStats } from '@/lib/stats';
import type { WeightUnit, DistanceUnit } from '@/stores/settings-store';

interface TotalsSectionProps {
  totals: TotalStats;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

export function TotalsSection({ totals, weightUnit, distanceUnit }: TotalsSectionProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#fb923c' : '#f97316';
  const iconSize = 20;

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <StatCard
          icon={<Dumbbell size={iconSize} color={iconColor} />}
          value={totals.totalWorkouts.toLocaleString()}
          label="Total Workouts"
        />
        <StatCard
          icon={<Clock size={iconSize} color={iconColor} />}
          value={formatDuration(totals.totalTimeSeconds)}
          label="Total Time"
        />
      </View>
      <View className="flex-row gap-3">
        <StatCard
          icon={<Weight size={iconSize} color={iconColor} />}
          value={formatWeight(Math.round(totals.totalWeightLifted), weightUnit)}
          label="Total Volume"
        />
        <StatCard
          icon={<Route size={iconSize} color={iconColor} />}
          value={formatDistance(Math.round(totals.totalDistance * 10) / 10, distanceUnit)}
          label="Total Distance"
        />
      </View>
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';
import { Dumbbell, Clock, Weight, Route } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
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
  const iconSize = 20;

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <StatCard
          icon={<Icon as={Dumbbell} size={iconSize} className="text-primary" />}
          value={totals.totalWorkouts.toLocaleString()}
          label="Total Workouts"
        />
        <StatCard
          icon={<Icon as={Clock} size={iconSize} className="text-primary" />}
          value={formatDuration(totals.totalTimeSeconds)}
          label="Total Time"
        />
      </View>
      <View className="flex-row gap-3">
        <StatCard
          icon={<Icon as={Weight} size={iconSize} className="text-primary" />}
          value={formatWeight(Math.round(totals.totalWeightLifted), weightUnit)}
          label="Total Volume"
        />
        <StatCard
          icon={<Icon as={Route} size={iconSize} className="text-primary" />}
          value={formatDistance(Math.round(totals.totalDistance * 10) / 10, distanceUnit)}
          label="Total Distance"
        />
      </View>
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Progress } from '@/components/ui/progress';
import type { CurrentYearStats } from '@/lib/stats';

interface YearlyOverviewSectionProps {
  currentYear: CurrentYearStats;
}

export function YearlyOverviewSection({ currentYear }: YearlyOverviewSectionProps) {
  return (
    <View>
      <Text className="mb-3 text-sm font-medium uppercase text-muted-foreground">
        {currentYear.year} Overview
      </Text>
      <View className="rounded-xl border border-border bg-card p-4">
        <View className="mb-3 flex-row items-baseline justify-between">
          <Text className="text-2xl font-bold">
            {currentYear.daysTrained}
          </Text>
          <Text className="text-sm text-muted-foreground">
            / {currentYear.totalDaysSoFar} days ({currentYear.percentage.toFixed(1)}%)
          </Text>
        </View>

        <Progress value={currentYear.percentage} className="mb-3" />

        <Text className="text-sm text-muted-foreground">
          Predicted: {currentYear.predictedTotal} days this year
        </Text>
      </View>
    </View>
  );
}

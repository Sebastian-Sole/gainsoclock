import React from 'react';
import { View } from 'react-native';

import { TotalsSection } from './totals-section';
import { YearlyOverviewSection } from './yearly-overview-section';
import { StreaksSection } from './streaks-section';
import { AveragesSection } from './averages-section';
import { BodyWeightSection } from './body-weight-section';
import { WeeklyReviewEntryCard } from '@/components/review/weekly-review-entry-card';
import type { AllStats } from '@/lib/stats';
import type { WeightUnit, DistanceUnit } from '@/stores/settings-store';

interface OverviewTabProps {
  stats: AllStats;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

export function OverviewTab({ stats, weightUnit, distanceUnit }: OverviewTabProps) {
  return (
    <View className="gap-6">
      <WeeklyReviewEntryCard />
      <TotalsSection
        totals={stats.totals}
        weightUnit={weightUnit}
        distanceUnit={distanceUnit}
      />
      <YearlyOverviewSection currentYear={stats.currentYear} />
      <StreaksSection streaks={stats.streaks} />
      <AveragesSection averages={stats.averages} totals={stats.totals} />
      <BodyWeightSection weightUnit={weightUnit} />
    </View>
  );
}

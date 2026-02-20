import React from 'react';
import { View } from 'react-native';

import { RecordsSection } from './records-section';
import type { AllStats } from '@/lib/stats';

interface RecordsTabProps {
  stats: AllStats;
}

export function RecordsTab({ stats }: RecordsTabProps) {
  return (
    <View className="gap-6">
      <RecordsSection
        bestMonth={stats.bestMonth}
        bestYear={stats.bestYear}
        favorites={stats.favorites}
      />
    </View>
  );
}

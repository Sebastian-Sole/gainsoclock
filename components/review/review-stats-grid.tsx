import {
  Activity,
  Dumbbell,
  HeartPulse,
  Layers,
  Moon,
  Target,
  Trophy,
  Weight,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { StatCard } from '@/components/stats/stat-card';
import { Icon } from '@/components/ui/icon';
import { formatWeight } from '@/lib/format';
import type { WeightUnit } from '@/stores/settings-store';
import type { WeeklyReviewStats } from './review-types';

const LBS_PER_KG = 2.20462;

function formatVolume(totalVolumeKg: number, unit: WeightUnit): string {
  const value =
    unit === 'lbs' ? Math.round(totalVolumeKg * LBS_PER_KG) : Math.round(totalVolumeKg);
  return formatWeight(value, unit);
}

interface GridCard {
  key: string;
  icon: LucideIcon;
  value: string;
  label: string;
}

interface ReviewStatsGridProps {
  stats: WeeklyReviewStats;
  weightUnit: WeightUnit;
}

/**
 * 2-column stat cards for the weekly review. Core training cards are hidden
 * for an empty week (no logged workouts) so the empty state isn't a wall of
 * zeros — external workouts, sleep, and resting HR still render when present.
 */
export function ReviewStatsGrid({ stats, weightUnit }: ReviewStatsGridProps) {
  const cards: GridCard[] = [];
  const hasWorkouts = stats.workoutCount > 0;

  if (hasWorkouts) {
    cards.push({
      key: 'workouts',
      icon: Dumbbell,
      value: stats.workoutCount.toLocaleString(),
      label: 'Workouts',
    });
    cards.push({
      key: 'volume',
      icon: Weight,
      value: formatVolume(stats.totalVolumeKg, weightUnit),
      label: 'Volume',
    });
    cards.push({
      key: 'sets',
      icon: Layers,
      value: stats.totalSets.toLocaleString(),
      label: 'Sets',
    });
    cards.push({
      key: 'prs',
      icon: Trophy,
      value: stats.prCount.toLocaleString(),
      label: 'PRs',
    });
    if (stats.planAdherencePct !== undefined) {
      cards.push({
        key: 'adherence',
        icon: Target,
        value: `${Math.round(stats.planAdherencePct)}%`,
        label: 'Plan Adherence',
      });
    }
  }
  if (stats.externalWorkoutCount > 0) {
    cards.push({
      key: 'external',
      icon: Activity,
      value: stats.externalWorkoutCount.toLocaleString(),
      label: 'External Workouts',
    });
  }
  if (stats.avgSleepHours !== undefined) {
    cards.push({
      key: 'sleep',
      icon: Moon,
      value: `${Math.round(stats.avgSleepHours * 10) / 10}h`,
      label: 'Avg Sleep',
    });
  }
  if (stats.avgRestingHr !== undefined) {
    cards.push({
      key: 'hr',
      icon: HeartPulse,
      value: `${Math.round(stats.avgRestingHr)} bpm`,
      label: 'Resting HR',
    });
  }

  if (cards.length === 0) return null;

  const rows: GridCard[][] = [];
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(cards.slice(i, i + 2));
  }

  return (
    <View className="gap-3" testID="review-stats-grid">
      {rows.map((row) => (
        <View key={row[0].key} className="flex-row gap-3">
          {row.map((card) => (
            <StatCard
              key={card.key}
              icon={<Icon as={card.icon} size={20} className="text-primary" />}
              value={card.value}
              label={card.label}
            />
          ))}
          {row.length === 1 && <View className="flex-1" />}
        </View>
      ))}
    </View>
  );
}

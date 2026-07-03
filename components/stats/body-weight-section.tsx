import React from 'react';
import { View } from 'react-native';
import { useQuery } from 'convex/react';
import { addDays, format, subDays } from 'date-fns';
import { Minus, TrendingDown, TrendingUp, Weight } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { api } from '@/convex/_generated/api';
import {
  computeBodyWeightTrend,
  formatBodyWeightDeltaKg,
  formatBodyWeightKg,
  type BodyWeightPoint,
} from '@/lib/body-weight-trend';
import type { WeightUnit } from '@/stores/settings-store';

import { StatCard } from './stat-card';
import { Text } from '@/components/ui/text';

// Client fetch window. The server (`listDailyMetrics`) clamps to 400 days
// regardless, so this is purely the v1 display window — a future plan can
// add a range picker (see `date-range-picker.tsx`) without changing the
// server contract.
const TREND_WINDOW_DAYS = 90;

interface BodyWeightSectionProps {
  weightUnit: WeightUnit;
}

/**
 * Decorative bar trend of non-null body-weight readings — the numbers above
 * it (latest + delta) carry the actual information, so this is hidden from
 * screen readers. Renders nothing with fewer than 2 points (no trend to draw).
 */
function Sparkline({ points }: { points: BodyWeightPoint[] }) {
  if (points.length < 2) return null;

  const kgs = points.map((p) => p.kg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const range = max - min || 1; // avoid divide-by-zero when weight is flat
  const maxBarHeight = 48;
  const minBarHeight = 4;

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View
        className="h-14 flex-row items-end gap-0.5"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {points.map((p) => {
          const heightPct = (p.kg - min) / range;
          const height = minBarHeight + heightPct * (maxBarHeight - minBarHeight);
          return (
            <View
              key={p.date}
              className="flex-1 rounded-full bg-primary/40"
              style={{ height }}
            />
          );
        })}
      </View>
    </View>
  );
}

export function BodyWeightSection({ weightUnit }: BodyWeightSectionProps) {
  const now = new Date();
  // Half-open range matching listDailyMetrics: `to` is tomorrow so today's
  // reading (if any) is included, `from` is TREND_WINDOW_DAYS back.
  const to = format(addDays(now, 1), 'yyyy-MM-dd');
  const from = format(subDays(now, TREND_WINDOW_DAYS), 'yyyy-MM-dd');

  const rows = useQuery(api.healthData.listDailyMetrics, { from, to });
  const trend = rows ? computeBodyWeightTrend(rows) : null;

  if (!trend) return null;

  const iconSize = 20;
  const DeltaIcon =
    trend.deltaKg === null
      ? null
      : trend.deltaKg > 0
        ? TrendingUp
        : trend.deltaKg < 0
          ? TrendingDown
          : Minus;

  return (
    <View>
      <Text className="mb-3 text-sm font-medium uppercase text-muted-foreground">
        Body Weight
      </Text>
      <View className="gap-3">
        <View className="flex-row gap-3">
          <StatCard
            icon={<Icon as={Weight} size={iconSize} className="text-primary" />}
            value={formatBodyWeightKg(trend.latestKg, weightUnit)}
            label="Latest Weight"
          />
          {trend.deltaKg !== null && DeltaIcon ? (
            <StatCard
              icon={<Icon as={DeltaIcon} size={iconSize} className="text-primary" />}
              value={formatBodyWeightDeltaKg(trend.deltaKg, weightUnit)}
              label="vs 30 Days Ago"
            />
          ) : (
            <View className="flex-1" />
          )}
        </View>
        <Sparkline points={trend.points} />
      </View>
    </View>
  );
}

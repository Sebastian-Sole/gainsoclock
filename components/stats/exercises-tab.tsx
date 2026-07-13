import React, { useState, useMemo } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Search, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { format } from 'date-fns';

import { Icon } from '@/components/ui/icon';
import { ProgressionChart } from '@/components/stats/progression-chart';
import { Colors } from '@/constants/theme';
import { formatWeight, formatDistance, formatMetricValue } from '@/lib/format';
import { METRICS, METRIC_LIST } from '@/lib/metrics';
import {
  computeExerciseSeries,
  filterLogsByDateRange,
  type DateRangeFilter,
  type ExerciseStats,
} from '@/lib/stats';
import {
  DEFAULT_ONE_RM_FORMULA,
  ONE_RM_FORMULA_LABELS,
  computeOneRmSeries,
} from '@/lib/one-rep-max';
import type { MetricId, WorkoutLog } from '@/lib/types';
import { useHistoryStore } from '@/stores/history-store';
import type { WeightUnit, DistanceUnit } from '@/stores/settings-store';

interface ExercisesTabProps {
  exerciseStats: ExerciseStats[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** Same range the stats above were computed over — charts follow it. */
  dateFilter: DateRangeFilter;
}

/** PB row labels. Metrics not listed fall back to "Best {label}". */
const PB_LABELS: Partial<Record<MetricId, string>> = {
  weight: 'Heaviest',
  reps: 'Most Reps',
  duration: 'Longest',
  distance: 'Furthest',
  pace: 'Fastest Pace',
  speed: 'Top Speed',
};

export function ExercisesTab({
  exerciseStats,
  weightUnit,
  distanceUnit,
  dateFilter,
}: ExercisesTabProps) {
  const { colorScheme } = useColorScheme();
  const mutedColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].icon;
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logs = useHistoryStore((s) => s.logs);
  const filteredLogs = useMemo(
    () => filterLogsByDateRange(logs, dateFilter),
    [logs, dateFilter]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return exerciseStats;
    const q = search.toLowerCase();
    return exerciseStats.filter((e) => e.exerciseName.toLowerCase().includes(q));
  }, [exerciseStats, search]);

  if (exerciseStats.length === 0) {
    return (
      <View className="items-center py-12">
        <Text className="text-muted-foreground">No exercises logged yet</Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {/* Search */}
      <View className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Icon as={Search} size={18} className="text-muted-foreground" />
        <TextInput
          placeholder="Search exercises..."
          placeholderTextColor={mutedColor}
          value={search}
          onChangeText={setSearch}
          className="flex-1 py-0 text-[16px] text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="center"
          accessibilityLabel="Search exercises"
        />
      </View>

      {/* Results count */}
      <Text className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'}
      </Text>

      {/* Exercise list */}
      <View className="rounded-xl border border-border bg-card">
        {filtered.map((exercise, index) => (
          <View key={exercise.exerciseId}>
            {index > 0 && <View className="mx-4 h-px bg-border" />}
            <ExerciseRow
              exercise={exercise}
              logs={filteredLogs}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              isExpanded={expandedId === exercise.exerciseId}
              onToggle={() =>
                setExpandedId(
                  expandedId === exercise.exerciseId ? null : exercise.exerciseId
                )
              }
            />
          </View>
        ))}
        {filtered.length === 0 && (
          <View className="items-center py-8">
            <Text className="text-muted-foreground">No matching exercises</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ExerciseRow({
  exercise,
  logs,
  weightUnit,
  distanceUnit,
  isExpanded,
  onToggle,
}: {
  exercise: ExerciseStats;
  logs: WorkoutLog[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Totals, driven by the metrics registry: every 'sum' metric with data,
  // plus the derived set/volume counters.
  const totals: { label: string; value: string }[] = [];
  if (exercise.totalSets > 0) {
    totals.push({ label: 'Total Sets', value: exercise.totalSets.toLocaleString() });
  }
  for (const spec of METRIC_LIST) {
    if (spec.aggregation !== 'sum') continue;
    const total = exercise.totals[spec.id];
    if (total === undefined || total <= 0) continue;
    if (spec.id === 'reps') {
      totals.push({ label: 'Total Reps', value: total.toLocaleString() });
      if (exercise.totalVolume > 0) {
        totals.push({
          label: 'Total Volume',
          value: formatWeight(Math.round(exercise.totalVolume), weightUnit),
        });
      }
    } else if (spec.id === 'duration') {
      const hours = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      totals.push({
        label: 'Total Time',
        value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
      });
    } else if (spec.id === 'distance') {
      totals.push({
        label: 'Total Distance',
        value: formatDistance(Math.round(total * 10) / 10, distanceUnit),
      });
    } else {
      totals.push({
        label: `Total ${spec.label}`,
        value: formatMetricValue(spec.id, total, weightUnit, distanceUnit),
      });
    }
  }

  // Personal bests — one row per metric with a best, in palette order, with
  // the derived volume PB slotted after reps (legacy ordering).
  const pbs: { label: string; value: string; date: string }[] = [];
  for (const spec of METRIC_LIST) {
    const best = exercise.bests[spec.id];
    if (best) {
      pbs.push({
        label: PB_LABELS[spec.id] ?? `Best ${spec.label}`,
        value: formatMetricValue(spec.id, best.value, weightUnit, distanceUnit),
        date: format(new Date(best.date), 'MMM d, yyyy'),
      });
    }
    if (spec.id === 'reps' && exercise.maxVolume) {
      pbs.push({
        label: 'Best Volume',
        value: formatWeight(exercise.maxVolume.value, weightUnit),
        date: format(new Date(exercise.maxVolume.date), 'MMM d, yyyy'),
      });
    }
  }

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.exerciseName}, ${exercise.totalAppearances} ${
        exercise.totalAppearances === 1 ? 'session' : 'sessions'
      }`}
      accessibilityHint={isExpanded ? 'Collapses details' : 'Expands totals, personal bests, and progression charts'}
      accessibilityState={{ expanded: isExpanded }}
      className="p-4"
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="font-semibold">{exercise.exerciseName}</Text>
          <Text className="text-xs text-muted-foreground">
            {exercise.totalAppearances} {exercise.totalAppearances === 1 ? 'session' : 'sessions'}
          </Text>
        </View>
        {isExpanded ? (
          <Icon as={ChevronUp} size={18} className="text-muted-foreground" />
        ) : (
          <Icon as={ChevronDown} size={18} className="text-muted-foreground" />
        )}
      </View>

      {/* Expanded details */}
      {isExpanded && (
        <View className="mt-3 gap-3">
          {totals.length === 0 && pbs.length === 0 && (
            <Text className="text-sm text-muted-foreground">No data</Text>
          )}

          {/* Totals */}
          {totals.length > 0 && (
            <View>
              <Text className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Totals
              </Text>
              {totals.map((t) => (
                <View key={t.label} className="flex-row items-center justify-between py-0.5">
                  <Text className="text-sm text-muted-foreground">{t.label}</Text>
                  <Text className="text-sm font-medium">{t.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Personal Bests */}
          {pbs.length > 0 && (
            <View>
              <Text className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Personal Bests
              </Text>
              {pbs.map((pb) => (
                <View key={pb.label} className="flex-row items-center justify-between py-0.5">
                  <Text className="text-sm text-muted-foreground">{pb.label}</Text>
                  <Text className="text-sm font-medium">
                    {pb.value}
                    <Text className="text-xs text-muted-foreground"> · {pb.date}</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Progression charts */}
          <ExerciseCharts
            exercise={exercise}
            logs={logs}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
          />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Progression charts for one expanded exercise: one chart per tracked metric
 * with at least two sessions of data, plus the estimated-1RM chart (formula
 * named) when the exercise tracks both weight and reps. Mounted only while
 * expanded, so the series are computed lazily.
 */
function ExerciseCharts({
  exercise,
  logs,
  weightUnit,
  distanceUnit,
}: {
  exercise: ExerciseStats;
  logs: WorkoutLog[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}) {
  const series = useMemo(
    () => computeExerciseSeries(logs, exercise.exerciseId),
    [logs, exercise.exerciseId]
  );

  // e1RM only makes sense for exercises tracking both weight and reps.
  const tracksWeightReps =
    exercise.metricIds.includes('weight') && exercise.metricIds.includes('reps');
  const oneRmPoints = useMemo(
    () => (tracksWeightReps ? computeOneRmSeries(logs, exercise.exerciseId) : []),
    [tracksWeightReps, logs, exercise.exerciseId]
  );

  const formulaLabel = ONE_RM_FORMULA_LABELS[DEFAULT_ONE_RM_FORMULA];
  const chartableMetrics = exercise.metricIds.filter(
    (id) => (series[id]?.length ?? 0) >= 2
  );
  const hasOneRmChart = oneRmPoints.length >= 2;

  if (!hasOneRmChart && chartableMetrics.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground">
        Log this exercise in at least two sessions to see progression charts.
      </Text>
    );
  }

  return (
    <View className="gap-4">
      <Text className="text-xs font-medium uppercase text-muted-foreground">
        Progression
      </Text>

      {hasOneRmChart && (
        <ProgressionChart
          title={`Estimated 1RM (${formulaLabel})`}
          accessibilitySubject={`${exercise.exerciseName} estimated 1RM, ${formulaLabel} formula`}
          points={oneRmPoints}
          formatValue={(v) => formatMetricValue('weight', v, weightUnit, distanceUnit)}
        />
      )}

      {chartableMetrics.map((id) => {
        const points = series[id];
        if (!points) return null;
        return (
          <ProgressionChart
            key={id}
            title={METRICS[id].label}
            accessibilitySubject={`${exercise.exerciseName} ${METRICS[id].label.toLowerCase()}`}
            points={points}
            formatValue={(v) => formatMetricValue(id, v, weightUnit, distanceUnit)}
          />
        );
      })}
    </View>
  );
}

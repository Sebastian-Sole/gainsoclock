import { useQuery } from 'convex/react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { countWeightPrs } from '@/lib/achievements';
import { computeAllStats } from '@/lib/stats';
import { computeStreak } from '@/lib/streaks';
import { useHistoryStore } from '@/stores/history-store';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Data for the shareable monthly recap. Everything is computed client-side
 * from the history store plus the existing `listExternalWorkouts` query —
 * lines with no data are omitted by the card.
 */
export interface MonthlyRecapData {
  /** e.g. "June 2026" */
  monthLabel: string;
  workouts: number;
  /** Total volume in the user's current weight unit; null when zero. */
  totalVolume: { value: number; unit: 'kg' | 'lbs' } | null;
  /** Longest consecutive-day run within the month (Fitbull + synced days). */
  longestStreak: number;
  /** Exercise with the most completed sets this month. */
  topExercise: { name: string; sets: number } | null;
  /** Weight PRs set this month, relative to all loaded prior history. */
  prCount: number;
  externalWorkouts: number;
}

/**
 * Computes the current month's recap from client-side data.
 *
 * - Streak is rest-day-agnostic (planned rest days aren't applied here; a
 *   within-month consecutive-day run is what the share card claims).
 * - PR count = PRs whose session falls in this month, with baselines taken
 *   from all loaded prior history (difference of two `countWeightPrs` runs).
 */
export function useMonthlyRecap(): MonthlyRecapData {
  const logs = useHistoryStore((s) => s.logs);
  const weightUnit = useSettingsStore((s) => s.weightUnit);

  // Fixed at mount so the Convex query args stay referentially stable.
  const [now] = useState(() => new Date());
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);

  const externalRange = useMemo(
    () => ({ start: monthStart.getTime(), end: monthEnd.getTime() + 1 }),
    [monthStart, monthEnd]
  );
  const externalWorkouts = useQuery(api.healthData.listExternalWorkouts, externalRange);

  return useMemo(() => {
    const monthLogs = logs.filter((log) => {
      const d = new Date(log.startedAt);
      return d >= monthStart && d <= monthEnd;
    });

    const stats = computeAllStats(monthLogs, now);

    let topExercise: MonthlyRecapData['topExercise'] = null;
    for (const ex of stats.exerciseStats) {
      if (ex.totalSets > 0 && (!topExercise || ex.totalSets > topExercise.sets)) {
        topExercise = { name: ex.exerciseName, sets: ex.totalSets };
      }
    }

    const workoutDates = new Set<string>();
    for (const log of monthLogs) {
      workoutDates.add(format(new Date(log.startedAt), 'yyyy-MM-dd'));
    }
    const externalWorkoutDates = new Set<string>();
    for (const w of externalWorkouts ?? []) {
      externalWorkoutDates.add(format(new Date(w.startedAt), 'yyyy-MM-dd'));
    }
    const streak = computeStreak({
      workoutDates,
      externalWorkoutDates,
      restDates: new Set<string>(),
      today: format(now, 'yyyy-MM-dd'),
    });

    // PRs set during this month: baseline-aware difference over loaded logs.
    const logsBeforeMonth = logs.filter((log) => new Date(log.startedAt) < monthStart);
    const logsThroughMonth = logs.filter((log) => new Date(log.startedAt) <= monthEnd);
    const prCount = countWeightPrs(logsThroughMonth) - countWeightPrs(logsBeforeMonth);

    return {
      monthLabel: format(now, 'MMMM yyyy'),
      workouts: stats.totals.totalWorkouts,
      totalVolume:
        stats.totals.totalWeightLifted > 0
          ? { value: stats.totals.totalWeightLifted, unit: weightUnit }
          : null,
      longestStreak: streak.longest,
      topExercise,
      prCount,
      externalWorkouts: externalWorkouts?.length ?? 0,
    };
  }, [logs, externalWorkouts, weightUnit, now, monthStart, monthEnd]);
}

// Rendered at 360x640 pt and captured at 1080x1920 px by the share flow.
export const RECAP_CARD_WIDTH = 360;
export const RECAP_CARD_HEIGHT = 640;

/** Fixed-size text for the captured image — opts out of Dynamic Type so the
 * 360x640 layout can't overflow at large accessibility sizes. */
function CardText(props: React.ComponentProps<typeof Text>) {
  return <Text allowFontScaling={false} {...props} />;
}

function RecapStat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <CardText className="text-4xl font-extrabold text-white" numberOfLines={1}>
        {value}
      </CardText>
      <CardText className="text-xs font-semibold uppercase tracking-widest text-white/80">
        {label}
      </CardText>
    </View>
  );
}

interface MonthlyRecapCardProps {
  data: MonthlyRecapData;
  ref?: React.Ref<View>;
}

/**
 * The shareable recap artwork. Rendered offscreen by the achievements screen
 * and snapshotted with react-native-view-shot — it is an image, not
 * interactive UI, so it intentionally uses fixed sizes and brand colors
 * (white-on-primary stays on-brand in both color schemes).
 */
export function MonthlyRecapCard({ data, ref }: MonthlyRecapCardProps) {
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: RECAP_CARD_WIDTH, height: RECAP_CARD_HEIGHT }}
      className="justify-between overflow-hidden bg-primary p-8"
    >
      {/* Faux gradient: layered tonal shapes over the brand orange (no
          gradient library in the project). */}
      <View
        pointerEvents="none"
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10"
      />
      <View
        pointerEvents="none"
        className="absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-white/5"
      />
      <View
        pointerEvents="none"
        className="absolute inset-x-0 bottom-0 h-1/3 bg-black/10"
      />

      <View>
        <CardText className="text-xs font-bold uppercase tracking-widest text-white/80">
          My month in the gym
        </CardText>
        <CardText className="mt-1 text-3xl font-extrabold text-white">
          {data.monthLabel} on Fitbull
        </CardText>
      </View>

      <View className="gap-5">
        <RecapStat
          value={`${data.workouts}`}
          label={data.workouts === 1 ? 'Workout' : 'Workouts'}
        />
        {data.totalVolume && (
          <RecapStat
            value={`${Math.round(data.totalVolume.value).toLocaleString()} ${data.totalVolume.unit}`}
            label="Total volume"
          />
        )}
        {data.longestStreak > 0 && (
          <RecapStat
            value={`${data.longestStreak} ${data.longestStreak === 1 ? 'day' : 'days'}`}
            label="Longest streak"
          />
        )}
        {data.topExercise && (
          <View>
            <CardText className="text-2xl font-extrabold text-white" numberOfLines={1}>
              {data.topExercise.name}
            </CardText>
            <CardText className="text-xs font-semibold uppercase tracking-widest text-white/80">
              Top exercise · {data.topExercise.sets} sets
            </CardText>
          </View>
        )}
        {data.prCount > 0 && (
          <RecapStat
            value={`${data.prCount}`}
            label={data.prCount === 1 ? 'Personal record' : 'Personal records'}
          />
        )}
        {data.externalWorkouts > 0 && (
          <RecapStat value={`${data.externalWorkouts}`} label="Synced workouts" />
        )}
      </View>

      <View className="flex-row items-center justify-between">
        <CardText className="text-lg font-extrabold uppercase tracking-[4px] text-white">
          Fitbull
        </CardText>
        <CardText className="text-xs font-semibold text-white/70">
          Train. Track. Repeat.
        </CardText>
      </View>
    </View>
  );
}

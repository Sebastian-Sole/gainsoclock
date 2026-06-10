import { useQuery } from 'convex/react';
import { format } from 'date-fns';
import { useMemo } from 'react';

import { api } from '@/convex/_generated/api';
import { computeAllStats, filterLogsByDateRange, type AllStats, type DateRangeFilter } from '@/lib/stats';
import { collectPlanRestDates, computeStreak } from '@/lib/streaks';
import { useHistoryStore } from '@/stores/history-store';
import { usePlanStore } from '@/stores/plan-store';
import { useSettingsStore } from '@/stores/settings-store';

export function useStats(filter: DateRangeFilter): AllStats {
  const logs = useHistoryStore((s) => s.logs);
  const loadedRange = useHistoryStore((s) => s.loadedRange);
  const activePlan = usePlanStore((s) => s.activePlanWithDays);
  const weekStartDay = useSettingsStore((s) => s.weekStartDay);

  // External (synced) workouts for the streak computation. Wiring choice:
  // `useExternalWorkouts` (history-tab) only covers a 3-month calendar window
  // around a viewed month, which is too narrow for longest-streak history. We
  // instead subscribe to the existing `listExternalWorkouts` query over the
  // same window the history store keeps Fitbull logs for (`loadedRange`), so
  // streaks compare like-for-like data. Returns [] when signed out/loading,
  // so local stats are never blocked.
  const externalRange = useMemo(
    () => ({
      start: new Date(loadedRange.from).getTime(),
      // loadedRange.to is inclusive (23:59:59.999); the query range is
      // half-open [start, end), so add 1ms to cover the final instant.
      end: new Date(loadedRange.to).getTime() + 1,
    }),
    [loadedRange]
  );
  const externalWorkouts = useQuery(api.healthData.listExternalWorkouts, externalRange);

  return useMemo(() => {
    const filtered = filterLogsByDateRange(logs, filter);
    const now = new Date();
    const stats = computeAllStats(filtered, now);

    // ── Streaks: rest-day-aware + mesh-aware (lib/streaks.ts) ──
    const workoutDates = new Set<string>();
    for (const log of filtered) {
      workoutDates.add(format(new Date(log.startedAt), 'yyyy-MM-dd'));
    }

    // Apply the same date-range filter the logs get, so a bounded preset
    // (e.g. 30D) treats external workouts and Fitbull logs identically.
    const externalWorkoutDates = new Set<string>();
    for (const w of externalWorkouts ?? []) {
      if (filter.from && w.startedAt < filter.from.getTime()) continue;
      if (filter.to) {
        const endOfDay = new Date(filter.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (w.startedAt > endOfDay.getTime()) continue;
      }
      externalWorkoutDates.add(format(new Date(w.startedAt), 'yyyy-MM-dd'));
    }

    // Planned rest days are only honest adherence while the plan is active.
    // Only the active plan's days are available client-side; rest days from
    // past plans are not considered (documented limitation).
    const restDates =
      activePlan && activePlan.status === 'active'
        ? collectPlanRestDates(activePlan, weekStartDay)
        : new Set<string>();

    const streak = computeStreak({
      workoutDates,
      externalWorkoutDates,
      restDates,
      today: format(now, 'yyyy-MM-dd'),
    });

    return {
      ...stats,
      streaks: {
        currentStreak: streak.current,
        longestStreak: streak.longest,
        longestStreakStart: streak.longestStart,
        longestStreakEnd: streak.longestEnd,
        todayCovered: streak.todayCovered,
        includesExternal: streak.currentIncludesExternal,
      },
    };
  }, [logs, filter, externalWorkouts, activePlan, weekStartDay]);
}

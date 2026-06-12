import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { addMonths, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { useMemo } from 'react';

import { api } from '@/convex/_generated/api';

export type ExternalWorkout = FunctionReturnType<
  typeof api.healthData.listExternalWorkouts
>[number];

const EMPTY: ExternalWorkout[] = [];

/**
 * Subscribes to external (Apple Health) workouts for the calendar window
 * around `currentMonth` — previous month start through next month end —
 * the same window the History calendar renders while swiping between months.
 *
 * Returns [] while the query is loading and when signed out, so rendering of
 * local workout history is never blocked by this subscription.
 */
export function useExternalWorkouts(currentMonth: Date): ExternalWorkout[] {
  const range = useMemo(() => {
    const start = startOfMonth(subMonths(currentMonth, 1)).getTime();
    // listExternalWorkouts uses a half-open [start, end) range; endOfMonth is
    // inclusive (23:59:59.999), so add 1ms to cover the final instant.
    const end = endOfMonth(addMonths(currentMonth, 1)).getTime() + 1;
    return { start, end };
  }, [currentMonth]);

  return useQuery(api.healthData.listExternalWorkouts, range) ?? EMPTY;
}

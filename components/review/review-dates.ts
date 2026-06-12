import { addDays, format, startOfWeek, subWeeks } from 'date-fns';

/**
 * How many completed weeks back the review screen can page (in addition to
 * the most recently completed week).
 */
export const MAX_WEEKS_BACK = 4;

/**
 * `weekStart` for the weekly review contract: YYYY-MM-DD of the local Monday
 * of a COMPLETED week. `weeksBack = 0` is the most recently completed week
 * (last Monday..Sunday), `weeksBack = 1` the week before that, etc.
 *
 * Note: the review week is always Monday-anchored per the backend contract,
 * independent of the user's `weekStartDay` setting.
 */
export function completedWeekStart(weeksBack = 0, now = new Date()): string {
  const currentMonday = startOfWeek(now, { weekStartsOn: 1 });
  return format(subWeeks(currentMonday, 1 + weeksBack), 'yyyy-MM-dd');
}

/** Parse a YYYY-MM-DD weekStart as a local date (avoids UTC shift). */
export function parseWeekStart(weekStart: string): Date {
  return new Date(`${weekStart}T00:00:00`);
}

/** "Feb 24 – Mar 2", or "Feb 17 – 23" when the week stays in one month. */
export function formatWeekRange(weekStart: string): string {
  const start = parseWeekStart(weekStart);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')} – ${format(end, 'd')}`;
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

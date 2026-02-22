import type { WeekStartDay } from './types';

/**
 * Computes the actual calendar date for a plan day.
 *
 * startDate is the first day of Week 1 (should be a Monday for monday-start users).
 * dayOfWeek: 0=Sun..6=Sat (JS convention)
 * weekStartDay: 'monday' | 'sunday'
 */
export function getPlanDayDate(
  startDate: string,
  week: number,
  dayOfWeek: number,
  weekStartDay: WeekStartDay
): Date {
  const start = new Date(startDate + 'T00:00:00');
  const weekStartDow = weekStartDay === 'monday' ? 1 : 0;

  // Convert dayOfWeek to offset from week start
  let dayOffset = dayOfWeek - weekStartDow;
  if (dayOffset < 0) dayOffset += 7;

  const totalDays = (week - 1) * 7 + dayOffset;
  const date = new Date(start);
  date.setDate(date.getDate() + totalDays);
  return date;
}

/** Check if a date is today (local time) */
export function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Check if a date is in the past (before today, local time) */
export function isPast(date: Date): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date < today;
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Format: "Mon, Feb 24" */
export function formatPlanDate(date: Date): string {
  return `${SHORT_DAYS[date.getDay()]}, ${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

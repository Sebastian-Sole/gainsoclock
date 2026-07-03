import { format } from 'date-fns';

/**
 * Pure scheduling decisions for `lib/notifications.ts`.
 *
 * This module owns the "should we fire, and when" logic that used to be
 * welded to the native notification calls inside `lib/notifications.ts`. It
 * has zero dependencies on native modules or app state containers — every
 * input the impure wrapper would normally read from a store or the clock is
 * passed in as a plain argument, including `now` (and `target`, where
 * relevant), so tests never need fake timers.
 */

// --- Daily workout reminder (today vs. tomorrow) ---

export type DailyReminderPlan =
  | { kind: 'one-shot-tomorrow'; seconds: number }
  | { kind: 'repeating-daily' };

/**
 * Decide whether the daily workout reminder should fire as a repeating
 * DAILY trigger, or be suppressed for today and rescheduled as a one-shot
 * for tomorrow (when a workout was already logged today and today's
 * reminder time hasn't passed yet).
 */
export function planDailyReminder(args: {
  now: Date;
  hour: number;
  minute: number;
  lastWorkoutLoggedDate: string | null | undefined;
}): DailyReminderPlan {
  const { now, hour, minute, lastWorkoutLoggedDate } = args;

  const todayStr = format(now, 'yyyy-MM-dd');
  const reminderToday = new Date(now);
  reminderToday.setHours(hour, minute, 0, 0);
  if (lastWorkoutLoggedDate === todayStr && now < reminderToday) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hour, minute, 0, 0);
    return {
      kind: 'one-shot-tomorrow',
      seconds: Math.max(1, Math.floor((tomorrow.getTime() - now.getTime()) / 1000)),
    };
  }

  return { kind: 'repeating-daily' };
}

// --- Evening protein nudge (skip vs. schedule) ---

export type ProteinNudgeDecision =
  | { kind: 'skip' }
  | { kind: 'schedule'; secondsUntil: number; remaining: number };

/**
 * Decide whether the evening protein nudge should be skipped or scheduled.
 * Skips when: disabled, hour/minute is not finite, no protein goal is set,
 * the goal is already met (remaining rounds to <= 0), or the target time
 * has already passed today.
 *
 * `remaining` is returned on the `schedule` branch because the caller uses
 * the same value in the notification body — this avoids recomputing the
 * formula a second time in the impure wrapper.
 */
export function decideProteinNudge(args: {
  now: Date;
  target: Date;
  enabled: boolean;
  hour: number;
  minute: number;
  proteinGoal: number;
  proteinConsumedToday: number;
}): ProteinNudgeDecision {
  const { now, target, enabled, hour, minute, proteinGoal, proteinConsumedToday } = args;

  const remaining = Math.round(proteinGoal - proteinConsumedToday);

  const shouldSkip =
    !enabled ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    proteinGoal <= 0 ||
    remaining <= 0 ||
    target.getTime() <= now.getTime();

  if (shouldSkip) return { kind: 'skip' };

  const secondsUntil = Math.max(1, Math.floor((target.getTime() - now.getTime()) / 1000));

  return { kind: 'schedule', secondsUntil, remaining };
}

// --- Weekly review weekday clamp ---

/**
 * Clamp a persisted weekly-review weekday to the valid 0-6 (Sunday-Saturday)
 * range, guarding against persisted-state drift. Non-integer input falls
 * back to 0 (Sunday). Callers add 1 to convert to the native notification
 * scheduler's 1-7 (1 = Sunday) weekday convention.
 */
export function clampReviewWeekday(day: number): number {
  return Number.isInteger(day) ? Math.min(6, Math.max(0, day)) : 0;
}

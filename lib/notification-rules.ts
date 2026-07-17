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
 * Whether any evidence says a workout happened today. Evidence sources:
 * - `lastWorkoutLoggedDate`: stamped by this device when a workout finishes
 *   in-app or a today-dated Apple Health workout is imported.
 * - `logDates`: local `yyyy-MM-dd` start dates of history-store logs, which
 *   also cover workouts synced in from other devices and edited/imported logs.
 */
export function hasWorkoutToday(args: {
  todayStr: string;
  lastWorkoutLoggedDate: string | null | undefined;
  logDates: Iterable<string>;
}): boolean {
  if (args.lastWorkoutLoggedDate === args.todayStr) return true;
  for (const date of args.logDates) {
    if (date === args.todayStr) return true;
  }
  return false;
}

/**
 * Decide whether the daily workout reminder should fire as a repeating
 * DAILY trigger, or be suppressed for today and rescheduled as a one-shot
 * for tomorrow. Today is suppressed when the reminder time hasn't passed
 * yet and either a workout already happened today, or one is in progress
 * right now — a "go work out" nudge mid-workout is wrong, and since a
 * backgrounded app can't consult JS state at fire time, the suppression
 * has to happen here at scheduling time.
 */
export function planDailyReminder(args: {
  now: Date;
  hour: number;
  minute: number;
  workedOutToday: boolean;
  /** A workout is active right now (not yet finished/logged). */
  workoutInProgress?: boolean;
}): DailyReminderPlan {
  const { now, hour, minute, workedOutToday, workoutInProgress } = args;

  const reminderToday = new Date(now);
  reminderToday.setHours(hour, minute, 0, 0);
  if ((workedOutToday || workoutInProgress) && now < reminderToday) {
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

// --- Streak-risk reminder (schedule tonight?) ---

export type StreakRiskDecision =
  | { schedule: false }
  | { schedule: true; secondsFromNow: number; streakLength: number };

/**
 * Decides whether tonight's streak-risk reminder should fire.
 *
 * Rules (in order):
 * - disabled → never schedule
 * - no active streak (`currentStreak <= 0`) → nothing to protect
 * - today already covered → the streak isn't at risk
 * - the configured fire time has already passed for today → never fire after
 *   the fact; the streak is either already broken or already safe, and a
 *   late-night ping teaches nothing. The next foreground/settings-change pass
 *   re-evaluates fresh against the new day.
 */
export function decideStreakRisk(args: {
  enabled: boolean;
  currentStreak: number;
  todayCovered: boolean;
  now: Date; // local time
  fireHour: number; // from settings, default 18
  fireMinute: number;
}): StreakRiskDecision {
  const { enabled, currentStreak, todayCovered, now, fireHour, fireMinute } = args;

  if (!enabled || currentStreak <= 0 || todayCovered) {
    return { schedule: false };
  }

  const target = new Date(now);
  target.setHours(fireHour, fireMinute, 0, 0);

  if (target.getTime() <= now.getTime()) {
    return { schedule: false };
  }

  const secondsFromNow = Math.max(1, Math.floor((target.getTime() - now.getTime()) / 1000));

  return { schedule: true, secondsFromNow, streakLength: currentStreak };
}

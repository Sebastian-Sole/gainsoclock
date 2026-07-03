/**
 * Pure notification-scheduling decisions. No imports from expo modules or
 * Zustand stores — callers (lib/notifications.ts) read settings/streak state
 * and pass plain values in, so this module stays trivially unit-testable.
 */

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

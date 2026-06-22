// Shared fitness-metric helpers for server-side features (chat context,
// post-workout feedback, weekly review). NOTE: the client computes its own
// rest-day-aware streak in lib/streaks.ts — these are deliberately simpler
// (consecutive UTC days ending today) and feed AI prompts/notifications only.

export const LBS_TO_KG = 0.45359237;

export function toKg(weight: number, weightUnit: string): number {
  return weightUnit === "lbs" ? weight * LBS_TO_KG : weight;
}

/**
 * Consecutive-day streak ending today (UTC days). `dates` are "YYYY-MM-DD"
 * prefixes of completedAt ISO strings. Identical to the previous inline
 * implementations in chatInternal.ts / workoutFeedback.ts.
 */
export function computeUtcDayStreak(
  dates: Set<string>,
  now: Date = new Date()
): number {
  let streak = 0;
  const checkDate = new Date(now);
  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (dates.has(dateStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

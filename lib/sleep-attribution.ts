/**
 * Sleep-night attribution: which local calendar day a sleep sample belongs to.
 *
 * Apple Health shows a night's sleep under the date the user woke up, and it
 * delivers a single night as many short stage samples (Core/Deep/REM) that
 * straddle midnight. Splitting each sample's duration across the calendar days
 * it overlaps (the old `queryDailyMetrics` behaviour) shattered one night into
 * two low half-nights — a 23:00→07:00 night became ~1h on day N and ~7h on day
 * N+1 — which the weekly review then averaged into an artificially low nightly
 * figure (and turned one tracked night into two).
 *
 * Instead, attribute each whole sample to ONE "sleep night" day using a 6 PM
 * boundary: sleep that starts at/after 18:00 local counts toward the NEXT
 * calendar day (the wake-up morning); earlier sleep — post-midnight fragments
 * and daytime naps — counts toward the day it started. All the stage samples of
 * a night therefore land on the same day and sum into one honest nightly total.
 */

// Local hour at/after which a sleep sample is attributed to the next day's
// night (the wake-up morning). Matches Apple Health's day-of-wake convention.
export const SLEEP_DAY_BOUNDARY_HOUR = 18;

/** Local "YYYY-MM-DD" key for a date, using the device's local calendar. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The local "YYYY-MM-DD" sleep-night key for a sample that starts at `startMs`
 * (ms epoch). Sleep starting at/after 6 PM rolls into the next morning's date.
 */
export function sleepNightKey(startMs: number): string {
  const start = new Date(startMs);
  const anchor =
    start.getHours() >= SLEEP_DAY_BOUNDARY_HOUR
      ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      : start;
  return localDateKey(anchor);
}

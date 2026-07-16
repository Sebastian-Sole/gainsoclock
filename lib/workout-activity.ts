import type { ExerciseType, MetricId } from '@/lib/types';

// Coarse activity buckets used to gate *automatic* merge suggestions between an
// imported (Apple Health) workout and a Fitbull log (#117, tier "suggest").
// Deliberately coarse: we only auto-suggest when both sides land in the SAME
// non-ambiguous bucket, so a running watch workout is never suggested for a
// strength log. Manual merge is never gated by this — the user can link any
// pair by hand.
export type ActivityBucket = 'strength' | 'cardio' | 'other';

// Cardio-ish HealthKit activity names (matched as substrings, case-insensitive)
// — locomotion, conditioning, and common sports. Not exhaustive on purpose:
// anything unrecognised falls through to 'other', which never auto-suggests.
const CARDIO_KEYWORDS = [
  'run', 'walk', 'hik', 'cycl', 'bik', 'swim', 'row', 'elliptical', 'stair',
  'interval', 'cardio', 'dance', 'jump', 'skat', 'ski', 'soccer', 'hockey',
  'basketball', 'tennis', 'boxing', 'kickboxing', 'paddle', 'surf', 'climb',
] as const;

/** Bucket for a HealthKit `activityType` string (e.g. "traditionalStrengthTraining"). */
export function classifyExternalActivity(activityType: string): ActivityBucket {
  const t = activityType.toLowerCase();
  if (t.includes('strength')) return 'strength';
  if (CARDIO_KEYWORDS.some((k) => t.includes(k))) return 'cardio';
  return 'other';
}

const REP_BASED: ReadonlySet<ExerciseType> = new Set([
  'reps_weight',
  'reps_only',
  'reps_time',
]);
const CARDIO_BASED: ReadonlySet<ExerciseType> = new Set([
  'time_only',
  'time_distance',
  'intervals',
]);

/** Bucket for a single logged exercise, using its type (and metrics if composed). */
function exerciseBucket(ex: { type: ExerciseType; metrics?: MetricId[] }): ActivityBucket {
  if (REP_BASED.has(ex.type)) return 'strength';
  if (CARDIO_BASED.has(ex.type)) return 'cardio';
  if (ex.type === 'metrics' && ex.metrics) {
    if (ex.metrics.includes('weight')) return 'strength';
    if (
      ex.metrics.includes('distance') ||
      ex.metrics.includes('pace') ||
      (ex.metrics as string[]).includes('speed')
    ) {
      return 'cardio';
    }
  }
  return 'other';
}

/**
 * Bucket for a Fitbull log from its exercises. Any rep/weight work makes it
 * 'strength' (this is primarily a lifting app); an all-cardio log is 'cardio';
 * an empty or purely-composed-without-signal log is 'other' (won't auto-suggest).
 */
export function classifyLogActivity(log: {
  exercises: Array<{ type: ExerciseType; metrics?: MetricId[] }>;
}): ActivityBucket {
  let sawCardio = false;
  for (const ex of log.exercises) {
    const b = exerciseBucket(ex);
    if (b === 'strength') return 'strength';
    if (b === 'cardio') sawCardio = true;
  }
  return sawCardio ? 'cardio' : 'other';
}

/**
 * Whether an imported workout and a log are compatible enough to *auto-suggest*
 * a merge: both in the same concrete bucket. An 'other' on either side is
 * treated as too ambiguous to suggest (but still manually mergeable).
 */
export function areActivitiesCompatible(
  externalActivityType: string,
  log: { exercises: Array<{ type: ExerciseType; metrics?: MetricId[] }> }
): boolean {
  const ext = classifyExternalActivity(externalActivityType);
  const logBucket = classifyLogActivity(log);
  return ext !== 'other' && logBucket !== 'other' && ext === logBucket;
}

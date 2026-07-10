import type { ExerciseType, IntervalDistanceUnit, MetricId, WorkoutLog, WorkoutLogExercise, WorkoutSet, WorkoutTemplate } from './types';
import { METRICS, metricUpdate, resolveExerciseMetrics } from './metrics';
import { generateId } from './id';

export const DEFAULT_REST_TIME = 90; // seconds
export const DEFAULT_SETS_COUNT = 3;

interface SuggestedValues {
  suggestedReps?: number;
  suggestedWeight?: number;
  suggestedTime?: number;
  suggestedDistance?: number;
  intervalDistanceUnit?: IntervalDistanceUnit;
}

const DEFAULT_WORK_SECONDS = 60;
const DEFAULT_REST_SECONDS = 30;

/** One interval = one set: a work segment (`time` + effort metric) and a rest
 *  segment (`restTime`). Replaces the old two-row work/rest pair. */
export function createIntervalSet(distanceUnit: IntervalDistanceUnit): WorkoutSet {
  return {
    id: generateId(),
    completed: false,
    type: 'intervals',
    metric: 'distance',
    time: DEFAULT_WORK_SECONDS,
    restTime: DEFAULT_REST_SECONDS,
    distanceUnit,
    distance: 0,
  };
}

/**
 * Collapse legacy interval data (adjacent 'work' + 'rest' rows) into single
 * sets. Idempotent: sets already in the single-set shape (no `variant`) pass
 * through untouched, so this is safe to run on every hydrate. A stray 'rest'
 * with no preceding 'work', or a 'work' with no following 'rest', is kept as a
 * lone work set (restTime 0) rather than dropped.
 */
export function normalizeIntervalSets(sets: WorkoutSet[]): WorkoutSet[] {
  if (!sets.some((s) => s.variant)) return sets;
  const out: WorkoutSet[] = [];
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (s.type !== 'intervals') {
      out.push(s);
      continue;
    }
    if (s.variant === 'rest') {
      // Orphaned rest (its work was already consumed, or none existed).
      continue;
    }
    const next = sets[i + 1];
    const restTime = next?.variant === 'rest' ? next.time ?? 0 : 0;
    if (next?.variant === 'rest') i++; // consume the paired rest row
    const { variant: _v, ...rest } = s;
    out.push({ ...rest, restTime });
  }
  return out;
}

/** Legacy suggested-value override for a metric, if any. */
function suggestedFor(id: MetricId, suggested?: SuggestedValues): number | undefined {
  switch (id) {
    case 'reps':
      return suggested?.suggestedReps;
    case 'weight':
      return suggested?.suggestedWeight;
    case 'duration':
      return suggested?.suggestedTime;
    case 'distance':
      return suggested?.suggestedDistance;
    default:
      return undefined;
  }
}

/**
 * Build one default set for an exercise. Non-interval sets seed a value for each
 * of the exercise's `metrics` (registry defaults, overridable via `suggested`).
 */
export function createDefaultSet(
  type: ExerciseType,
  metrics: MetricId[],
  suggested?: SuggestedValues
): WorkoutSet {
  if (type === 'intervals') {
    return createIntervalSet(suggested?.intervalDistanceUnit ?? 'km');
  }
  const set: WorkoutSet = { id: generateId(), completed: false, type };
  for (const id of resolveExerciseMetrics(type, metrics)) {
    const spec = METRICS[id];
    const value = suggestedFor(id, suggested) ?? spec.defaultValue;
    Object.assign(set, metricUpdate(spec.field, value));
  }
  return set;
}

export function createDefaultSets(
  type: ExerciseType,
  metrics: MetricId[],
  count = DEFAULT_SETS_COUNT,
  suggested?: SuggestedValues
): WorkoutSet[] {
  if (type === 'intervals') {
    const unit = suggested?.intervalDistanceUnit ?? 'km';
    return Array.from({ length: count }, () => createIntervalSet(unit));
  }
  return Array.from({ length: count }, () => createDefaultSet(type, metrics, suggested));
}

function getLogTimestamps(date: Date) {
  const completedAt = new Date(date);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    completedAt.setHours(now.getHours(), now.getMinutes(), 0, 0);
  } else {
    completedAt.setHours(12, 0, 0, 0);
  }

  const startedAt = new Date(completedAt.getTime() - 3600 * 1000);
  return { startedAt, completedAt };
}

export function createEmptyLog(date: Date): WorkoutLog {
  const { startedAt, completedAt } = getLogTimestamps(date);

  return {
    id: generateId(),
    templateName: '',
    exercises: [],
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationSeconds: 3600,
  };
}

export function createLogFromTemplate(date: Date, template: WorkoutTemplate): WorkoutLog {
  const { startedAt, completedAt } = getLogTimestamps(date);

  const exercises: WorkoutLogExercise[] = template.exercises.map((te, i) => ({
    id: generateId(),
    exerciseId: te.exerciseId,
    name: te.name,
    type: te.type,
    metrics: te.metrics,
    order: i,
    restTimeSeconds: te.restTimeSeconds,
    sets: createDefaultSets(te.type, te.metrics, te.defaultSetsCount, {
      suggestedReps: te.suggestedReps,
      suggestedWeight: te.suggestedWeight,
      suggestedTime: te.suggestedTime,
      suggestedDistance: te.suggestedDistance,
    }),
  }));

  return {
    id: generateId(),
    templateId: template.id,
    templateName: template.name,
    exercises,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationSeconds: 3600,
  };
}

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

function makeIntervalSet(
  variant: 'work' | 'rest',
  distanceUnit: IntervalDistanceUnit
): WorkoutSet {
  return {
    id: generateId(),
    completed: false,
    type: 'intervals',
    variant,
    metric: 'distance',
    time: variant === 'work' ? 60 : 30,
    distanceUnit,
    distance: 0,
  };
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
    return makeIntervalSet('work', suggested?.intervalDistanceUnit ?? 'km');
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
    return Array.from({ length: count }).flatMap(() => [
      makeIntervalSet('work', unit),
      makeIntervalSet('rest', unit),
    ]);
  }
  return Array.from({ length: count }, () => createDefaultSet(type, metrics, suggested));
}

/** Add a single (work, rest) interval pair to an existing intervals exercise's sets. */
export function createIntervalPair(distanceUnit: IntervalDistanceUnit): WorkoutSet[] {
  return [makeIntervalSet('work', distanceUnit), makeIntervalSet('rest', distanceUnit)];
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

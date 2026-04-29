import type { ExerciseType, IntervalDistanceUnit, IntervalSet, WorkoutLog, WorkoutLogExercise, WorkoutSet, WorkoutTemplate } from './types';
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
): IntervalSet {
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

export function createDefaultSet(type: ExerciseType, suggested?: SuggestedValues): WorkoutSet {
  const base = { id: generateId(), completed: false };

  switch (type) {
    case 'reps_weight':
      return { ...base, type: 'reps_weight', reps: suggested?.suggestedReps ?? 10, weight: suggested?.suggestedWeight ?? 0 };
    case 'reps_time':
      return { ...base, type: 'reps_time', reps: suggested?.suggestedReps ?? 10, time: suggested?.suggestedTime ?? 30 };
    case 'time_only':
      return { ...base, type: 'time_only', time: suggested?.suggestedTime ?? 60 };
    case 'time_distance':
      return { ...base, type: 'time_distance', time: suggested?.suggestedTime ?? 0, distance: suggested?.suggestedDistance ?? 0 };
    case 'reps_only':
      return { ...base, type: 'reps_only', reps: suggested?.suggestedReps ?? 10 };
    case 'intervals':
      return makeIntervalSet('work', suggested?.intervalDistanceUnit ?? 'km');
  }
}

export function createDefaultSets(type: ExerciseType, count = DEFAULT_SETS_COUNT, suggested?: SuggestedValues): WorkoutSet[] {
  if (type === 'intervals') {
    const unit = suggested?.intervalDistanceUnit ?? 'km';
    return Array.from({ length: count }).flatMap(() => [
      makeIntervalSet('work', unit),
      makeIntervalSet('rest', unit),
    ]);
  }
  return Array.from({ length: count }, () => createDefaultSet(type, suggested));
}

/** Add a single (work, rest) interval pair to an existing intervals exercise's sets. */
export function createIntervalPair(distanceUnit: IntervalDistanceUnit): IntervalSet[] {
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
    order: i,
    restTimeSeconds: te.restTimeSeconds,
    sets: createDefaultSets(te.type, te.defaultSetsCount, {
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

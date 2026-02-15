import type { ExerciseType, WorkoutSet } from './types';
import { generateId } from './id';

export const DEFAULT_REST_TIME = 90; // seconds
export const DEFAULT_SETS_COUNT = 3;

export function createDefaultSet(type: ExerciseType): WorkoutSet {
  const base = { id: generateId(), completed: false };

  switch (type) {
    case 'reps_weight':
      return { ...base, type: 'reps_weight', reps: 10, weight: 0 };
    case 'reps_time':
      return { ...base, type: 'reps_time', reps: 10, time: 30 };
    case 'time_only':
      return { ...base, type: 'time_only', time: 60 };
    case 'time_distance':
      return { ...base, type: 'time_distance', time: 0, distance: 0 };
    case 'reps_only':
      return { ...base, type: 'reps_only', reps: 10 };
  }
}

export function createDefaultSets(type: ExerciseType, count = DEFAULT_SETS_COUNT): WorkoutSet[] {
  return Array.from({ length: count }, () => createDefaultSet(type));
}

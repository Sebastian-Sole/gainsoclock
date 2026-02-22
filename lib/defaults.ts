import type { ExerciseType, WorkoutLog, WorkoutSet } from './types';
import { generateId } from './id';

export const DEFAULT_REST_TIME = 90; // seconds
export const DEFAULT_SETS_COUNT = 3;

interface SuggestedValues {
  suggestedReps?: number;
  suggestedWeight?: number;
  suggestedTime?: number;
  suggestedDistance?: number;
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
  }
}

export function createDefaultSets(type: ExerciseType, count = DEFAULT_SETS_COUNT, suggested?: SuggestedValues): WorkoutSet[] {
  return Array.from({ length: count }, () => createDefaultSet(type, suggested));
}

export function createEmptyLog(date: Date): WorkoutLog {
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

  return {
    id: generateId(),
    templateName: '',
    exercises: [],
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationSeconds: 3600,
  };
}

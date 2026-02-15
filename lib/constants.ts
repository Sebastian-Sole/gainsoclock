import type { ExerciseType } from './types';

export const REST_TIME_PRESETS = [30, 60, 90, 120, 180] as const;

export const EXERCISE_TYPE_CONFIG: Record<
  ExerciseType,
  { label: string; icon: string; description: string; columns: string[] }
> = {
  reps_weight: {
    label: 'Reps & Weight',
    icon: 'Dumbbell',
    description: 'Track repetitions and weight',
    columns: ['Set', 'Weight', 'Reps', ''],
  },
  reps_time: {
    label: 'Reps & Time',
    icon: 'Timer',
    description: 'Track repetitions and time',
    columns: ['Set', 'Time', 'Reps', ''],
  },
  time_only: {
    label: 'Time Only',
    icon: 'Clock',
    description: 'Track duration only',
    columns: ['Set', 'Time', ''],
  },
  time_distance: {
    label: 'Time & Distance',
    icon: 'Route',
    description: 'Track time and distance',
    columns: ['Set', 'Time', 'Distance', ''],
  },
  reps_only: {
    label: 'Reps Only',
    icon: 'Repeat',
    description: 'Track repetitions only',
    columns: ['Set', 'Reps', ''],
  },
};

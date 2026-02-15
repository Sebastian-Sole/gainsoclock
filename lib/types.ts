// Exercise types
export type ExerciseType =
  | 'reps_weight'
  | 'reps_time'
  | 'time_only'
  | 'time_distance'
  | 'reps_only';

// Workout Set types (discriminated union)
interface BaseSet {
  id: string;
  completed: boolean;
}

export interface RepsWeightSet extends BaseSet {
  type: 'reps_weight';
  reps: number;
  weight: number;
}

export interface RepsTimeSet extends BaseSet {
  type: 'reps_time';
  reps: number;
  time: number; // seconds
}

export interface TimeOnlySet extends BaseSet {
  type: 'time_only';
  time: number; // seconds
}

export interface TimeDistanceSet extends BaseSet {
  type: 'time_distance';
  time: number; // seconds
  distance: number;
}

export interface RepsOnlySet extends BaseSet {
  type: 'reps_only';
  reps: number;
}

export type WorkoutSet =
  | RepsWeightSet
  | RepsTimeSet
  | TimeOnlySet
  | TimeDistanceSet
  | RepsOnlySet;

// Exercise
export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  sets: WorkoutSet[];
  restTimeSeconds: number;
}

// Workout Template
export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: Exercise[];
  createdAt: string;
  updatedAt: string;
}

// Active Workout
export interface ActiveWorkout {
  id: string;
  templateId?: string;
  templateName: string;
  exercises: Exercise[];
  startedAt: string;
  isRestTimerActive: boolean;
  restTimeRemaining: number;
}

// Workout Log (completed workout)
export interface WorkoutLog {
  id: string;
  templateId?: string;
  templateName: string;
  exercises: Exercise[];
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
}

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

// Master exercise definition (from exercises table)
export interface ExerciseDefinition {
  id: string; // clientId
  name: string;
  type: ExerciseType;
  createdAt: string;
}

// Exercise as configured in a template
export interface TemplateExercise {
  id: string; // clientId of the templateExercise row
  exerciseId: string; // clientId referencing ExerciseDefinition
  name: string; // denormalized for display
  type: ExerciseType; // denormalized for display
  order: number;
  restTimeSeconds: number;
  defaultSetsCount: number;
}

// Exercise during an active workout (mutable sets)
export interface Exercise {
  id: string;
  exerciseId: string; // reference to master exercise
  name: string;
  type: ExerciseType;
  sets: WorkoutSet[];
  restTimeSeconds: number;
}

// Exercise as performed in a completed workout log
export interface WorkoutLogExercise {
  id: string; // clientId of the workoutLogExercise row
  exerciseId: string; // clientId referencing ExerciseDefinition
  name: string; // denormalized
  type: ExerciseType; // denormalized
  order: number;
  restTimeSeconds: number;
  sets: WorkoutSet[];
}

// Workout Template
export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: TemplateExercise[];
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
  exercises: WorkoutLogExercise[];
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
}

// Exercise "type".
// - The legacy six drive back-compat data and the intervals special case.
// - 'metrics' means "read the exercise's composed `metrics` list" (see
//   lib/metrics.ts). New exercises are created as 'metrics'; the legacy six
//   are mapped to an equivalent metrics list at read/migration time.
// - 'intervals' stays a standalone special case (work/rest pair structure).
export type ExerciseType =
  | 'reps_weight'
  | 'reps_time'
  | 'time_only'
  | 'time_distance'
  | 'reps_only'
  | 'intervals'
  | 'metrics';

// Curated palette of composable metric primitives. Registry: lib/metrics.ts.
export type MetricId =
  | 'reps'
  | 'weight'
  | 'duration'
  | 'distance'
  | 'power_avg'
  | 'heart_rate_avg'
  | 'pace'
  | 'speed'
  | 'incline'
  | 'cadence'
  | 'calories';

// How an exercise's entered weight relates to the total load moved. The
// stored weight is always what the user physically picks up (10 kg per
// dumbbell, not 20 kg combined). Absent = 'total'. Semantics, defaulting and
// effective-load math live in lib/load-mode.ts; mirror of
// convex/validators.ts loadModeValidator (drift-guarded in
// lib/types-drift.test-types.ts).
export type LoadMode = 'total' | 'per_hand' | 'per_side';

export type IntervalMetric = 'pace' | 'distance' | 'speed';
export type IntervalDistanceUnit = 'km' | 'mi';

// Workout Set — a flat row. Which fields are meaningful is driven by the parent
// exercise's `metrics` list (lib/metrics.ts), not by a per-type shape. Interval
// exercises (type 'intervals') additionally use variant/metric/distanceUnit.
// Kept flat (all metric fields optional) so an exercise can compose any subset
// of the palette; see docs/decisions/custom-exercise-metrics.md.
export interface WorkoutSet {
  id: string;
  completed: boolean;
  type: ExerciseType;
  // Legacy: intervals used to be stored as two sets (a 'work' then a 'rest'
  // row). They're now a single set with `time` = work and `restTime` = rest.
  // Kept optional so pre-migration data still parses; new sets never set it.
  variant?: 'work' | 'rest';
  rpe?: number; // 1-10, only when rpeEnabled
  // Metric values — present when the exercise tracks that metric.
  reps?: number;
  weight?: number;
  time?: number; // duration, seconds (for intervals: the WORK segment)
  restTime?: number; // intervals-only: the REST segment, seconds
  distance?: number;
  powerAvg?: number; // average watts
  heartRateAvg?: number; // average bpm
  cadence?: number; // strokes/rev per minute
  calories?: number; // kcal
  speed?: number; // per hour, e.g. 12 = 12 km/h
  paceSeconds?: number; // seconds per distance unit, e.g. 330 = 5:30/km
  incline?: number; // percent grade, e.g. 1.5 = 1.5%
  // Intervals-only
  metric?: IntervalMetric;
  distanceUnit?: IntervalDistanceUnit;
}

// Master exercise definition (from exercises table)
export interface ExerciseDefinition {
  id: string; // clientId
  name: string;
  type: ExerciseType;
  metrics: MetricId[]; // ordered composed metrics (empty for 'intervals')
  // Absent = 'total' (legacy). See lib/load-mode.ts.
  loadMode?: LoadMode;
  createdAt: string;
  // Soft-delete marker (epoch ms). Archived exercises are hidden from
  // pickers and the library's default view but keep working wherever they
  // are already referenced (templates, plans, logs, stats).
  archivedAt?: number;
}

// Exercise as configured in a template
export interface TemplateExercise {
  id: string; // clientId of the templateExercise row
  exerciseId: string; // clientId referencing ExerciseDefinition
  name: string; // denormalized for display
  type: ExerciseType; // denormalized for display
  metrics: MetricId[]; // denormalized for display/logging
  // Denormalized like `metrics`; suggestedWeight follows the same per-hand
  // convention. Absent = 'total'.
  loadMode?: LoadMode;
  order: number;
  restTimeSeconds: number;
  defaultSetsCount: number;
  suggestedReps?: number;
  suggestedWeight?: number;
  suggestedTime?: number;
  suggestedDistance?: number;
}

// Exercise during an active workout (mutable sets)
export interface Exercise {
  id: string;
  exerciseId: string; // reference to master exercise
  name: string;
  type: ExerciseType;
  metrics: MetricId[];
  // Absent = 'total'. Drives the "per hand / per side" weight-field labels
  // in the set loggers; carried into the log on finish.
  loadMode?: LoadMode;
  sets: WorkoutSet[];
  restTimeSeconds: number;
}

// Exercise as performed in a completed workout log
export interface WorkoutLogExercise {
  id: string; // clientId of the workoutLogExercise row
  exerciseId: string; // clientId referencing ExerciseDefinition
  name: string; // denormalized
  type: ExerciseType; // denormalized
  metrics: MetricId[]; // denormalized
  // Load mode AT LOG TIME. Absent (all pre-flag logs) = 'total', so
  // historical stats/e1RM/volume are unchanged in interpretation.
  loadMode?: LoadMode;
  order: number;
  restTimeSeconds: number;
  sets: WorkoutSet[];
}

// Workout Template
export interface WorkoutTemplate {
  id: string;
  name: string;
  notes?: string;
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
  restTimerEndsAt?: number; // Unix ms timestamp — survives backgrounding
  restTimerExerciseName?: string; // Shown in the rest-timer Live Activity
  planDayId?: string; // If started from a workout plan day
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

// Chat types
export interface ChatConversation {
  id: string; // clientId
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export type ApprovalType = 'create_template' | 'create_plan' | 'update_plan' | 'create_recipe';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PendingApproval {
  type: ApprovalType;
  payload: string; // JSON string of proposed data
  status: ApprovalStatus;
}

export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatMessageStatus = 'complete' | 'streaming' | 'error';

export interface ChatMessage {
  _id: string; // Convex document ID (server-side only, no clientId)
  conversationClientId: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  toolCalls?: ToolCall[];
  pendingApproval?: PendingApproval;
  createdAt: string;
}

// Workout Plan types
export type PlanStatus = 'active' | 'completed' | 'paused';
export type PlanDayStatus = 'pending' | 'completed' | 'skipped' | 'rest';

export interface WorkoutPlan {
  id: string; // clientId
  name: string;
  description: string;
  goal?: string;
  durationWeeks: number;
  startDate: string;
  status: PlanStatus;
  sourceConversationClientId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDay {
  planClientId: string;
  week: number;
  dayOfWeek: number; // 0=Sun..6=Sat
  templateClientId?: string;
  label?: string;
  notes?: string;
  status: PlanDayStatus;
  workoutLogClientId?: string;
}

// Recipe types
export interface Ingredient {
  name: string;
  amount: string;
  unit?: string;
  macros?: Macros;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// Saved ingredient library (mirrors convex/validators.ts
// ingredientSourceValidator and the `ingredients` table)
export type IngredientSource = 'barcode' | 'photo' | 'manual';

export interface SavedIngredient {
  id: string; // clientId
  name: string;
  per100g: Macros;
  servingSizeG?: number;
  barcode?: string;
  imageUrl?: string;
  source: IngredientSource;
  createdAt: string;
}

export interface Recipe {
  id: string; // clientId
  title: string;
  description: string;
  notes?: string;
  ingredients: Ingredient[];
  instructions: string[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  macros?: Macros;
  tags?: string[];
  sourceConversationClientId?: string;
  saved: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface MealLog {
  id: string; // clientId
  date: string; // YYYY-MM-DD
  recipeClientId?: string;
  title: string;
  portionMultiplier: number;
  macros: Macros;
  notes?: string;
  loggedAt: string;
}

export interface NutritionGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type WeekStartDay = 'monday' | 'sunday';

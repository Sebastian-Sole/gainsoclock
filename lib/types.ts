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
  variant?: 'work' | 'rest';
  rpe?: number; // 1-10, only when rpeEnabled
  // Metric values — present when the exercise tracks that metric.
  reps?: number;
  weight?: number;
  time?: number; // duration, seconds
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
  createdAt: string;
}

// Exercise as configured in a template
export interface TemplateExercise {
  id: string; // clientId of the templateExercise row
  exerciseId: string; // clientId referencing ExerciseDefinition
  name: string; // denormalized for display
  type: ExerciseType; // denormalized for display
  metrics: MetricId[]; // denormalized for display/logging
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

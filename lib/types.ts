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

/**
 * Compile-time drift tripwire between lib/types.ts (client set/exercise
 * unions) and convex/validators.ts (server source of truth).
 *
 * Imported nowhere; type-checked via tsconfig's include glob. If either
 * side changes shape without the other, one of the assignments below stops
 * compiling — turning silent runtime ArgumentValidationErrors into tsc
 * errors. See docs/decisions/validator-derived-types.md.
 *
 * NOT a runtime test. There is no test runner in this project; do not migrate
 * this file to one without a stack-level discussion.
 */
import type { Infer } from "convex/values";
import {
  workoutSetValidator,
  exerciseTypeValidator,
  metricIdValidator,
} from "@/convex/validators";
import type { WorkoutSet, ExerciseType, MetricId } from "@/lib/types";

type ServerSet = Infer<typeof workoutSetValidator>;
type ServerExerciseType = Infer<typeof exerciseTypeValidator>;
type ServerMetricId = Infer<typeof metricIdValidator>;

// Mutual assignability — both directions must hold.
// If either side adds, removes, or renames a field the assignment on that
// side stops compiling, surfacing the drift as a tsc error instead of a
// runtime ArgumentValidationError from the Convex offline queue.
const _setToServer = (s: WorkoutSet): ServerSet => s;
const _setFromServer = (s: ServerSet): WorkoutSet => s;
const _etToServer = (e: ExerciseType): ServerExerciseType => e;
const _etFromServer = (e: ServerExerciseType): ExerciseType => e;
const _midToServer = (m: MetricId): ServerMetricId => m;
const _midFromServer = (m: ServerMetricId): MetricId => m;

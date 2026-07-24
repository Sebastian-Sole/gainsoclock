// Pure projection + replay layer for the workout Live Activity.
//
// The lock-screen Live Activity can only show buttons (no text input), so the
// card renders the current set's first two *editable* metrics as ± stepper
// rows — a projection of the same MetricSpec registry that drives Focus Mode
// (lib/metrics.ts). Taps are handled natively by App Intents while JS is
// asleep; they append ActivityEvents to an App Group event log which
// `planEventReplay` turns back into store actions on the next foreground.
// Everything in this file is pure so it stays vitest-testable (lib/** scope).
//
// The native side (targets/workout-widget + modules/fitbull-workout-activity)
// consumes ActivitySessionPlan as JSON and produces ActivityEvent JSON; the
// shapes below are that contract. Bump PLAN_SCHEMA_VERSION on breaking change.
import type { ActiveWorkout, Exercise, WorkoutSet } from '@/lib/types';
import type { MetricField, MetricInputKind, MetricSpec } from '@/lib/metrics';
import { METRICS, metricUpdate, resolveExerciseMetricsLoose, readMetricValue } from '@/lib/metrics';

export const PLAN_SCHEMA_VERSION = 1;

/** One ± stepper row on the lock-screen card (max 2 per set). */
export interface ActivityMetricRow {
  metricId: string;
  field: MetricField;
  /** Short label rendered beside the value ("kg", "reps", "km", "Watts"). */
  label: string;
  kind: MetricInputKind;
  value: number;
  step: number;
}

/** One pending set, in workout order. The native side walks this queue. */
export interface ActivityPlanEntry {
  /** Active-workout ids (NOT master-exercise ids) — replay targets these. */
  exerciseId: string;
  setId: string;
  exerciseName: string;
  /** 0-based position within the exercise, for "Set 3 of 5". */
  setIndex: number;
  setCount: number;
  rows: ActivityMetricRow[];
  /** Labels of tracked-but-not-steppable metrics, e.g. "Pace, Avg HR". */
  moreLabel?: string;
  /** Render a live derived pace line (duration ÷ distance) under the rows. */
  derivePace: boolean;
  /** Rest countdown to start after this set logs, seconds. 0 = none. */
  restSeconds: number;
  /** Lock-screen logging disabled (in-app stopwatch owns this exercise's
   *  timing); the card shows an open-app hint instead of Log set. */
  openAppOnly: boolean;
}

/** Snapshot of the whole remaining session, written to the App Group. */
export interface ActivitySessionPlan {
  schemaVersion: number;
  workoutId: string;
  workoutName: string;
  startedAtEpochMs: number;
  queue: ActivityPlanEntry[];
  totalSets: number;
  completedSets: number;
  /** Mirror of the running rest timer so native renders it on relaunch. */
  restEndsAtEpochMs?: number;
  restExerciseName?: string;
  /** Settings gate mirrored for the natively scheduled rest-end notification. */
  restNotificationsEnabled: boolean;
}

/** Events appended by the native App Intents, oldest first. */
export type ActivityEvent =
  | {
      type: 'setLogged';
      workoutId: string;
      exerciseId: string;
      setId: string;
      /** Final row values after native stepping; {} when logged untouched. */
      values: Partial<Record<MetricField, number>>;
      at: number;
    }
  | { type: 'restStarted'; workoutId: string; endsAtEpochMs: number; exerciseName?: string; at: number }
  | { type: 'restSkipped'; workoutId: string; at: number }
  | { type: 'finishRequested'; workoutId: string; at: number };

/** Store mutations the reconcile hook should perform, in order. */
export type ReplayAction =
  | { kind: 'logSet'; exerciseId: string; setId: string; updates: Partial<WorkoutSet> }
  | { kind: 'startRest'; seconds: number; exerciseName?: string }
  | { kind: 'stopRest' };

export interface ReplayResult {
  actions: ReplayAction[];
  finishRequested: boolean;
}

/** Pace derives from duration ÷ distance; steppers would fight the solver. */
function isSteppable(kind: MetricInputKind): boolean {
  return kind !== 'pace';
}

/** Same default as Focus Mode's stepper (focus-set-card.tsx). */
function stepFor(kind: MetricInputKind, value: number, specStep?: number): number {
  if (specStep !== undefined) return specStep;
  if (kind === 'duration') return value < 120 ? 5 : 15;
  if (kind === 'decimal') return 0.5;
  return 1;
}

function rowLabel(spec: MetricSpec, weightUnit: string, distanceUnit: string): string {
  if (spec.id === 'weight') return weightUnit;
  if (spec.id === 'distance') return distanceUnit;
  return spec.unit ?? spec.columnLabel.toLowerCase();
}

export interface ProjectionOptions {
  weightUnit: string;
  distanceUnit: string;
  restNotificationsEnabled: boolean;
}

/** Project one set onto its lock-screen rows (strict two-row cap). */
export function projectEntry(
  exercise: Exercise,
  set: WorkoutSet,
  setIndex: number,
  opts: ProjectionOptions
): ActivityPlanEntry {
  const base = {
    exerciseId: exercise.id,
    setId: set.id,
    exerciseName: exercise.name,
    setIndex,
    setCount: exercise.sets.length,
    restSeconds: exercise.restTimeSeconds,
  };

  // Intervals have no flat metric list; keep the one-tap log, skip steppers.
  if (exercise.type === 'intervals') {
    return { ...base, rows: [], derivePace: false, openAppOnly: false };
  }

  // Loose resolver: this projection runs against ANY persisted workout at the
  // app root, so unknown/stale metric ids must drop out rather than throw
  // (same boundary rule as server hydration — lib/metrics.ts).
  const metricIds = resolveExerciseMetricsLoose(exercise.type, exercise.metrics);
  const specs = metricIds.map((id) => METRICS[id]);
  const rows: ActivityMetricRow[] = [];
  const more: string[] = [];

  for (const spec of specs) {
    if (rows.length < 2 && isSteppable(spec.inputKind)) {
      const value = readMetricValue(set, spec.id) ?? 0;
      rows.push({
        metricId: spec.id,
        field: spec.field,
        label: rowLabel(spec, opts.weightUnit, opts.distanceUnit),
        kind: spec.inputKind,
        value,
        step: stepFor(spec.inputKind, value, spec.step),
      });
    } else {
      more.push(spec.label);
    }
  }

  const derivePace =
    metricIds.includes('pace') &&
    metricIds.includes('duration') &&
    metricIds.includes('distance');

  return {
    ...base,
    rows,
    moreLabel: more.length > 0 ? more.join(', ') : undefined,
    derivePace,
    openAppOnly: false,
  };
}

/**
 * Build the App Group session plan from the active workout. Returns null when
 * there is nothing to show (no workout). An all-sets-done workout still gets a
 * plan (empty queue) so the native card can offer Finish.
 */
export function buildSessionPlan(
  workout: ActiveWorkout | null,
  opts: ProjectionOptions
): ActivitySessionPlan | null {
  if (!workout) return null;

  const queue: ActivityPlanEntry[] = [];
  let totalSets = 0;
  let completedSets = 0;

  for (const exercise of workout.exercises) {
    // A live stopwatch session owns this exercise's timing — logging its sets
    // from the lock screen would race the in-app commit flow.
    const stopwatchOwned = workout.stopwatch?.exerciseId === exercise.id;
    exercise.sets.forEach((s, i) => {
      totalSets += 1;
      if (s.completed) {
        completedSets += 1;
        return;
      }
      const entry = projectEntry(exercise, s, i, opts);
      queue.push(stopwatchOwned ? { ...entry, rows: [], derivePace: false, openAppOnly: true } : entry);
    });
  }

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    workoutId: workout.id,
    workoutName: workout.templateName,
    startedAtEpochMs: new Date(workout.startedAt).getTime(),
    queue,
    totalSets,
    completedSets,
    restEndsAtEpochMs: workout.isRestTimerActive ? workout.restTimerEndsAt : undefined,
    restExerciseName: workout.isRestTimerActive ? workout.restTimerExerciseName : undefined,
    restNotificationsEnabled: opts.restNotificationsEnabled,
  };
}

/**
 * Turn drained native events into store actions. Idempotent against the
 * current workout: sets already completed in-app are skipped, stale rest
 * timers aren't resurrected, and events for another workout id are dropped
 * (the workout was finished/discarded after the tap).
 */
export function planEventReplay(
  workout: ActiveWorkout | null,
  events: ActivityEvent[],
  now: number
): ReplayResult {
  const actions: ReplayAction[] = [];
  let finishRequested = false;
  if (!workout) return { actions, finishRequested };

  // Rest events collapse to the latest one — intermediate states are moot.
  let rest: ActivityEvent | null = null;

  for (const event of events) {
    if (event.workoutId !== workout.id) continue;
    switch (event.type) {
      case 'setLogged': {
        const exercise = workout.exercises.find((e) => e.id === event.exerciseId);
        const set = exercise?.sets.find((s) => s.id === event.setId);
        if (!exercise || !set || set.completed) break;
        let updates: Partial<WorkoutSet> = { completed: true };
        for (const [field, value] of Object.entries(event.values)) {
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            updates = { ...updates, ...metricUpdate(field as MetricField, value) };
          }
        }
        actions.push({ kind: 'logSet', exerciseId: exercise.id, setId: set.id, updates });
        break;
      }
      case 'restStarted':
      case 'restSkipped':
        rest = event;
        break;
      case 'finishRequested':
        finishRequested = true;
        break;
    }
  }

  if (rest?.type === 'restSkipped') {
    if (workout.isRestTimerActive) actions.push({ kind: 'stopRest' });
  } else if (rest?.type === 'restStarted') {
    const seconds = Math.ceil((rest.endsAtEpochMs - now) / 1000);
    if (seconds > 0) {
      actions.push({ kind: 'startRest', seconds, exerciseName: rest.exerciseName });
    } else if (workout.isRestTimerActive) {
      // The native rest ran out while we were away — mirror its end.
      actions.push({ kind: 'stopRest' });
    }
  }

  return { actions, finishRequested };
}

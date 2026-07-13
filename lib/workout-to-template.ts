import type { ActiveWorkout, Exercise, TemplateExercise } from '@/lib/types';

// Maps an active workout's exercises to the template-exercise shape consumed
// by the template store (and, via its sync path, convex/templates.ts create).
// Pure so it's unit-testable: the row-id generator is injected.
//
// Mapping rules:
// - Exercise order is preserved (order = array index).
// - Metrics, load mode, rest time, and set count carry over as configured in
//   the workout — suggestedWeight keeps the per-hand convention its loadMode
//   declares (lib/load-mode.ts).
// - Suggested values seed from the LAST COMPLETED set of each exercise; an
//   exercise with no completed sets gets no suggestions (left blank).
export function workoutToTemplateExercises(
  exercises: Exercise[],
  makeId: () => string
): TemplateExercise[] {
  return exercises.map((exercise, index) => {
    const lastCompleted = [...exercise.sets].reverse().find((s) => s.completed);
    return {
      id: makeId(),
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      type: exercise.type,
      metrics: exercise.metrics,
      ...(exercise.loadMode !== undefined ? { loadMode: exercise.loadMode } : {}),
      order: index,
      restTimeSeconds: exercise.restTimeSeconds,
      // A workout exercise can briefly have zero sets (all removed); a
      // template exercise always prescribes at least one.
      defaultSetsCount: Math.max(1, exercise.sets.length),
      suggestedReps: lastCompleted?.reps,
      suggestedWeight: lastCompleted?.weight,
      suggestedTime: lastCompleted?.time,
      suggestedDistance: lastCompleted?.distance,
    };
  });
}

// Prefill for the "name your template" prompt. Workouts started from a
// template (or a plan day) carry a meaningful name worth suggesting; ad-hoc
// sessions carry the placeholder 'Empty Workout', which shouldn't leak into
// a saved template.
export function suggestedTemplateName(
  workout: Pick<ActiveWorkout, 'templateName'>
): string {
  return workout.templateName === 'Empty Workout' ? '' : workout.templateName;
}

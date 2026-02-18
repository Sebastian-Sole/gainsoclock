import type { Exercise, WorkoutLog, WorkoutSet } from './types';

/**
 * Resolves exercise values from the last completed workout log.
 * Matches exercises by name AND type. Template structure wins:
 * - Extra log sets are ignored
 * - Missing log sets keep template defaults
 */
export function resolveExercisesFromLastWorkout(
  templateExercises: Exercise[],
  lastLog: WorkoutLog
): Exercise[] {
  return templateExercises.map((templateExercise) => {
    const logExercise = lastLog.exercises.find(
      (e) => e.name === templateExercise.name && e.type === templateExercise.type
    );

    if (!logExercise) return templateExercise;

    const resolvedSets: WorkoutSet[] = templateExercise.sets.map((templateSet, index) => {
      const logSet = logExercise.sets[index];
      if (!logSet || logSet.type !== templateSet.type) return templateSet;

      // Copy values from the log set, keeping the template set's id and completed state
      return { ...logSet, id: templateSet.id, completed: templateSet.completed };
    });

    return { ...templateExercise, sets: resolvedSets };
  });
}

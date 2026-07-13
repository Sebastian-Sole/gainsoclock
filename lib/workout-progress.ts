/** Minimal structural shape shared by Exercise and WorkoutLogExercise sets. */
interface SetCompletion {
  completed: boolean;
}

/**
 * True while at least one set anywhere in the workout is still unlogged.
 *
 * Used to decide whether a just-completed set has a "next set" — completing
 * the final remaining set must not start a rest timer, because the workout is
 * over and the app routes to the summary (#135). Same predicate the Focus
 * logger's advance uses to detect completion.
 */
export function hasIncompleteSets(
  exercises: readonly { sets: readonly SetCompletion[] }[]
): boolean {
  return exercises.some((e) => e.sets.some((s) => !s.completed));
}

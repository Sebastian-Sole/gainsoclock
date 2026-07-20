/**
 * Where to land when opening an exercise in the logger: the earliest set the
 * user hasn't completed yet. Falls back to the first set when every set is
 * complete (or the list is empty), so revisiting a finished exercise starts
 * at the top rather than out of range.
 */
export function firstIncompleteSetIndex(
  sets: ReadonlyArray<{ completed?: boolean }>,
): number {
  const idx = sets.findIndex((s) => !s.completed);
  return idx === -1 ? 0 : idx;
}

import { effectiveLoad } from './load-mode';
import type { LoadMode, WorkoutLog, WorkoutSet } from './types';

/**
 * Estimated one-rep-max formulas — the single implementation shared by the
 * manual calculator (app/calculator/one-rm.tsx) and the stats progression
 * charts. Extracted from the calculator so the two screens can never drift
 * onto different math.
 */

export type OneRmFormula = 'epley' | 'brzycki' | 'lombardi';

/** The formula used wherever a single e1RM number is shown. Named explicitly
 *  in the UI ("Epley") — never switch formulas silently between screens. */
export const DEFAULT_ONE_RM_FORMULA: OneRmFormula = 'epley';

export const ONE_RM_FORMULA_LABELS: Record<OneRmFormula, string> = {
  epley: 'Epley',
  brzycki: 'Brzycki',
  lombardi: 'Lombardi',
};

/**
 * Unrounded estimated 1RM. Returns 0 for non-positive inputs and for Brzycki
 * at reps ≥ 37 (the formula's pole); a true single at reps === 1 is the lift
 * itself under every formula.
 */
export function estimateOneRm(
  weight: number,
  reps: number,
  formula: OneRmFormula = DEFAULT_ONE_RM_FORMULA
): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  switch (formula) {
    case 'epley':
      return weight * (1 + reps / 30);
    case 'brzycki':
      return reps >= 37 ? 0 : weight * (36 / (37 - reps));
    case 'lombardi':
      return weight * Math.pow(reps, 0.1);
  }
}

/**
 * All three formulas at once, rounded — the shape the 1RM calculator screen
 * renders. Preserves the calculator's legacy edge cases exactly: non-positive
 * input → all zeros; reps === 1 → the (unrounded) weight for all three.
 */
export function calculate1RM(
  weight: number,
  reps: number
): { epley: number; brzycki: number; lombardi: number } {
  if (reps <= 0 || weight <= 0) return { epley: 0, brzycki: 0, lombardi: 0 };
  if (reps === 1) return { epley: weight, brzycki: weight, lombardi: weight };
  return {
    epley: Math.round(estimateOneRm(weight, reps, 'epley')),
    brzycki: Math.round(estimateOneRm(weight, reps, 'brzycki')),
    lombardi: Math.round(estimateOneRm(weight, reps, 'lombardi')),
  };
}

/**
 * Best estimated 1RM across one session's sets: the completed set with both
 * weight and reps whose e1RM is highest (which is not necessarily the
 * heaviest set — 90×10 beats 100×1). Undefined when no set qualifies.
 *
 * `loadMode` is the parent exercise's flag: e1RM is computed on the EFFECTIVE
 * total load (lib/load-mode.ts), so a per-hand exercise (2×10 kg dumbbells)
 * is estimated from 20 kg, not 10 — otherwise unilateral work is undercounted.
 * Absent (legacy) = 'total', multiplier 1.
 */
export function sessionBestOneRm(
  sets: readonly WorkoutSet[],
  formula: OneRmFormula = DEFAULT_ONE_RM_FORMULA,
  loadMode?: LoadMode
): number | undefined {
  let best: number | undefined;
  for (const set of sets) {
    if (!set.completed) continue;
    if (set.weight === undefined || set.reps === undefined) continue;
    const estimate = estimateOneRm(effectiveLoad(set.weight, loadMode), set.reps, formula);
    if (estimate > 0 && (best === undefined || estimate > best)) {
      best = estimate;
    }
  }
  return best;
}

export interface OneRmPoint {
  date: string;
  value: number;
}

/**
 * Estimated-1RM progression for one exercise: one point per session, from
 * that session's best set (see sessionBestOneRm). Sessions with no qualifying
 * weight+reps set emit no point. Computed client-side over the hydrated
 * history store, like the metric series in lib/stats.ts.
 */
export function computeOneRmSeries(
  logs: readonly WorkoutLog[],
  exerciseId: string,
  formula: OneRmFormula = DEFAULT_ONE_RM_FORMULA
): OneRmPoint[] {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  const points: OneRmPoint[] = [];
  for (const log of sorted) {
    // Per log-exercise so each row's own load mode applies: legacy rows
    // (loadMode absent) stay multiplier-1, per-hand rows double. Best across
    // duplicate appearances of the exercise in one session.
    let value: number | undefined;
    for (const exercise of log.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      const best = sessionBestOneRm(exercise.sets, formula, exercise.loadMode);
      if (best !== undefined && (value === undefined || best > value)) {
        value = best;
      }
    }
    if (value !== undefined) {
      points.push({ date: log.startedAt, value });
    }
  }
  return points;
}

import type { LoadMode } from './types';

/**
 * Load-mode semantics — the ONE place "what does the stored weight mean?" is
 * defined. Every consumer (stats, e1RM, set loggers, exercise create, AI
 * payload mapping) routes through these helpers rather than re-deriving the
 * convention.
 *
 * The stored weight number is always what the user physically picks up
 * (10 kg per dumbbell, not 20 kg combined). The exercise-level `loadMode`
 * flag says how that number relates to the total load moved:
 *
 * - `total` — the weight IS the full load (barbell, machine,
 *   bodyweight+added). Effective-load multiplier 1.
 * - `per_hand` — two implements moved simultaneously (DB bench, DB curls).
 *   Effective total = 2 × entered weight.
 * - `per_side` — one loaded side worked at a time (single-arm row, lunge
 *   holding one DB). Effective total = 1 × entered weight per rep: the label
 *   changes, not the math. The flag exists so entry is unambiguous and
 *   future analytics can distinguish unilateral work.
 *
 * Back-compat: an ABSENT loadMode means `total`. Legacy exercises and
 * historical log rows are therefore unchanged in interpretation — no
 * migration needed, and old stats stay comparable (multiplier 1).
 */

export const LOAD_MODES: readonly LoadMode[] = ['total', 'per_hand', 'per_side'];

export function isLoadMode(value: string): value is LoadMode {
  return (LOAD_MODES as readonly string[]).includes(value);
}

/**
 * Hydration-boundary coercion (mirrors coerceMetricIds in lib/metrics.ts):
 * keep a recognized mode, drop anything else so an unknown server value
 * degrades to the legacy default rather than poisoning the store.
 */
export function coerceLoadMode(input: string | undefined): LoadMode | undefined {
  return input !== undefined && isLoadMode(input) ? input : undefined;
}

/** Centralized legacy defaulting: absent loadMode means 'total'. */
export function resolveLoadMode(loadMode: LoadMode | undefined): LoadMode {
  return loadMode ?? 'total';
}

/**
 * Entered-weight → effective-total multiplier. Only `per_hand` scales
 * (two implements move at once); `per_side` is 1 — one loaded side moves
 * per rep, the flag only disambiguates entry.
 */
export function loadMultiplier(loadMode: LoadMode | undefined): number {
  return resolveLoadMode(loadMode) === 'per_hand' ? 2 : 1;
}

/**
 * Effective total load for a set's entered weight — what stats, volume and
 * e1RM aggregate so per-hand exercises aren't undercounted.
 */
export function effectiveLoad(weight: number, loadMode: LoadMode | undefined): number {
  return weight * loadMultiplier(loadMode);
}

/**
 * Short weight-field qualifier for the set loggers ("per hand"/"per side"),
 * undefined for 'total' so unaffected exercises render unchanged.
 */
export function loadModeFieldSuffix(loadMode: LoadMode | undefined): string | undefined {
  switch (resolveLoadMode(loadMode)) {
    case 'per_hand':
      return 'per hand';
    case 'per_side':
      return 'per side';
    case 'total':
      return undefined;
  }
}

/** Selector options for the exercise create flow, in display order. */
export const LOAD_MODE_OPTIONS: readonly {
  id: LoadMode;
  label: string;
  description: string;
}[] = [
  { id: 'total', label: 'Total', description: 'One load — barbell, machine, bodyweight' },
  { id: 'per_hand', label: 'Per hand', description: 'A weight in each hand — dumbbells' },
  { id: 'per_side', label: 'Per side', description: 'One side at a time — single-arm work' },
];

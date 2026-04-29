import type { ExerciseType } from './types';

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatWeight(weight: number, unit: 'kg' | 'lbs'): string {
  return `${weight} ${unit}`;
}

export function formatDistance(distance: number, unit: 'km' | 'mi'): string {
  return `${distance} ${unit}`;
}

/** Parses "82,3" or "82.3" → 82.3. Returns null on invalid / empty. */
export function parseLocaleNumber(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const normalised = trimmed.replace(',', '.');
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

function boundedParse(
  input: string,
  min: number,
  max: number,
  integerOnly = false,
): number | null {
  const n = parseLocaleNumber(input);
  if (n === null) return null;
  if (integerOnly && !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** Weight in kg, bounded 30-250. */
export function parseWeightKg(input: string): number | null {
  return boundedParse(input, 30, 250);
}

/** Height in cm, bounded 120-230. */
export function parseHeightCm(input: string): number | null {
  return boundedParse(input, 120, 230);
}

/** Age in years, integer, bounded 16-100. */
export function parseAgeYears(input: string): number | null {
  return boundedParse(input, 16, 100, true);
}

export function exerciseTypeLabel(type: ExerciseType): string {
  const labels: Record<ExerciseType, string> = {
    reps_weight: 'Reps & Weight',
    reps_time: 'Reps & Time',
    time_only: 'Time Only',
    time_distance: 'Time & Distance',
    reps_only: 'Reps Only',
  };
  return labels[type];
}

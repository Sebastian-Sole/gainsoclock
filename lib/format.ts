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

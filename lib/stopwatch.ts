import type { StopwatchState, WorkoutSet } from './types';

/**
 * Pure transitions for the set-timing stopwatch (Focus logger).
 *
 * Model: one Start→Stop cycle records one EFFORT (a timed set — plank, dead
 * hang). Rest happens while stopped and is surfaced as its own readout, so it
 * never pollutes an effort. "Start next set" banks the frozen effort and
 * begins the next one. Nothing touches workout sets until an explicit commit
 * maps the efforts onto them (`applyEffortsToSets`).
 *
 * The state never stores a running total — only the epoch anchor of the
 * current run segment plus banked time — so elapsed is always derived from the
 * wall clock and stays correct through backgrounding and app restarts (same
 * principle as the rest timer's `restTimerEndsAt`). Every function takes `now`
 * explicitly so the machine is deterministic and unit-testable.
 */

/** Efforts shorter than this are noise — a mis-tap must not bank or log a
 *  zero-second set. */
export const MIN_EFFORT_MS = 1000;

export function createStopwatch(exerciseId: string): StopwatchState {
  return { exerciseId, startedAt: null, accumulatedMs: 0, pausedAt: null, efforts: [] };
}

export function isStopwatchRunning(sw: StopwatchState | null | undefined): boolean {
  return sw?.startedAt != null;
}

/** A session worth keeping (and worth tinting the entry button for): it is
 *  running, mid-effort, or has recorded efforts. */
export function hasStopwatchData(sw: StopwatchState | null | undefined): boolean {
  return sw != null && (sw.startedAt != null || sw.accumulatedMs > 0 || sw.efforts.length > 0);
}

/** The current (unbanked) effort's elapsed time. */
export function effortMs(sw: StopwatchState, now: number): number {
  // A clock that jumped backwards (NTP correction) must never shrink elapsed.
  const running = sw.startedAt != null ? Math.max(0, now - sw.startedAt) : 0;
  return sw.accumulatedMs + running;
}

/** Time spent stopped since the last Stop — the between-sets rest readout. */
export function restMs(sw: StopwatchState, now: number): number {
  return sw.pausedAt != null ? Math.max(0, now - sw.pausedAt) : 0;
}

export function startStopwatch(sw: StopwatchState, now: number): StopwatchState {
  if (sw.startedAt != null) return sw;
  return { ...sw, startedAt: now, pausedAt: null };
}

export function pauseStopwatch(sw: StopwatchState, now: number): StopwatchState {
  if (sw.startedAt == null) return sw;
  return { ...sw, startedAt: null, accumulatedMs: effortMs(sw, now), pausedAt: now };
}

/** Bank the frozen effort and immediately start timing the next one. Only
 *  meaningful while stopped with a real effort on the clock. */
export function startNextEffort(sw: StopwatchState, now: number): StopwatchState {
  if (sw.startedAt != null || sw.accumulatedMs < MIN_EFFORT_MS) return sw;
  return {
    ...sw,
    efforts: [...sw.efforts, sw.accumulatedMs],
    accumulatedMs: 0,
    startedAt: now,
    pausedAt: null,
  };
}

/** Reset the current (stopped) effort's time to zero without touching the
 *  recorded efforts — the stopwatch screen's Reset button. */
export function resetEffort(sw: StopwatchState): StopwatchState {
  if (sw.startedAt != null) return sw;
  return { ...sw, accumulatedMs: 0, pausedAt: null };
}

/** Drop a recorded effort (bad split) before committing. */
export function discardEffort(sw: StopwatchState, index: number): StopwatchState {
  if (index < 0 || index >= sw.efforts.length) return sw;
  return { ...sw, efforts: sw.efforts.filter((_, i) => i !== index) };
}

/** Everything a commit would log, in seconds: banked efforts plus the current
 *  frozen effort when it's real. The current effort is intentionally included
 *  so the common single-set flow is Start → Stop → Log. */
export function pendingEffortsSeconds(sw: StopwatchState, now: number): number[] {
  const efforts = [...sw.efforts];
  const current = effortMs(sw, now);
  if (sw.startedAt == null && current >= MIN_EFFORT_MS) efforts.push(current);
  return efforts.map(effortLogSeconds);
}

/** Whole seconds to write into `set.time`. Never 0 — a timed set the user
 *  bothered to record is at least a second. */
export function effortLogSeconds(ms: number): number {
  return Math.max(1, Math.round(ms / 1000));
}

/**
 * Map efforts onto an exercise's sets: effort 1 fills the first incomplete
 * set, effort 2 the next, and efforts beyond the plan append new sets built
 * by `createSet` (given the last existing set as a template). Every filled
 * set is marked complete. Already-completed sets are never touched.
 */
export function applyEffortsToSets(
  sets: WorkoutSet[],
  effortsSeconds: number[],
  createSet: (template: WorkoutSet | undefined) => WorkoutSet
): WorkoutSet[] {
  const remaining = [...effortsSeconds];
  const next = sets.map((s) => {
    if (s.completed) return s;
    const time = remaining.shift();
    if (time === undefined) return s;
    return { ...s, time, completed: true };
  });
  for (const time of remaining) {
    const template = next.length > 0 ? next[next.length - 1] : undefined;
    next.push({ ...createSet(template), time, completed: true });
  }
  return next;
}

/**
 * Where effort `index` (0-based, over the pending list) will land: an existing
 * set's 1-based number, or a to-be-created one flagged `isNew`. Drives the
 * "0:45 → Set 4 · new" rows in the review list.
 */
export function effortTarget(
  sets: WorkoutSet[],
  index: number
): { setNumber: number; isNew: boolean } {
  const incomplete: number[] = [];
  sets.forEach((s, i) => {
    if (!s.completed) incomplete.push(i + 1);
  });
  if (index < incomplete.length) return { setNumber: incomplete[index], isNew: false };
  return { setNumber: sets.length + (index - incomplete.length) + 1, isNew: true };
}

/** Live readout: "m:ss.t" with tenths, or "h:mm:ss" once it passes an hour. */
export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${pad(seconds)}.${tenths}`;
}

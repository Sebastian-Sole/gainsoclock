import { describe, expect, it } from 'vitest';
import type { ActiveWorkout, Exercise, WorkoutSet } from './types';
import {
  buildSessionPlan,
  planEventReplay,
  projectEntry,
  type ActivityEvent,
} from './activity-projection';

const OPTS = { weightUnit: 'kg', distanceUnit: 'km', restNotificationsEnabled: true };

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id: nextId(), completed: false, type: 'metrics', ...overrides };
}

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId(),
    exerciseId: nextId(),
    name: 'Bench Press',
    type: 'metrics',
    metrics: ['weight', 'reps'],
    sets: [makeSet({ weight: 80, reps: 8 })],
    restTimeSeconds: 90,
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<ActiveWorkout> = {}): ActiveWorkout {
  return {
    id: 'w1',
    templateName: 'Push Day',
    exercises: [makeExercise()],
    startedAt: '2026-07-23T10:00:00.000Z',
    isRestTimerActive: false,
    restTimeRemaining: 0,
    ...overrides,
  };
}

describe('projectEntry', () => {
  it('projects weight × reps with registry steps and unit labels', () => {
    const e = makeExercise();
    const entry = projectEntry(e, e.sets[0], 0, OPTS);
    expect(entry.rows).toEqual([
      { metricId: 'weight', field: 'weight', label: 'kg', kind: 'decimal', value: 80, step: 2.5 },
      { metricId: 'reps', field: 'reps', label: 'reps', kind: 'integer', value: 8, step: 1 },
    ]);
    expect(entry.openAppOnly).toBe(false);
    expect(entry.moreLabel).toBeUndefined();
    expect(entry.derivePace).toBe(false);
  });

  it('caps rows at two and lists the rest in moreLabel', () => {
    const e = makeExercise({
      metrics: ['duration', 'power_avg', 'distance', 'heart_rate_avg'],
      sets: [makeSet({ time: 1200, powerAvg: 180, distance: 10, heartRateAvg: 140 })],
    });
    const entry = projectEntry(e, e.sets[0], 0, OPTS);
    expect(entry.rows.map((r) => r.metricId)).toEqual(['duration', 'power_avg']);
    expect(entry.moreLabel).toBe('Distance, Avg heart rate');
  });

  it('skips pace as a row but flags live derivation for the full triple', () => {
    const e = makeExercise({
      metrics: ['duration', 'distance', 'pace', 'heart_rate_avg'],
      sets: [makeSet({ time: 1500, distance: 5, paceSeconds: 300 })],
    });
    const entry = projectEntry(e, e.sets[0], 0, OPTS);
    expect(entry.rows.map((r) => r.metricId)).toEqual(['duration', 'distance']);
    expect(entry.derivePace).toBe(true);
    expect(entry.moreLabel).toBe('Pace, Avg heart rate');
  });

  it('uses 5s duration steps under 2 minutes and 15s above', () => {
    const short = makeExercise({ metrics: ['duration'], sets: [makeSet({ time: 60 })] });
    const long = makeExercise({ metrics: ['duration'], sets: [makeSet({ time: 600 })] });
    expect(projectEntry(short, short.sets[0], 0, OPTS).rows[0].step).toBe(5);
    expect(projectEntry(long, long.sets[0], 0, OPTS).rows[0].step).toBe(15);
  });

  it('respects the weight/distance unit preferences', () => {
    const e = makeExercise({ metrics: ['weight', 'distance'], sets: [makeSet({ weight: 100 })] });
    const entry = projectEntry(e, e.sets[0], 0, {
      ...OPTS,
      weightUnit: 'lb',
      distanceUnit: 'mi',
    });
    expect(entry.rows[0].label).toBe('lb');
    expect(entry.rows[1].label).toBe('mi');
  });

  it('falls back to legacy-typed exercises via the metric resolver', () => {
    const e = makeExercise({ type: 'reps_weight', metrics: [], sets: [makeSet({ type: 'reps_weight', weight: 60, reps: 10 })] });
    const entry = projectEntry(e, e.sets[0], 0, OPTS);
    expect(entry.rows.map((r) => r.metricId)).toEqual(['weight', 'reps']);
  });

  it('drops unknown metric ids from stale persisted workouts instead of throwing', () => {
    const e = makeExercise({
      // Simulates pre-migration persisted state: junk ids typed as MetricId.
      metrics: ['weight', 'not_a_metric', 'reps'] as never,
      sets: [makeSet({ weight: 80, reps: 8 })],
    });
    const entry = projectEntry(e, e.sets[0], 0, OPTS);
    expect(entry.rows.map((r) => r.metricId)).toEqual(['weight', 'reps']);
  });

  it('keeps intervals loggable with one tap but without stepper rows', () => {
    const e = makeExercise({ type: 'intervals', metrics: [], sets: [makeSet({ type: 'intervals', time: 120, restTime: 60 })] });
    const entry = projectEntry(e, e.sets[0], 0, OPTS);
    expect(entry.rows).toEqual([]);
    expect(entry.openAppOnly).toBe(false);
  });
});

describe('buildSessionPlan', () => {
  it('returns null without a workout', () => {
    expect(buildSessionPlan(null, OPTS)).toBeNull();
  });

  it('queues only incomplete sets, in workout order, with totals', () => {
    const a = makeExercise({
      name: 'Bench',
      sets: [makeSet({ completed: true }), makeSet({ weight: 80, reps: 8 })],
    });
    const b = makeExercise({ name: 'Rows', sets: [makeSet({ weight: 60, reps: 12 })] });
    const plan = buildSessionPlan(makeWorkout({ exercises: [a, b] }), OPTS);
    expect(plan?.totalSets).toBe(3);
    expect(plan?.completedSets).toBe(1);
    expect(plan?.queue.map((q) => q.exerciseName)).toEqual(['Bench', 'Rows']);
    expect(plan?.queue[0].setIndex).toBe(1);
    expect(plan?.queue[0].setCount).toBe(2);
  });

  it('keeps an empty queue when everything is done (finish-only card)', () => {
    const e = makeExercise({ sets: [makeSet({ completed: true })] });
    const plan = buildSessionPlan(makeWorkout({ exercises: [e] }), OPTS);
    expect(plan?.queue).toEqual([]);
    expect(plan?.completedSets).toBe(1);
  });

  it('mirrors a running rest timer', () => {
    const plan = buildSessionPlan(
      makeWorkout({
        isRestTimerActive: true,
        restTimerEndsAt: 1753268000000,
        restTimerExerciseName: 'Bench',
      }),
      OPTS
    );
    expect(plan?.restEndsAtEpochMs).toBe(1753268000000);
    expect(plan?.restExerciseName).toBe('Bench');
  });

  it('demotes sets of a stopwatch-owned exercise to open-app-only', () => {
    const e = makeExercise({ metrics: ['duration'], sets: [makeSet({ time: 60 })] });
    const plan = buildSessionPlan(
      makeWorkout({
        exercises: [e],
        stopwatch: { exerciseId: e.id, startedAt: null, accumulatedMs: 0, pausedAt: null, efforts: [] },
      }),
      OPTS
    );
    expect(plan?.queue[0].openAppOnly).toBe(true);
    expect(plan?.queue[0].rows).toEqual([]);
  });
});

describe('planEventReplay', () => {
  const NOW = 1753268000000;

  function loggedEvent(
    workout: ActiveWorkout,
    values: Partial<Record<'weight' | 'reps', number>> = {}
  ): ActivityEvent {
    const e = workout.exercises[0];
    return {
      type: 'setLogged',
      workoutId: workout.id,
      exerciseId: e.id,
      setId: e.sets[0].id,
      values,
      at: NOW - 60000,
    };
  }

  it('maps setLogged to a completed-set update with stepped values', () => {
    const workout = makeWorkout();
    const result = planEventReplay(workout, [loggedEvent(workout, { weight: 82.5, reps: 6 })], NOW);
    expect(result.actions).toEqual([
      {
        kind: 'logSet',
        exerciseId: workout.exercises[0].id,
        setId: workout.exercises[0].sets[0].id,
        updates: { completed: true, weight: 82.5, reps: 6 },
      },
    ]);
  });

  it('skips sets already completed in-app (idempotent replay)', () => {
    const workout = makeWorkout();
    workout.exercises[0].sets[0].completed = true;
    const result = planEventReplay(workout, [loggedEvent(workout)], NOW);
    expect(result.actions).toEqual([]);
  });

  it('drops events from another workout id', () => {
    const workout = makeWorkout();
    const stale = { ...loggedEvent(workout), workoutId: 'old-workout' } as ActivityEvent;
    expect(planEventReplay(workout, [stale], NOW).actions).toEqual([]);
  });

  it('ignores negative or non-finite stepped values but still completes the set', () => {
    const workout = makeWorkout();
    const result = planEventReplay(
      workout,
      [loggedEvent(workout, { weight: -5, reps: Number.NaN })],
      NOW
    );
    expect(result.actions[0]).toMatchObject({ updates: { completed: true } });
    expect(result.actions[0].kind === 'logSet' && result.actions[0].updates.weight).toBeUndefined();
  });

  it('collapses rest events to the latest and converts endsAt to seconds', () => {
    const workout = makeWorkout();
    const events: ActivityEvent[] = [
      { type: 'restStarted', workoutId: 'w1', endsAtEpochMs: NOW + 10000, at: NOW - 90000 },
      { type: 'restStarted', workoutId: 'w1', endsAtEpochMs: NOW + 45000, exerciseName: 'Bench', at: NOW - 50000 },
    ];
    const result = planEventReplay(workout, events, NOW);
    expect(result.actions).toEqual([{ kind: 'startRest', seconds: 45, exerciseName: 'Bench' }]);
  });

  it('stops a mirrored rest that expired while away', () => {
    const workout = makeWorkout({ isRestTimerActive: true, restTimerEndsAt: NOW - 1000 });
    const events: ActivityEvent[] = [
      { type: 'restStarted', workoutId: 'w1', endsAtEpochMs: NOW - 5000, at: NOW - 90000 },
    ];
    expect(planEventReplay(workout, events, NOW).actions).toEqual([{ kind: 'stopRest' }]);
  });

  it('maps restSkipped to stopRest only while a timer is active', () => {
    const active = makeWorkout({ isRestTimerActive: true, restTimerEndsAt: NOW + 30000 });
    const idle = makeWorkout();
    const skip: ActivityEvent[] = [{ type: 'restSkipped', workoutId: 'w1', at: NOW }];
    expect(planEventReplay(active, skip, NOW).actions).toEqual([{ kind: 'stopRest' }]);
    expect(planEventReplay(idle, skip, NOW).actions).toEqual([]);
  });

  it('surfaces finishRequested', () => {
    const workout = makeWorkout();
    const result = planEventReplay(
      workout,
      [{ type: 'finishRequested', workoutId: 'w1', at: NOW }],
      NOW
    );
    expect(result.finishRequested).toBe(true);
  });
});

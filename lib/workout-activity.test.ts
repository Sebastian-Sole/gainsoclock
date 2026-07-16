import { describe, it, expect } from 'vitest';

import {
  classifyExternalActivity,
  classifyLogActivity,
  areActivitiesCompatible,
} from '@/lib/workout-activity';
import type { ExerciseType, MetricId } from '@/lib/types';

const ex = (type: ExerciseType, metrics?: MetricId[]) => ({ type, metrics });
const log = (...exercises: Array<{ type: ExerciseType; metrics?: MetricId[] }>) => ({
  exercises,
});

describe('classifyExternalActivity', () => {
  it('maps strength HealthKit names to strength', () => {
    expect(classifyExternalActivity('traditionalStrengthTraining')).toBe('strength');
    expect(classifyExternalActivity('functionalStrengthTraining')).toBe('strength');
  });

  it('maps locomotion and sports to cardio', () => {
    for (const t of ['running', 'walking', 'cycling', 'swimming', 'hockey', 'rowing']) {
      expect(classifyExternalActivity(t)).toBe('cardio');
    }
  });

  it('falls through to other for unknown / "other"', () => {
    expect(classifyExternalActivity('other')).toBe('other');
    expect(classifyExternalActivity('somethingWeird')).toBe('other');
  });
});

describe('classifyLogActivity', () => {
  it('any rep-based work makes the log strength', () => {
    expect(classifyLogActivity(log(ex('reps_weight')))).toBe('strength');
    expect(classifyLogActivity(log(ex('time_only'), ex('reps_only')))).toBe('strength');
  });

  it('all cardio-based exercises make the log cardio', () => {
    expect(classifyLogActivity(log(ex('time_distance'), ex('intervals')))).toBe('cardio');
  });

  it('composed metrics infer from their metric ids', () => {
    expect(classifyLogActivity(log(ex('metrics', ['weight', 'reps'])))).toBe('strength');
    expect(classifyLogActivity(log(ex('metrics', ['distance', 'pace'])))).toBe('cardio');
    expect(classifyLogActivity(log(ex('metrics', ['heart_rate_avg'])))).toBe('other');
  });

  it('empty log is other', () => {
    expect(classifyLogActivity(log())).toBe('other');
  });
});

describe('areActivitiesCompatible', () => {
  it('suggests only same concrete bucket', () => {
    expect(areActivitiesCompatible('traditionalStrengthTraining', log(ex('reps_weight')))).toBe(true);
    expect(areActivitiesCompatible('running', log(ex('time_distance')))).toBe(true);
  });

  it('never suggests strength watch <-> cardio log (or vice versa)', () => {
    expect(areActivitiesCompatible('running', log(ex('reps_weight')))).toBe(false);
    expect(areActivitiesCompatible('traditionalStrengthTraining', log(ex('time_distance')))).toBe(false);
  });

  it('ambiguous "other" on either side is never auto-suggested', () => {
    expect(areActivitiesCompatible('other', log(ex('reps_weight')))).toBe(false);
    expect(areActivitiesCompatible('running', log(ex('metrics', ['heart_rate_avg'])))).toBe(false);
  });
});

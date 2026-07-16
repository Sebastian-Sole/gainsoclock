import { describe, it, expect } from 'vitest';

import {
  computeMergeSuggestions,
  type ExternalLike,
  type LogLike,
} from '@/lib/merge-suggestions';
import type { ExerciseType, MetricId } from '@/lib/types';

// Fixed local noon so the ms<->ISO day bucketing is unambiguous regardless of
// the machine's offset (both sides use the same local calendar day).
const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`);

function ext(overrides: Partial<ExternalLike> & { startedAtDay: string }): ExternalLike {
  const { startedAtDay, ...rest } = overrides;
  return {
    healthKitUuid: `hk-${startedAtDay}-${overrides.activityType ?? 'x'}`,
    startedAt: at(startedAtDay, 18).getTime(),
    activityType: 'traditionalStrengthTraining',
    ...rest,
  };
}

function mkLog(
  id: string,
  day: string,
  exercises: Array<{ type: ExerciseType; metrics?: MetricId[] }>,
  hour = 17
): LogLike {
  return { id, startedAt: at(day, hour).toISOString(), templateName: id, exercises };
}

const strengthLog = (id: string, day: string, hour?: number) =>
  mkLog(id, day, [{ type: 'reps_weight' }], hour);
const cardioLog = (id: string, day: string, hour?: number) =>
  mkLog(id, day, [{ type: 'time_distance' }], hour);

describe('computeMergeSuggestions', () => {
  it('suggests the single compatible same-day log', () => {
    const res = computeMergeSuggestions({
      externals: [ext({ startedAtDay: '2026-04-13' })],
      logs: [strengthLog('legs', '2026-04-13')],
    });
    expect(res).toHaveLength(1);
    expect(res[0].candidates.map((l) => l.id)).toEqual(['legs']);
    expect(res[0].suggested?.id).toBe('legs');
  });

  it('offers candidates but no auto-suggestion when two same-day logs are compatible', () => {
    const res = computeMergeSuggestions({
      externals: [ext({ startedAtDay: '2026-04-13' })],
      logs: [strengthLog('am', '2026-04-13', 8), strengthLog('pm', '2026-04-13', 18)],
    });
    expect(res[0].candidates).toHaveLength(2);
    expect(res[0].suggested).toBeNull(); // ambiguous -> manual pick only
    expect(res[0].candidates[0].id).toBe('pm'); // most recent first
  });

  it('does not auto-suggest a cardio watch workout for a strength log', () => {
    const res = computeMergeSuggestions({
      externals: [ext({ startedAtDay: '2026-04-15', activityType: 'running' })],
      logs: [strengthLog('legs', '2026-04-15')],
    });
    expect(res[0].candidates).toHaveLength(1); // still manually mergeable
    expect(res[0].suggested).toBeNull();
  });

  it('picks the compatible one when a day has both strength and cardio logs', () => {
    const res = computeMergeSuggestions({
      externals: [ext({ startedAtDay: '2026-04-15', activityType: 'running' })],
      logs: [strengthLog('legs', '2026-04-15', 8), cardioLog('run-log', '2026-04-15', 18)],
    });
    expect(res[0].suggested?.id).toBe('run-log');
  });

  it('skips externals with no same-day log', () => {
    const res = computeMergeSuggestions({
      externals: [ext({ startedAtDay: '2026-04-04' })],
      logs: [strengthLog('legs', '2026-04-03')],
    });
    expect(res).toHaveLength(0);
  });

  it('skips already-merged and dismissed externals', () => {
    const res = computeMergeSuggestions({
      externals: [
        ext({ startedAtDay: '2026-04-13', linkedWorkoutLogClientId: 'legs' }),
        ext({ startedAtDay: '2026-04-13', activityType: 'functionalStrengthTraining', linkDismissed: true }),
      ],
      logs: [strengthLog('legs', '2026-04-13')],
    });
    expect(res).toHaveLength(0);
  });

  it('does not offer a log already merged with another external', () => {
    const res = computeMergeSuggestions({
      externals: [
        ext({ startedAtDay: '2026-04-13', linkedWorkoutLogClientId: 'legs' }),
        ext({ startedAtDay: '2026-04-13', activityType: 'functionalStrengthTraining' }),
      ],
      logs: [strengthLog('legs', '2026-04-13')],
    });
    // Second external has no candidate left (the only log is taken).
    expect(res).toHaveLength(0);
  });
});

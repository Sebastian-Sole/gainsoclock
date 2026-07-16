import { format } from 'date-fns';

import type { ExerciseType, MetricId } from '@/lib/types';
import { areActivitiesCompatible } from '@/lib/workout-activity';

/** Minimal shape of an imported (Apple Health) workout this logic needs. */
export type ExternalLike = {
  healthKitUuid: string;
  startedAt: number; // ms epoch
  activityType: string;
  linkedWorkoutLogClientId?: string;
  linkDismissed?: boolean;
};

/** Minimal shape of a Fitbull log this logic needs. */
export type LogLike = {
  id: string;
  startedAt: string; // ISO
  templateName: string;
  exercises: Array<{ type: ExerciseType; metrics?: MetricId[] }>;
};

export type MergeSuggestion<E extends ExternalLike, L extends LogLike> = {
  external: E;
  /** Same-local-day logs available to merge into, most recent first. */
  candidates: L[];
  /** The single compatible, unambiguous candidate — the "suggest" tier, or null. */
  suggested: L | null;
};

const dayKey = (d: Date | number | string) => format(new Date(d), 'yyyy-MM-dd');

/**
 * For each unmerged, non-dismissed external workout, find same-local-day logs
 * to merge into, plus a single *suggested* match when it's unambiguous and
 * activity-compatible (the "suggest" confidence tier — #117). Auto time-overlap
 * matches never reach here (they're already linked); this covers the imports
 * whose synthetic timestamps can't overlap.
 *
 * Pure and timezone-agnostic: "same day" is the device-local calendar day, the
 * same grouping the History calendar uses.
 */
export function computeMergeSuggestions<E extends ExternalLike, L extends LogLike>(params: {
  externals: readonly E[];
  logs: readonly L[];
}): MergeSuggestion<E, L>[] {
  const { externals, logs } = params;

  // Logs already merged with some external must not be offered again.
  const linkedLogIds = new Set<string>();
  for (const e of externals) {
    if (e.linkedWorkoutLogClientId !== undefined) {
      linkedLogIds.add(e.linkedWorkoutLogClientId);
    }
  }

  const logsByDay = new Map<string, L[]>();
  for (const log of logs) {
    if (linkedLogIds.has(log.id)) continue;
    const key = dayKey(log.startedAt);
    const arr = logsByDay.get(key);
    if (arr) arr.push(log);
    else logsByDay.set(key, [log]);
  }

  const out: MergeSuggestion<E, L>[] = [];
  for (const external of externals) {
    if (external.linkedWorkoutLogClientId !== undefined) continue; // already merged
    if (external.linkDismissed === true) continue; // user kept it separate

    const sameDay = logsByDay.get(dayKey(external.startedAt));
    if (!sameDay || sameDay.length === 0) continue;

    const candidates = [...sameDay].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const compatible = candidates.filter((l) =>
      areActivitiesCompatible(external.activityType, l)
    );
    const suggested = compatible.length === 1 ? compatible[0] : null;

    out.push({ external, candidates, suggested });
  }
  return out;
}

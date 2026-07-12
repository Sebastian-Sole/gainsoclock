// Pure time-overlap matcher for deduplicating an imported (HealthKit /
// Apple Watch) workout against a native Fitbull workout log (issue #117).
//
// Kept free of Convex server imports so it can be unit-tested from
// lib/workout-overlap.test.ts — same pattern as convex/metricsMap.ts /
// lib/metrics-map-normalize.test.ts.
//
// Matching rule: an external workout and a native log describe the same
// session when their time windows overlap by at least MIN_OVERLAP_FRACTION
// of the shorter window, after crediting OVERLAP_TOLERANCE_MS to absorb
// watch/phone clock skew and start/stop fumbling at the edges. Activity type
// is deliberately NOT considered — watches often classify strength sessions
// oddly, so time overlap dominates (see issue #117 "Considerations").

/** Slack credited to the raw overlap — bridges small gaps/skew. */
export const OVERLAP_TOLERANCE_MS = 3 * 60 * 1000;

/** Required (tolerance-credited) overlap as a fraction of the shorter window. */
export const MIN_OVERLAP_FRACTION = 0.5;

/**
 * Floor for the shorter-window denominator, so a seconds-long window can't
 * match anything the tolerance credit merely brushes against.
 */
const MIN_WINDOW_MS = 60 * 1000;

/** External (HealthKit) workout window — ms epoch, as stored in Convex. */
export type ExternalWindow = {
  startedAt: number;
  endedAt: number;
};

/** Native workout log window — ISO strings, as stored in Convex. */
export type NativeLogWindow = {
  startedAt: string;
  completedAt: string;
};

/**
 * Tolerance-credited overlap between an external workout and a native log,
 * in ms, or null when the pair does not qualify as the same session.
 *
 * score = rawOverlap + OVERLAP_TOLERANCE_MS (rawOverlap is negative for a
 * gap, so a gap wider than the tolerance can never score above zero). The
 * pair matches when score >= MIN_OVERLAP_FRACTION * shorterWindow.
 */
export function overlapScoreMs(
  external: ExternalWindow,
  log: NativeLogWindow
): number | null {
  const logStart = Date.parse(log.startedAt);
  const logEnd = Date.parse(log.completedAt);
  if (!Number.isFinite(logStart) || !Number.isFinite(logEnd)) return null;

  const extDuration = external.endedAt - external.startedAt;
  const logDuration = logEnd - logStart;
  // Zero/negative-length windows are corrupt or meaningless — never match.
  if (extDuration <= 0 || logDuration <= 0) return null;

  const rawOverlap =
    Math.min(external.endedAt, logEnd) - Math.max(external.startedAt, logStart);
  const score = rawOverlap + OVERLAP_TOLERANCE_MS;

  const shorter = Math.max(MIN_WINDOW_MS, Math.min(extDuration, logDuration));
  return score >= MIN_OVERLAP_FRACTION * shorter ? score : null;
}

/** Absolute start-time distance, used to break score ties. */
function startDistanceMs(external: ExternalWindow, log: NativeLogWindow): number {
  return Math.abs(external.startedAt - Date.parse(log.startedAt));
}

/**
 * The native log that best matches an external workout (max overlap score;
 * ties broken by closest start time), or null when none qualifies.
 */
export function bestMatchingLog<T extends NativeLogWindow>(
  external: ExternalWindow,
  logs: readonly T[]
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  let bestStartDistance = Infinity;

  for (const log of logs) {
    const score = overlapScoreMs(external, log);
    if (score === null) continue;
    const startDistance = startDistanceMs(external, log);
    if (
      score > bestScore ||
      (score === bestScore && startDistance < bestStartDistance)
    ) {
      best = log;
      bestScore = score;
      bestStartDistance = startDistance;
    }
  }
  return best;
}

/**
 * The external workout that best matches a native log (max overlap score;
 * ties broken by closest start time), or null when none qualifies.
 */
export function bestMatchingExternal<T extends ExternalWindow>(
  log: NativeLogWindow,
  externals: readonly T[]
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  let bestStartDistance = Infinity;

  for (const external of externals) {
    const score = overlapScoreMs(external, log);
    if (score === null) continue;
    const startDistance = startDistanceMs(external, log);
    if (
      score > bestScore ||
      (score === bestScore && startDistance < bestStartDistance)
    ) {
      best = external;
      bestScore = score;
      bestStartDistance = startDistance;
    }
  }
  return best;
}

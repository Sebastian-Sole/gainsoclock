// Workout Live Activity bridge (lock-screen set logging + rest countdown),
// iOS 16.2+, interactive on iOS 17+.
//
// Wraps the local Expo module `modules/fitbull-workout-activity` the same way
// lib/haptics.ts wraps expo-haptics: callers use these functions
// unconditionally and the wrapper decides whether anything happens. All native
// access stays in this file. This supersedes the expo-live-activity rest-timer
// wrapper (docs/rest-timer-live-activity.md) — the workout activity absorbs
// the rest countdown as one of its states.
//
// Degradation contract: every path is a silent no-op when Platform ≠ iOS,
// when the dev client was built without the module, when iOS < 16.2, or when
// the user disabled Live Activities. The in-app logger, rest timer, and
// notifications must never break because of this feature.
import { Platform } from 'react-native';

import type { ActivityEvent, ActivitySessionPlan } from '@/lib/activity-projection';

interface WorkoutActivityModule {
  /** Write the plan to the App Group and start/update the Live Activity. */
  syncPlan(planJson: string): void;
  /** End the activity and clear App Group state. */
  endActivity(reason: string): void;
  /** Return and clear the pending native event log (JSON array string). */
  drainEvents(): string;
}

let cachedModule: WorkoutActivityModule | null = null;
let loadFailed = false;

function getModule(): WorkoutActivityModule | null {
  if (Platform.OS !== 'ios') return null;
  if (loadFailed) return null;
  if (cachedModule) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    cachedModule = requireNativeModule<WorkoutActivityModule>('FitbullWorkoutActivity');
    return cachedModule;
  } catch {
    loadFailed = true;
    if (__DEV__) {
      console.warn(
        '[WorkoutActivity] native module unavailable — rebuild the dev client to enable lock-screen set logging.'
      );
    }
    return null;
  }
}

/**
 * Push the current session plan to the native side. Starts the Live Activity
 * on the first call for a workout, updates it in place afterwards. Call on
 * every relevant store change — the native side diffs before touching
 * ActivityKit.
 */
export function syncWorkoutActivity(plan: ActivitySessionPlan): void {
  const native = getModule();
  if (!native) return;
  try {
    native.syncPlan(JSON.stringify(plan));
  } catch {
    // iOS < 16.2, Live Activities disabled by the user, or the activity
    // request was rejected — the in-app experience is unaffected.
  }
}

/** End the workout Live Activity (finish or discard). Safe when none runs. */
export function endWorkoutActivity(reason: 'finished' | 'discarded'): void {
  const native = getModule();
  if (!native) return;
  try {
    native.endActivity(reason);
  } catch {
    // Already ended or module unavailable.
  }
}

/**
 * Drain lock-screen tap events recorded while JS was asleep. Returns oldest
 * first; the native log is cleared atomically so events replay exactly once.
 */
export function drainActivityEvents(): ActivityEvent[] {
  const native = getModule();
  if (!native) return [];
  try {
    const raw = native.drainEvents();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActivityEvent);
  } catch {
    return [];
  }
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.workoutId === 'string' &&
    typeof candidate.at === 'number' &&
    (candidate.type === 'setLogged' ||
      candidate.type === 'restStarted' ||
      candidate.type === 'restSkipped' ||
      candidate.type === 'finishRequested')
  );
}

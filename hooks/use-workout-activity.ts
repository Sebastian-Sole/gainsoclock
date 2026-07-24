import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useWorkoutStore } from '@/stores/workout-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFinishWorkout } from '@/hooks/use-finish-workout';
import { buildSessionPlan, planEventReplay } from '@/lib/activity-projection';
import {
  drainActivityEvents,
  endWorkoutActivity,
  syncWorkoutActivity,
} from '@/lib/live-activity';

// Store edits arrive per keystroke while the user types set values; batch the
// App Group write + ActivityKit update behind a short quiet period.
const SYNC_DEBOUNCE_MS = 300;

/**
 * Root-level bridge between the workout store and the lock-screen Live
 * Activity (mounted once in app/_layout.tsx, outlives every workout screen).
 *
 * Outbound: every active-workout change re-projects the session plan
 * (lib/activity-projection.ts) and pushes it to the native side, which owns
 * the ActivityKit lifecycle.
 *
 * Inbound: taps handled natively while JS slept (log set, skip rest, finish)
 * are drained from the App Group event log on mount, store hydration, and
 * every return to foreground, then replayed as ordinary store actions — so a
 * lock-screen tap is indistinguishable from an in-app one downstream
 * (history, sync queue, HealthKit).
 */
export function useWorkoutActivity() {
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const restNotificationsEnabled = useSettingsStore(
    (s) => s.notificationsRestTimerEnabled
  );
  const { finishWorkout } = useFinishWorkout();

  const finishRef = useRef(finishWorkout);
  useEffect(() => {
    finishRef.current = finishWorkout;
  }, [finishWorkout]);

  // Outbound: project + push the plan whenever the workout (or units) change.
  const hadWorkout = useRef(false);
  useEffect(() => {
    if (!activeWorkout) {
      // Finish/discard flows end the activity explicitly with the right
      // reason; this is the safety net for any other path to null.
      if (hadWorkout.current) {
        hadWorkout.current = false;
        endWorkoutActivity('discarded');
      }
      return;
    }
    hadWorkout.current = true;
    const plan = buildSessionPlan(activeWorkout, {
      weightUnit,
      distanceUnit,
      restNotificationsEnabled,
    });
    if (!plan) return;
    const timeout = setTimeout(() => syncWorkoutActivity(plan), SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [activeWorkout, weightUnit, distanceUnit, restNotificationsEnabled]);

  // Inbound: replay lock-screen taps recorded while JS was asleep.
  const reconcile = useCallback(() => {
    // Draining clears the native log — never do it before the persisted
    // workout has rehydrated, or the events would replay against null and
    // be lost.
    if (!useWorkoutStore.persist.hasHydrated()) return;
    const events = drainActivityEvents();
    if (events.length === 0) return;

    const store = useWorkoutStore.getState();
    const { actions, finishRequested } = planEventReplay(
      store.activeWorkout,
      events,
      Date.now()
    );
    for (const action of actions) {
      switch (action.kind) {
        case 'logSet':
          store.updateSet(action.exerciseId, action.setId, action.updates);
          break;
        case 'startRest':
          store.startRestTimer(action.seconds, action.exerciseName);
          break;
        case 'stopRest':
          store.stopRestTimer();
          break;
      }
    }
    if (finishRequested) finishRef.current();
  }, []);

  useEffect(() => {
    reconcile();
    const unsubscribeHydration = useWorkoutStore.persist.onFinishHydration(() =>
      reconcile()
    );
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcile();
    });
    return () => {
      unsubscribeHydration();
      subscription.remove();
    };
  }, [reconcile]);
}

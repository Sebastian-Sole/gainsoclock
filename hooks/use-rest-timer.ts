import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useWorkoutStore } from '@/stores/workout-store';
import { warningHaptic } from '@/lib/haptics';
import {
  scheduleRestTimerNotification,
  cancelRestTimerNotification,
} from '@/lib/notifications';

export function useRestTimer() {
  const endsAt = useWorkoutStore((s) => s.activeWorkout?.restTimerEndsAt ?? null);
  const isActive = useWorkoutStore((s) => s.activeWorkout?.isRestTimerActive ?? false);
  const stopTimer = useWorkoutStore((s) => s.stopRestTimer);

  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didFireHaptic = useRef(false);
  const prevEndsAt = useRef<number | null>(null);

  // Core timer loop — same pattern as useWorkoutTimer
  useEffect(() => {
    if (!isActive || !endsAt) {
      setRemaining(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    didFireHaptic.current = false;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);

      if (left <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        stopTimer();
        if (!didFireHaptic.current) {
          didFireHaptic.current = true;
          warningHaptic();
        }
      }
    };

    tick(); // immediate first tick (catches background expiry)
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, endsAt]);

  // Re-tick immediately when app comes back to foreground
  useEffect(() => {
    if (!isActive || !endsAt) return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && endsAt) {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) {
          stopTimer();
          if (!didFireHaptic.current) {
            didFireHaptic.current = true;
            warningHaptic();
          }
        }
      }
    });

    return () => sub.remove();
  }, [isActive, endsAt]);

  // Schedule / cancel OS notification when timer starts or stops
  useEffect(() => {
    if (isActive && endsAt && endsAt !== prevEndsAt.current) {
      prevEndsAt.current = endsAt;
      const seconds = Math.max(1, Math.ceil((endsAt - Date.now()) / 1000));
      scheduleRestTimerNotification(seconds);
    } else if (!isActive && prevEndsAt.current) {
      prevEndsAt.current = null;
      cancelRestTimerNotification();
    }
  }, [isActive, endsAt]);

  // Cancel notification on unmount
  useEffect(() => {
    return () => {
      cancelRestTimerNotification();
    };
  }, []);

  const stop = () => {
    stopTimer();
    cancelRestTimerNotification();
  };

  return { isActive, remaining, stop };
}

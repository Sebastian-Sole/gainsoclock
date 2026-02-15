import { useEffect, useRef } from 'react';
import { useWorkoutStore } from '@/stores/workout-store';
import { warningHaptic } from '@/lib/haptics';

export function useRestTimer() {
  const isActive = useWorkoutStore((s) => s.activeWorkout?.isRestTimerActive ?? false);
  const remaining = useWorkoutStore((s) => s.activeWorkout?.restTimeRemaining ?? 0);
  const tick = useWorkoutStore((s) => s.tickRestTimer);
  const stop = useWorkoutStore((s) => s.stopRestTimer);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive && remaining > 0) {
      intervalRef.current = setInterval(() => {
        tick();
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, remaining > 0]);

  useEffect(() => {
    if (isActive && remaining === 0) {
      warningHaptic();
    }
  }, [isActive, remaining]);

  return { isActive, remaining, stop };
}

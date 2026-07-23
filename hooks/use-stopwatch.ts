import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  effortMs,
  hasStopwatchData,
  isStopwatchRunning,
  pendingEffortsSeconds,
  restMs,
} from '@/lib/stopwatch';
import { useWorkoutStore } from '@/stores/workout-store';

/**
 * Live view of the active workout's set-timing stopwatch session.
 *
 * The store holds only epoch anchors (lib/stopwatch.ts); this hook supplies
 * the 10 Hz "now" that turns them into ticking readouts. It ticks whenever a
 * session with data exists — the rest counter keeps counting while stopped.
 * `now` is state — not a bare Date.now() in render — so a re-render always
 * shows a value consistent with the tick that caused it.
 */
export function useStopwatch() {
  const stopwatch = useWorkoutStore((s) => s.activeWorkout?.stopwatch ?? null);
  const start = useWorkoutStore((s) => s.startStopwatch);
  const pause = useWorkoutStore((s) => s.pauseStopwatch);
  const startNext = useWorkoutStore((s) => s.startNextEffort);
  const discard = useWorkoutStore((s) => s.discardStopwatchEffort);
  const resetEffort = useWorkoutStore((s) => s.resetStopwatchEffort);
  const commit = useWorkoutStore((s) => s.commitStopwatch);
  const reset = useWorkoutStore((s) => s.resetStopwatch);

  const running = isStopwatchRunning(stopwatch);
  const ticking = hasStopwatchData(stopwatch);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    // Timers stall in the background; snap to the real clock on return so the
    // first foreground frame is already correct.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [ticking]);

  return {
    stopwatch,
    running,
    effortMs: stopwatch ? effortMs(stopwatch, now) : 0,
    restMs: stopwatch ? restMs(stopwatch, now) : 0,
    effortsMs: stopwatch?.efforts ?? [],
    pendingSeconds: stopwatch ? pendingEffortsSeconds(stopwatch, now) : [],
    start,
    pause,
    startNext,
    discard,
    resetEffort,
    commit,
    reset,
  };
}

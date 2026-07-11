import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';

import { useWorkoutStore } from '@/stores/workout-store';
import { useHistoryStore } from '@/stores/history-store';
import { useSettingsStore } from '@/stores/settings-store';
import { generateId } from '@/lib/id';
import { saveWorkoutToHealthKit } from '@/lib/healthkit';
import { capture } from '@/lib/analytics';
import { syncToConvex } from '@/lib/convex-sync';
import {
  schedulePostWorkoutNotification,
  rescheduleReminderAfterWorkout,
  cancelStreakRiskNotification,
  cancelRestTimerNotification,
} from '@/lib/notifications';
import { successHaptic } from '@/lib/haptics';
import type { WorkoutLog, WorkoutLogExercise } from '@/lib/types';

// How long to wait for AI workout feedback before falling back to the static
// post-workout summary notification. Never blocks completion UX.
const FEEDBACK_TIMEOUT_MS = 6000;

/**
 * Ends the active workout: persists the log (history + HealthKit + Convex sync),
 * schedules the post-workout summary (racing AI feedback), updates plan-day
 * status, fires analytics, and routes to the post-workout screen. Extracted so
 * both the Focus Mode logger and the Workout Summary screen can finish a
 * workout — with or without every set completed.
 */
export function useFinishWorkout() {
  const router = useRouter();
  const discardWorkoutStore = useWorkoutStore((s) => s.discardWorkout);
  const addLog = useHistoryStore((s) => s.addLog);
  const generateWorkoutFeedback = useAction(api.workoutFeedback.generateFeedback);

  const finishWorkout = useCallback(() => {
    // Cancel the rest-timer notification deterministically. Relying on the
    // isActive effect in use-rest-timer.ts races with the navigation below,
    // which unmounts the hook before endWorkout() flips isActive (#100).
    // Cancelling a non-existent notification is a no-op, so this is safe.
    cancelRestTimerNotification();
    // Read (don't clear) so the summary/logger keep rendering content until the
    // route swaps — clearing first blanks them out (black) mid-transition.
    const workout = useWorkoutStore.getState().activeWorkout;
    if (!workout) {
      router.dismissAll();
      return;
    }

    const completedSets = workout.exercises.reduce(
      (total, e) => total + e.sets.filter((s) => s.completed).length,
      0
    );

    const logExercises: WorkoutLogExercise[] = workout.exercises.map((e, i) => ({
      id: generateId(),
      exerciseId: e.exerciseId,
      name: e.name,
      type: e.type,
      metrics: e.metrics,
      order: i,
      restTimeSeconds: e.restTimeSeconds,
      sets: e.sets,
    }));

    const durationSeconds = workout.startedAt
      ? Math.floor((Date.now() - new Date(workout.startedAt).getTime()) / 1000)
      : 0;

    const log: WorkoutLog = {
      id: generateId(),
      templateId: workout.templateId,
      templateName: workout.templateName,
      exercises: logExercises,
      startedAt: workout.startedAt,
      completedAt: new Date().toISOString(),
      durationSeconds,
    };
    addLog(log);
    saveWorkoutToHealthKit(log);

    const summaryParams = {
      templateName: log.templateName,
      exerciseCount: log.exercises.length,
      completedSets,
      durationSeconds: log.durationSeconds,
      delayMinutes: useSettingsStore.getState().notificationsPostWorkoutDelay,
    };
    void (async () => {
      const feedback = await Promise.race([
        generateWorkoutFeedback({ workoutLogClientId: log.id })
          .then((result) => result?.feedback ?? null)
          .catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FEEDBACK_TIMEOUT_MS)),
      ]);
      schedulePostWorkoutNotification(feedback ? { ...summaryParams, feedback } : summaryParams);
    })();

    rescheduleReminderAfterWorkout();
    cancelStreakRiskNotification();

    capture({
      name: 'workout_logged',
      props: {
        exerciseCount: log.exercises.length,
        setCount: completedSets,
        fromTemplate: Boolean(workout.templateId),
      },
    });

    if (workout.planDayId) {
      const parts = workout.planDayId.split(':');
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const [planClientId, weekStr, dayStr] = parts;
        const week = Number(weekStr);
        const dayOfWeek = Number(dayStr);
        if (!isNaN(week) && !isNaN(dayOfWeek)) {
          syncToConvex(api.plans.updatePlanDayStatus, {
            planClientId,
            week,
            dayOfWeek,
            status: 'completed' as const,
            workoutLogClientId: log.id,
          });
        }
      }
    }

    successHaptic();
    // Collapse the workout stack (active → summary) to its first screen, then
    // replace it with the complete screen. This leaves the stack as [complete]
    // so its "Done" (dismissAll) exits cleanly to the tabs instead of landing
    // on the now-empty logger (which would render blank).
    router.dismissAll();
    router.replace('/workout/complete');
    // Clear only after navigation is queued.
    useWorkoutStore.getState().endWorkout();
  }, [addLog, generateWorkoutFeedback, router]);

  const discardWorkout = useCallback(() => {
    // Same as finishWorkout: cancel before navigating so the OS notification
    // can't outlive the workout (#100).
    cancelRestTimerNotification();
    // Collapse to the logger first (still has content), then clear — the
    // logger's no-workout guard dismisses the modal out to the tabs. Clearing
    // before navigating would blank the summary/logger mid-transition (black).
    router.dismissAll();
    discardWorkoutStore();
  }, [discardWorkoutStore, router]);

  return { finishWorkout, discardWorkout };
}

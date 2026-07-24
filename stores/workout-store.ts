import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import type { ActiveWorkout, Exercise, LoadMode, MetricId, TemplateExercise, WorkoutLog, WorkoutSet } from '@/lib/types';
import { generateId } from '@/lib/id';
import { createDefaultSet, createDefaultSets } from '@/lib/defaults';
import {
  MAX_METRICS_PER_EXERCISE,
  resolveExerciseMetrics,
  editedCardioField,
  solveCardioTriple,
} from '@/lib/metrics';
import {
  applyEffortsToSets,
  createStopwatch,
  discardEffort as swDiscardEffort,
  hasStopwatchData,
  pendingEffortsSeconds,
  pauseStopwatch as swPause,
  resetEffort as swResetEffort,
  startNextEffort as swStartNext,
  startStopwatch as swStart,
} from '@/lib/stopwatch';

interface WorkoutState {
  activeWorkout: ActiveWorkout | null;

  /** Transient UI signal: which exercise the Focus logger should jump to
   *  (set when tapping a summary row or after adding an exercise). Carried
   *  through the store instead of route params — param-carrying hrefs made
   *  dismissTo/navigate treat the logger as a different route and push a
   *  duplicate on top of the summary (#141). Not persisted. The nonce makes
   *  repeat requests for the same exercise re-fire. */
  focusRequest: { id: string; nonce: number } | null;
  requestFocusExercise: (id: string) => void;

  startWorkout: (templateName: string, exercises: TemplateExercise[], templateId?: string, planDayId?: string, previousLog?: WorkoutLog) => void;
  startEmptyWorkout: () => void;
  endWorkout: () => ActiveWorkout | null;
  discardWorkout: () => void;

  // Exercise management
  addExercise: (exercise: Exercise) => void;
  removeExercise: (exerciseId: string) => void;
  reorderExercises: (exercises: Exercise[]) => void;
  moveExercise: (exerciseId: string, direction: 'up' | 'down') => void;
  addExerciseMetric: (exerciseId: string, metricId: MetricId) => void;
  removeExerciseMetric: (exerciseId: string, metricId: MetricId) => void;
  /** Change how this row's weight is counted (total / per hand / per side). */
  setExerciseLoadMode: (exerciseId: string, loadMode: LoadMode) => void;

  // Set management
  addSet: (exerciseId: string, set: WorkoutSet) => void;
  removeSet: (exerciseId: string, setId: string) => void;
  updateSet: (exerciseId: string, setId: string, updates: Partial<WorkoutSet>) => void;
  updateAllSets: (exerciseId: string, updates: Partial<WorkoutSet>) => void;
  updateSetsFromIndex: (exerciseId: string, fromIndex: number, updates: Partial<WorkoutSet>) => void;
  toggleSetComplete: (exerciseId: string, setId: string) => void;

  // Rest timer
  startRestTimer: (seconds: number, exerciseName?: string) => void;
  tickRestTimer: () => void;
  stopRestTimer: () => void;

  // Set-timing stopwatch (Focus logger). One Start→Stop cycle records one
  // effort; commitStopwatch maps efforts onto sets. State lives on the active
  // workout so it persists with it; transitions are pure (lib/stopwatch.ts).
  /** Ensure a session exists for this exercise. An in-progress session — even
   *  for another exercise — is kept; the stopwatch screen shows whose it is. */
  openStopwatch: (exerciseId: string) => void;
  startStopwatch: () => void;
  pauseStopwatch: () => void;
  /** Bank the frozen effort and start timing the next set. */
  startNextEffort: () => void;
  /** Drop a recorded effort (bad split) before committing. */
  discardStopwatchEffort: (index: number) => void;
  /** Zero the current stopped time; recorded efforts are untouched. */
  resetStopwatchEffort: () => void;
  /** Write pending efforts onto the session's exercise — filling incomplete
   *  sets in order, creating sets beyond the plan — and clear the session. */
  commitStopwatch: () => void;
  resetStopwatch: () => void;
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
  (set, get) => ({
  activeWorkout: null,

  focusRequest: null,
  requestFocusExercise: (id) =>
    set((state) => ({
      focusRequest: { id, nonce: (state.focusRequest?.nonce ?? 0) + 1 },
    })),

  startWorkout: (templateName, templateExercises, templateId, planDayId, previousLog) => {
    // Build a lookup of previous exercises by exerciseId for prefilling
    const prevByExerciseId = new Map(
      previousLog?.exercises.map((e) => [e.exerciseId, e]) ?? []
    );

    const exercises: Exercise[] = templateExercises.map((te) => {
      const prevExercise = prevByExerciseId.get(te.exerciseId);

      // If we have previous data, clone its sets (with new IDs, uncompleted)
      if (prevExercise && prevExercise.sets.length > 0) {
        const sets: WorkoutSet[] = prevExercise.sets.map((s) => ({
          ...s,
          id: generateId(),
          completed: false,
        }));
        return {
          id: generateId(),
          exerciseId: te.exerciseId,
          name: te.name,
          type: te.type,
          metrics: te.metrics,
          loadMode: te.loadMode,
          sets,
          restTimeSeconds: te.restTimeSeconds,
        };
      }

      // Fallback to template defaults
      return {
        id: generateId(),
        exerciseId: te.exerciseId,
        name: te.name,
        type: te.type,
        metrics: te.metrics,
        loadMode: te.loadMode,
        sets: createDefaultSets(te.type, te.metrics, te.defaultSetsCount, {
          suggestedReps: te.suggestedReps,
          suggestedWeight: te.suggestedWeight,
          suggestedTime: te.suggestedTime,
          suggestedDistance: te.suggestedDistance,
        }),
        restTimeSeconds: te.restTimeSeconds,
      };
    });

    const workout: ActiveWorkout = {
      id: generateId(),
      templateId,
      templateName,
      exercises,
      startedAt: new Date().toISOString(),
      isRestTimerActive: false,
      restTimeRemaining: 0,
      planDayId,
    };
    set({ activeWorkout: workout });
  },

  startEmptyWorkout: () => {
    const workout: ActiveWorkout = {
      id: generateId(),
      templateName: 'Empty Workout',
      exercises: [],
      startedAt: new Date().toISOString(),
      isRestTimerActive: false,
      restTimeRemaining: 0,
    };
    set({ activeWorkout: workout });
  },

  endWorkout: () => {
    const workout = get().activeWorkout;
    set({ activeWorkout: null });
    return workout;
  },

  discardWorkout: () => {
    set({ activeWorkout: null });
  },

  addExercise: (exercise) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: [...state.activeWorkout.exercises, exercise],
        },
      };
    }),

  removeExercise: (exerciseId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.filter((e) => e.id !== exerciseId),
        },
      };
    }),

  reorderExercises: (exercises) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: { ...state.activeWorkout, exercises },
      };
    }),

  moveExercise: (exerciseId, direction) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      const list = [...state.activeWorkout.exercises];
      const i = list.findIndex((e) => e.id === exerciseId);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= list.length) return state;
      [list[i], list[j]] = [list[j], list[i]];
      return { activeWorkout: { ...state.activeWorkout, exercises: list } };
    }),

  // Metrics are exercise-level: adding one adds a column to every set (blank
  // where unfilled). See docs/decisions/custom-exercise-metrics.md.
  addExerciseMetric: (exerciseId, metricId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) => {
            if (e.id !== exerciseId) return e;
            const base = resolveExerciseMetrics(e.type, e.metrics);
            if (base.includes(metricId) || base.length >= MAX_METRICS_PER_EXERCISE) {
              return { ...e, metrics: base };
            }
            return { ...e, metrics: [...base, metricId] };
          }),
        },
      };
    }),

  removeExerciseMetric: (exerciseId, metricId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) => {
            if (e.id !== exerciseId) return e;
            const base = resolveExerciseMetrics(e.type, e.metrics);
            if (base.length <= 1) return { ...e, metrics: base };
            return { ...e, metrics: base.filter((m) => m !== metricId) };
          }),
        },
      };
    }),

  setExerciseLoadMode: (exerciseId, loadMode) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId ? { ...e, loadMode } : e
          ),
        },
      };
    }),

  addSet: (exerciseId, newSet) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId ? { ...e, sets: [...e.sets, newSet] } : e
          ),
        },
      };
    }),

  removeSet: (exerciseId, setId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId
              ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
              : e
          ),
        },
      };
    }),

  updateSet: (exerciseId, setId, updates) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      // Duration/distance/pace stay consistent as a triple: editing any one
      // recomputes a dependent field from the other two (lib/metrics.ts,
      // solveCardioTriple), so the three can never contradict each other.
      const edited = editedCardioField(updates);
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) => {
            if (e.id !== exerciseId) return e;
            const resolved = edited ? resolveExerciseMetrics(e.type, e.metrics) : undefined;
            return {
              ...e,
              sets: e.sets.map((s) => {
                if (s.id !== setId) return s;
                const next = { ...s, ...updates } as WorkoutSet;
                if (resolved && edited) {
                  Object.assign(next, solveCardioTriple(resolved, next, edited));
                }
                return next;
              }),
            };
          }),
        },
      };
    }),

  updateAllSets: (exerciseId, updates) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s) => ({ ...s, ...updates } as WorkoutSet)),
                }
              : e
          ),
        },
      };
    }),

  updateSetsFromIndex: (exerciseId, fromIndex, updates) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s, i) =>
                    i >= fromIndex ? ({ ...s, ...updates } as WorkoutSet) : s
                  ),
                }
              : e
          ),
        },
      };
    }),

  toggleSetComplete: (exerciseId, setId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          exercises: state.activeWorkout.exercises.map((e) =>
            e.id === exerciseId
              ? {
                  ...e,
                  sets: e.sets.map((s) =>
                    s.id === setId ? { ...s, completed: !s.completed } : s
                  ),
                }
              : e
          ),
        },
      };
    }),

  startRestTimer: (seconds, exerciseName) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          isRestTimerActive: true,
          restTimeRemaining: seconds,
          restTimerEndsAt: Date.now() + seconds * 1000,
          // "+15" extends the running timer without exercise context — keep
          // the name the timer was started with.
          restTimerExerciseName:
            exerciseName ?? state.activeWorkout.restTimerExerciseName,
        },
      };
    }),

  tickRestTimer: () =>
    set((state) => {
      if (!state.activeWorkout || !state.activeWorkout.isRestTimerActive) return state;
      // Calculate remaining from real clock so it survives backgrounding
      const endsAt = state.activeWorkout.restTimerEndsAt ?? 0;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        return {
          activeWorkout: {
            ...state.activeWorkout,
            isRestTimerActive: false,
            restTimeRemaining: 0,
            restTimerEndsAt: undefined,
            restTimerExerciseName: undefined,
          },
        };
      }
      return {
        activeWorkout: {
          ...state.activeWorkout,
          restTimeRemaining: remaining,
        },
      };
    }),

  stopRestTimer: () =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          isRestTimerActive: false,
          restTimeRemaining: 0,
          restTimerEndsAt: undefined,
          restTimerExerciseName: undefined,
        },
      };
    }),

  openStopwatch: (exerciseId) =>
    set((state) => {
      if (!state.activeWorkout) return state;
      const sw = state.activeWorkout.stopwatch;
      // Never silently discard a session with unlogged data.
      if (sw && (hasStopwatchData(sw) || sw.exerciseId === exerciseId)) return state;
      return { activeWorkout: { ...state.activeWorkout, stopwatch: createStopwatch(exerciseId) } };
    }),

  startStopwatch: () =>
    set((state) => {
      if (!state.activeWorkout?.stopwatch) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          stopwatch: swStart(state.activeWorkout.stopwatch, Date.now()),
        },
      };
    }),

  pauseStopwatch: () =>
    set((state) => {
      if (!state.activeWorkout?.stopwatch) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          stopwatch: swPause(state.activeWorkout.stopwatch, Date.now()),
        },
      };
    }),

  startNextEffort: () =>
    set((state) => {
      if (!state.activeWorkout?.stopwatch) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          stopwatch: swStartNext(state.activeWorkout.stopwatch, Date.now()),
        },
      };
    }),

  resetStopwatchEffort: () =>
    set((state) => {
      if (!state.activeWorkout?.stopwatch) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          stopwatch: swResetEffort(state.activeWorkout.stopwatch),
        },
      };
    }),

  discardStopwatchEffort: (index) =>
    set((state) => {
      if (!state.activeWorkout?.stopwatch) return state;
      return {
        activeWorkout: {
          ...state.activeWorkout,
          stopwatch: swDiscardEffort(state.activeWorkout.stopwatch, index),
        },
      };
    }),

  commitStopwatch: () =>
    set((state) => {
      const workout = state.activeWorkout;
      const sw = workout?.stopwatch;
      if (!workout || !sw) return state;
      const efforts = pendingEffortsSeconds(sw, Date.now());
      if (efforts.length === 0) {
        return { activeWorkout: { ...workout, stopwatch: undefined } };
      }
      return {
        activeWorkout: {
          ...workout,
          stopwatch: undefined,
          exercises: workout.exercises.map((e) =>
            e.id === sw.exerciseId
              ? {
                  ...e,
                  sets: applyEffortsToSets(e.sets, efforts, (template) =>
                    template
                      ? { ...template, id: generateId(), completed: false }
                      : createDefaultSet(e.type, e.metrics)
                  ),
                }
              : e
          ),
        },
      };
    }),

  resetStopwatch: () =>
    set((state) => {
      if (!state.activeWorkout) return state;
      return { activeWorkout: { ...state.activeWorkout, stopwatch: undefined } };
    }),
}),
    {
      name: 'workout-storage',
      storage: zustandStorage,
      partialize: (state) => ({ activeWorkout: state.activeWorkout }),
    }
  )
);

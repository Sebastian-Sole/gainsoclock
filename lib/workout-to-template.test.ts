import { describe, it, expect } from "vitest";
import {
  workoutToTemplateExercises,
  suggestedTemplateName,
} from "@/lib/workout-to-template";
import type { Exercise, WorkoutSet } from "@/lib/types";

function makeSeqId() {
  let n = 0;
  return () => `id-${++n}`;
}

function set(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: "s",
    completed: false,
    type: "reps_weight",
    ...overrides,
  };
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "e1",
    exerciseId: "def-1",
    name: "Bench Press",
    type: "reps_weight",
    metrics: ["reps", "weight"],
    sets: [],
    restTimeSeconds: 90,
    ...overrides,
  };
}

describe("workoutToTemplateExercises", () => {
  it("preserves order, identity, metrics, rest, and set count", () => {
    const out = workoutToTemplateExercises(
      [
        exercise({
          id: "e1",
          exerciseId: "def-bench",
          name: "Bench Press",
          sets: [set(), set(), set()],
          restTimeSeconds: 120,
        }),
        exercise({
          id: "e2",
          exerciseId: "def-row",
          name: "Row",
          metrics: ["reps"],
          type: "reps_only",
          sets: [set({ type: "reps_only" }), set({ type: "reps_only" })],
          restTimeSeconds: 60,
        }),
      ],
      makeSeqId()
    );

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      exerciseId: "def-bench",
      name: "Bench Press",
      type: "reps_weight",
      metrics: ["reps", "weight"],
      order: 0,
      restTimeSeconds: 120,
      defaultSetsCount: 3,
    });
    expect(out[1]).toMatchObject({
      exerciseId: "def-row",
      name: "Row",
      type: "reps_only",
      metrics: ["reps"],
      order: 1,
      restTimeSeconds: 60,
      defaultSetsCount: 2,
    });
  });

  it("assigns fresh unique row ids from the injected generator", () => {
    const out = workoutToTemplateExercises(
      [exercise({ id: "e1" }), exercise({ id: "e2" })],
      makeSeqId()
    );
    expect(out.map((e) => e.id)).toEqual(["id-1", "id-2"]);
  });

  it("seeds suggestions from the LAST completed set, not the last set", () => {
    const out = workoutToTemplateExercises(
      [
        exercise({
          sets: [
            set({ completed: true, reps: 10, weight: 60 }),
            set({ completed: true, reps: 8, weight: 80 }),
            set({ completed: false, reps: 5, weight: 100 }),
          ],
        }),
      ],
      makeSeqId()
    );
    expect(out[0].suggestedReps).toBe(8);
    expect(out[0].suggestedWeight).toBe(80);
  });

  it("leaves suggestions blank when no set was completed", () => {
    const out = workoutToTemplateExercises(
      [exercise({ sets: [set({ reps: 10, weight: 60 })] })],
      makeSeqId()
    );
    expect(out[0].suggestedReps).toBeUndefined();
    expect(out[0].suggestedWeight).toBeUndefined();
    expect(out[0].suggestedTime).toBeUndefined();
    expect(out[0].suggestedDistance).toBeUndefined();
  });

  it("seeds time/distance suggestions for cardio-style sets", () => {
    const out = workoutToTemplateExercises(
      [
        exercise({
          type: "time_distance",
          metrics: ["duration", "distance"],
          sets: [
            set({
              type: "time_distance",
              completed: true,
              time: 1800,
              distance: 5,
            }),
          ],
        }),
      ],
      makeSeqId()
    );
    expect(out[0].suggestedTime).toBe(1800);
    expect(out[0].suggestedDistance).toBe(5);
    expect(out[0].suggestedReps).toBeUndefined();
    expect(out[0].suggestedWeight).toBeUndefined();
  });

  it("only seeds the fields the completed set actually carries", () => {
    const out = workoutToTemplateExercises(
      [exercise({ sets: [set({ completed: true, reps: 12 })] })],
      makeSeqId()
    );
    expect(out[0].suggestedReps).toBe(12);
    expect(out[0].suggestedWeight).toBeUndefined();
  });

  it("clamps defaultSetsCount to at least 1 for a zero-set exercise", () => {
    const out = workoutToTemplateExercises([exercise({ sets: [] })], makeSeqId());
    expect(out[0].defaultSetsCount).toBe(1);
  });

  it("does not mutate the input exercises or their sets", () => {
    const sets = [
      set({ completed: true, reps: 10 }),
      set({ completed: false, reps: 8 }),
    ];
    const input = [exercise({ sets })];
    workoutToTemplateExercises(input, makeSeqId());
    expect(input[0].sets).toBe(sets);
    expect(sets.map((s) => s.completed)).toEqual([true, false]);
  });
});

describe("suggestedTemplateName", () => {
  it("suggests the workout's template name", () => {
    expect(suggestedTemplateName({ templateName: "Push Day" })).toBe("Push Day");
  });

  it("suggests nothing for an ad-hoc empty workout", () => {
    expect(suggestedTemplateName({ templateName: "Empty Workout" })).toBe("");
  });
});

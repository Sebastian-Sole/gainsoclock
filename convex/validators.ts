import { v } from "convex/values";

export const exerciseTypeValidator = v.union(
  v.literal("reps_weight"),
  v.literal("reps_time"),
  v.literal("time_only"),
  v.literal("time_distance"),
  v.literal("reps_only")
);

export const workoutSetValidator = v.union(
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("reps_weight"),
    reps: v.number(),
    weight: v.number(),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("reps_time"),
    reps: v.number(),
    time: v.number(),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("time_only"),
    time: v.number(),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("time_distance"),
    time: v.number(),
    distance: v.number(),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("reps_only"),
    reps: v.number(),
  })
);

export const exerciseValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: exerciseTypeValidator,
  sets: v.array(workoutSetValidator),
  restTimeSeconds: v.number(),
});

// Flat set shape for the workoutSets table (optional fields instead of discriminated union)
export const flatSetValidator = v.object({
  clientId: v.string(),
  order: v.number(),
  completed: v.boolean(),
  type: exerciseTypeValidator,
  reps: v.optional(v.number()),
  weight: v.optional(v.number()),
  time: v.optional(v.number()),
  distance: v.optional(v.number()),
});

// Template exercise join table payload
export const templateExerciseValidator = v.object({
  clientId: v.string(),
  exerciseClientId: v.string(),
  order: v.number(),
  restTimeSeconds: v.number(),
  defaultSetsCount: v.number(),
});

// Workout log exercise payload (includes sets for bulk creation)
export const workoutLogExerciseValidator = v.object({
  clientId: v.string(),
  exerciseClientId: v.string(),
  order: v.number(),
  restTimeSeconds: v.number(),
  sets: v.array(flatSetValidator),
});

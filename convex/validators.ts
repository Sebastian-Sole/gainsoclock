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

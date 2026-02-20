import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { exerciseTypeValidator } from "./validators";

export default defineSchema({
  ...authTables,

  // Master exercise library per user
  exercises: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    name: v.string(),
    type: exerciseTypeValidator,
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"])
    .index("by_user_name", ["userId", "name"]),

  // Workout templates (blueprints)
  templates: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    name: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  // Join: template -> exercise (ordering + config)
  templateExercises: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    templateClientId: v.string(),
    exerciseClientId: v.string(),
    order: v.number(),
    restTimeSeconds: v.number(),
    defaultSetsCount: v.number(),
  })
    .index("by_template", ["userId", "templateClientId"])
    .index("by_exercise", ["userId", "exerciseClientId"]),

  // Completed workout logs
  workoutLogs: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    templateId: v.optional(v.string()),
    templateName: v.string(),
    startedAt: v.string(),
    completedAt: v.string(),
    durationSeconds: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  // Exercises performed in a completed workout
  workoutLogExercises: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    workoutLogClientId: v.string(),
    exerciseClientId: v.string(),
    order: v.number(),
    restTimeSeconds: v.number(),
  })
    .index("by_workout", ["userId", "workoutLogClientId"])
    .index("by_exercise", ["userId", "exerciseClientId"]),

  // Individual sets performed in a workout
  workoutSets: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    workoutLogExerciseClientId: v.string(),
    exerciseClientId: v.string(),
    order: v.number(),
    completed: v.boolean(),
    type: exerciseTypeValidator,
    reps: v.optional(v.number()),
    weight: v.optional(v.number()),
    time: v.optional(v.number()),
    distance: v.optional(v.number()),
  })
    .index("by_workout_exercise", ["userId", "workoutLogExerciseClientId"])
    .index("by_exercise", ["userId", "exerciseClientId"]),

  // User preferences
  userSettings: defineTable({
    userId: v.id("users"),
    weightUnit: v.union(v.literal("kg"), v.literal("lbs")),
    distanceUnit: v.union(v.literal("km"), v.literal("mi")),
    defaultRestTime: v.number(),
    hapticsEnabled: v.boolean(),
  }).index("by_user", ["userId"]),
});

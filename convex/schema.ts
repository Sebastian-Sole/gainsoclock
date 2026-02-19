import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { exerciseValidator } from "./validators";

export default defineSchema({
  ...authTables,

  templates: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    name: v.string(),
    exercises: v.array(exerciseValidator),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  workoutLogs: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    templateId: v.optional(v.string()),
    templateName: v.string(),
    exercises: v.array(exerciseValidator),
    startedAt: v.string(),
    completedAt: v.string(),
    durationSeconds: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    weightUnit: v.union(v.literal("kg"), v.literal("lbs")),
    distanceUnit: v.union(v.literal("km"), v.literal("mi")),
    defaultRestTime: v.number(),
    hapticsEnabled: v.boolean(),
  }).index("by_user", ["userId"]),
});

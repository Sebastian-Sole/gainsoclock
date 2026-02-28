import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  exerciseTypeValidator,
  chatMessageRoleValidator,
  chatMessageStatusValidator,
  pendingApprovalValidator,
  toolCallValidator,
  planStatusValidator,
  planDayStatusValidator,
  ingredientValidator,
  macrosValidator,
  weekStartDayValidator,
} from "./validators";

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
    notes: v.optional(v.string()),
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
    suggestedReps: v.optional(v.number()),
    suggestedWeight: v.optional(v.number()),
    suggestedTime: v.optional(v.number()),
    suggestedDistance: v.optional(v.number()),
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
    weekStartDay: v.optional(weekStartDayValidator),
  }).index("by_user", ["userId"]),

  // Chat conversations
  chatConversations: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    title: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  // Chat messages
  chatMessages: defineTable({
    userId: v.id("users"),
    conversationClientId: v.string(),
    role: chatMessageRoleValidator,
    content: v.string(),
    status: chatMessageStatusValidator,
    toolCalls: v.optional(v.array(toolCallValidator)),
    pendingApproval: v.optional(pendingApprovalValidator),
    createdAt: v.string(),
  }).index("by_conversation", ["userId", "conversationClientId"]),

  // Workout plans
  workoutPlans: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    name: v.string(),
    description: v.string(),
    goal: v.optional(v.string()),
    durationWeeks: v.number(),
    startDate: v.string(),
    status: planStatusValidator,
    sourceConversationClientId: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  // Plan days (individual days within a plan)
  planDays: defineTable({
    userId: v.id("users"),
    planClientId: v.string(),
    week: v.number(),
    dayOfWeek: v.number(),
    templateClientId: v.optional(v.string()),
    label: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: planDayStatusValidator,
    workoutLogClientId: v.optional(v.string()),
  })
    .index("by_plan", ["userId", "planClientId"])
    .index("by_plan_week", ["userId", "planClientId", "week"]),

  // Recipes
  recipes: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    title: v.string(),
    description: v.string(),
    ingredients: v.array(ingredientValidator),
    instructions: v.array(v.string()),
    prepTimeMinutes: v.optional(v.number()),
    cookTimeMinutes: v.optional(v.number()),
    servings: v.optional(v.number()),
    macros: v.optional(macrosValidator),
    tags: v.optional(v.array(v.string())),
    sourceConversationClientId: v.optional(v.string()),
    notes: v.optional(v.string()),
    saved: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_clientId", ["userId", "clientId"]),

  // Meal log entries
  mealLogs: defineTable({
    userId: v.id("users"),
    clientId: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    recipeClientId: v.optional(v.string()),
    title: v.string(),
    portionMultiplier: v.number(),
    macros: macrosValidator,
    notes: v.optional(v.string()),
    loggedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_user_clientId", ["userId", "clientId"]),

  // Daily nutrition goals per user
  nutritionGoals: defineTable({
    userId: v.id("users"),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
  }).index("by_user", ["userId"]),
});

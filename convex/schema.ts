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
  goalValidator,
  experienceValidator,
  consentPurposeValidator,
  subscriptionStatusValidator,
  subscriptionSourceValidator,
  dataSourceValidator,
  biologicalSexValidator,
  weeklyReviewStatsValidator,
  weeklyReviewRecommendationValidator,
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
    .index("by_user_clientId", ["userId", "clientId"])
    .index("by_user_completedAt", ["userId", "completedAt"]),

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
    rpe: v.optional(v.number()),
    // Interval-type fields (work/rest pairs)
    variant: v.optional(v.union(v.literal("work"), v.literal("rest"))),
    metric: v.optional(
      v.union(v.literal("pace"), v.literal("distance"), v.literal("speed"))
    ),
    paceSeconds: v.optional(v.number()),
    speed: v.optional(v.number()),
    distanceUnit: v.optional(v.union(v.literal("km"), v.literal("mi"))),
  })
    .index("by_workout_exercise", ["userId", "workoutLogExerciseClientId"])
    .index("by_exercise", ["userId", "exerciseClientId"]),

  // Subscription status (synced from RevenueCat via webhook)
  userSubscriptions: defineTable({
    userId: v.id("users"),
    revenuecatAppUserId: v.string(),
    entitlement: v.string(),
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    store: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    updatedAt: v.string(),
    lastEventId: v.optional(v.string()),
    lastEventTimestampMs: v.optional(v.number()),

    // V2 state-machine additions — all optional here so the plan-02
    // migration can backfill the two existing TestFlight rows without
    // the schema deploy failing. Tightening happens in V1.1 after backfill.
    status: v.optional(subscriptionStatusValidator),
    source: v.optional(subscriptionSourceValidator),
    sourceHistory: v.optional(
      v.array(
        v.object({
          source: v.string(),
          grantedAt: v.string(),
          reason: v.string(),
        })
      )
    ),
    cancelReason: v.optional(v.string()),
    trialExpiresAt: v.optional(v.string()),
    willAutoRenew: v.optional(v.boolean()),
    lastVerifiedAt: v.optional(v.string()),
    notificationAnchorAt: v.optional(v.string()),
    dcsaNotifiedAt: v.optional(v.string()),
    reminder48hSentAt: v.optional(v.string()),
    graceEmailSentAt: v.optional(v.string()),
    winbackEmailSentAt: v.optional(v.string()),
    emailOptOut: v.optional(v.boolean()),
    storefrontCountry: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_revenuecat_id", ["revenuecatAppUserId"])
    .index("by_status", ["status"])
    .index("by_status_trialExpiresAt", ["status", "trialExpiresAt"])
    .index("by_status_lastVerifiedAt", ["status", "lastVerifiedAt"])
    .index("by_status_notificationAnchorAt", ["status", "notificationAnchorAt"])
    .index("by_status_source", ["status", "source"]),

  // Onboarding V2: structured user profile
  userProfile: defineTable({
    userId: v.id("users"),
    clientIntakeId: v.optional(v.string()),
    // The four fields below were required in the V2 intake flow. The demo
    // onboarding pivot (b3c3dca) no longer collects them, so they're optional
    // now; consumers (notably `convex/onboardingActions.ts`) must defensively
    // handle undefined. Existing rows from the old intake already have values.
    goals: v.optional(v.array(goalValidator)),
    primaryGoal: v.optional(goalValidator),
    experience: v.optional(experienceValidator),
    trainingDaysOfWeek: v.optional(v.array(v.number())), // 0-6, max len 7
    ageYears: v.optional(v.number()), // 16-100
    biologicalSex: v.optional(biologicalSexValidator),
    weightKg: v.optional(v.number()), // 30-250
    heightCm: v.optional(v.number()), // 120-230
    bodyFatPercent: v.optional(v.number()), // 3-60
    dataSource: dataSourceValidator,
    ahaGenerationCount: v.optional(v.number()),
    lastAhaAt: v.optional(v.string()),
    archetypeKey: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_user", ["userId"]),

  // Append-only consent log (Security CR4). Withdrawals insert a new row.
  userConsents: defineTable({
    userId: v.id("users"),
    purpose: consentPurposeValidator,
    granted: v.boolean(),
    version: v.string(), // 8-hex SHA-256 prefix from lib/consent.ts
    grantedAt: v.string(), // server-authored ISO
    revokedAt: v.optional(v.string()),
    clientIntakeId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_purpose", ["userId", "purpose"])
    .index("by_user_purpose_grantedAt", ["userId", "purpose", "grantedAt"]),

  // AI-generated "aha" workout preview (streamed). Dedicated table (Theme I).
  // `workout` is deliberately v.any(): streaming writes overwrite full JSON
  // each 250ms tick; client parses only on `status: "complete"`.
  onboardingAha: defineTable({
    userId: v.id("users"),
    generationId: v.string(),
    status: v.union(
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("failed")
    ),
    workout: v.optional(v.any()),
    intro: v.optional(v.string()),
    error: v.optional(v.string()),
    profileSnapshot: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_generationId", ["userId", "generationId"]),

  // AI safety incidents (moderation flags, refusals, bounds violations).
  aiSafetyIncidents: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    detail: v.string(),
    createdAt: v.string(),
  }).index("by_user_createdAt", ["userId", "createdAt"]),

  // User preferences
  userSettings: defineTable({
    userId: v.id("users"),
    weightUnit: v.union(v.literal("kg"), v.literal("lbs")),
    distanceUnit: v.union(v.literal("km"), v.literal("mi")),
    defaultRestTime: v.number(),
    hapticsEnabled: v.boolean(),
    weekStartDay: v.optional(weekStartDayValidator),
    prefillFromLastWorkout: v.optional(v.boolean()),
    defaultSetsCount: v.optional(v.number()),
    defaultRepsCount: v.optional(v.number()),
    notificationsRestTimerEnabled: v.optional(v.boolean()),
    notificationsPostWorkoutEnabled: v.optional(v.boolean()),
    notificationsPostWorkoutDelay: v.optional(v.number()),
    notificationsReminderEnabled: v.optional(v.boolean()),
    notificationsReminderTime: v.optional(v.string()),
    notificationsMorningPlanEnabled: v.optional(v.boolean()),
    notificationsMorningPlanTime: v.optional(v.string()),
    notificationsWeeklyReviewEnabled: v.optional(v.boolean()),
    notificationsWeeklyReviewDay: v.optional(v.number()),
    notificationsWeeklyReviewTime: v.optional(v.string()),
    notificationsProteinNudgeEnabled: v.optional(v.boolean()),
    notificationsProteinNudgeTime: v.optional(v.string()),
    notificationsStreakRiskEnabled: v.optional(v.boolean()),
    notificationsStreakRiskTime: v.optional(v.string()),
    rpeEnabled: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  // Onboarding status
  userOnboarding: defineTable({
    userId: v.id("users"),
    hasCompletedOnboarding: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
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
    .index("by_user_clientId", ["userId", "clientId"])
    .index("by_user_saved", ["userId", "saved"]),

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

  // Workouts imported from HealthKit (Apple Watch, Garmin, Strava, ...)
  externalWorkouts: defineTable({
    userId: v.id("users"),
    healthKitUuid: v.string(), // HK sample UUID (dedup key per user)
    activityType: v.string(), // normalized, e.g. "running", "cycling"
    sourceName: v.string(), // e.g. "Apple Watch", "Garmin Connect"
    sourceBundleId: v.optional(v.string()),
    startedAt: v.number(), // ms epoch
    endedAt: v.number(), // ms epoch
    durationSeconds: v.number(),
    activeEnergyKcal: v.optional(v.number()),
    distanceMeters: v.optional(v.number()),
    avgHeartRateBpm: v.optional(v.number()),
  })
    .index("by_user_uuid", ["userId", "healthKitUuid"])
    .index("by_user_startedAt", ["userId", "startedAt"]),

  // Daily health metrics from HealthKit — one row per user per local day
  healthDailyMetrics: defineTable({
    userId: v.id("users"),
    date: v.string(), // "YYYY-MM-DD" (local)
    asleepSeconds: v.optional(v.number()),
    restingHeartRateBpm: v.optional(v.number()),
    hrvMs: v.optional(v.number()),
    steps: v.optional(v.number()),
    bodyMassKg: v.optional(v.number()),
    activeEnergyKcal: v.optional(v.number()),
    updatedAt: v.number(), // ms epoch
  }).index("by_user_date", ["userId", "date"]),

  // Weekly training review (proactive AI coach) — one row per user per
  // ISO week, keyed by the Monday of that week (user-local "YYYY-MM-DD").
  weeklyReviews: defineTable({
    userId: v.id("users"),
    weekStart: v.string(), // "YYYY-MM-DD" of the Monday (user-local)
    stats: weeklyReviewStatsValidator,
    narrative: v.optional(v.string()),
    recommendation: v.optional(weeklyReviewRecommendationValidator),
    generatedAt: v.number(), // ms epoch
    llmUsed: v.boolean(),
  }).index("by_user_week", ["userId", "weekStart"]),

  // Daily nutrition goals per user
  nutritionGoals: defineTable({
    userId: v.id("users"),
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
  }).index("by_user", ["userId"]),

  // Transient ownership record for meal-photo uploads. Rows are deleted on
  // discard; the daily sweep removes orphans (crashed clients).
  mealPhotos: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_storage", ["storageId"]),
});

import { v } from "convex/values";

export const exerciseTypeValidator = v.union(
  v.literal("reps_weight"),
  v.literal("reps_time"),
  v.literal("time_only"),
  v.literal("time_distance"),
  v.literal("reps_only"),
  v.literal("intervals")
);

const setVariantValidator = v.union(v.literal("work"), v.literal("rest"));
const intervalMetricValidator = v.union(
  v.literal("pace"),
  v.literal("distance"),
  v.literal("speed")
);
const distanceUnitValidator = v.union(v.literal("km"), v.literal("mi"));

export const workoutSetValidator = v.union(
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("reps_weight"),
    reps: v.number(),
    weight: v.number(),
    variant: v.optional(setVariantValidator),
    rpe: v.optional(v.number()),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("reps_time"),
    reps: v.number(),
    time: v.number(),
    variant: v.optional(setVariantValidator),
    rpe: v.optional(v.number()),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("time_only"),
    time: v.number(),
    variant: v.optional(setVariantValidator),
    rpe: v.optional(v.number()),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("time_distance"),
    time: v.number(),
    distance: v.number(),
    variant: v.optional(setVariantValidator),
    rpe: v.optional(v.number()),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("reps_only"),
    reps: v.number(),
    variant: v.optional(setVariantValidator),
    rpe: v.optional(v.number()),
  }),
  v.object({
    id: v.string(),
    completed: v.boolean(),
    type: v.literal("intervals"),
    variant: setVariantValidator,
    metric: intervalMetricValidator,
    time: v.number(),
    distanceUnit: distanceUnitValidator,
    distance: v.optional(v.number()),
    paceSeconds: v.optional(v.number()),
    speed: v.optional(v.number()),
    rpe: v.optional(v.number()),
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
  rpe: v.optional(v.number()),
  variant: v.optional(setVariantValidator),
  metric: v.optional(intervalMetricValidator),
  paceSeconds: v.optional(v.number()),
  speed: v.optional(v.number()),
  distanceUnit: v.optional(distanceUnitValidator),
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

// Chat & AI validators
export const chatMessageRoleValidator = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system")
);

export const chatMessageStatusValidator = v.union(
  v.literal("complete"),
  v.literal("streaming"),
  v.literal("error")
);

export const approvalTypeValidator = v.union(
  v.literal("create_template"),
  v.literal("create_plan"),
  v.literal("update_plan"),
  v.literal("create_recipe")
);

export const approvalStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);

export const pendingApprovalValidator = v.object({
  type: approvalTypeValidator,
  payload: v.string(), // JSON string of proposed data
  status: approvalStatusValidator,
});

export const toolCallValidator = v.object({
  id: v.string(),
  name: v.string(),
  arguments: v.string(), // JSON string
});

// Plan validators
export const planStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("paused")
);

export const planDayStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("skipped"),
  v.literal("rest")
);

// Recipe validators
export const macrosValidator = v.object({
  calories: v.number(),
  protein: v.number(),
  carbs: v.number(),
  fat: v.number(),
});

export const ingredientValidator = v.object({
  name: v.string(),
  amount: v.string(),
  unit: v.optional(v.string()),
  macros: v.optional(macrosValidator),
});

// Week start day validator
export const weekStartDayValidator = v.union(
  v.literal("monday"),
  v.literal("sunday")
);

// Onboarding V2 / profile validators
export const goalValidator = v.union(
  v.literal("stronger"),
  v.literal("leaner"),
  v.literal("healthier"),
  v.literal("routine")
);

export const experienceValidator = v.union(
  v.literal("beginner"),
  v.literal("returning"),
  v.literal("experienced")
);

// "marketing" is intentionally NOT in V1 (HealthKit-Privacy C1).
export const consentPurposeValidator = v.union(
  v.literal("health_data_personalization"),
  v.literal("ai_coach_inference"),
  v.literal("analytics")
);

export const subscriptionStatusValidator = v.union(
  v.literal("free"),
  v.literal("trial"),
  v.literal("pro"),
  v.literal("grace"),
  v.literal("paused"),
  v.literal("lapsed")
);

export const subscriptionSourceValidator = v.union(
  v.literal("rc_intro"),
  v.literal("rc_paid"),
  v.literal("rc_temp"),
  v.literal("app_local")
);

export const dataSourceValidator = v.union(
  v.literal("healthkit"),
  v.literal("manual"),
  v.literal("mixed")
);

export const biologicalSexValidator = v.union(
  v.literal("male"),
  v.literal("female")
);

// Compile-time coverage for Convex. `lib/subscription-constants.ts` remains
// the single source of truth for the literal entitlement string.
export const ENTITLEMENT_IDS = ["Gainsoclock Pro"] as const;

import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const onboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const nowMs = Date.now();
    const userDoc = await ctx.db.get(userId);
    const userCreationMs = userDoc?._creationTime ?? nowMs;
    const isLikelyNewUser = nowMs - userCreationMs < 5 * 60 * 1000;

    // Legacy users without a row are treated as already onboarded.
    // Newly created users are routed through onboarding immediately.
    if (!onboarding) {
      return { hasCompletedOnboarding: !isLikelyNewUser };
    }

    return { hasCompletedOnboarding: onboarding.hasCompletedOnboarding };
  },
});

export const markOnboardingPendingIfUnset = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) return;

    const userDoc = await ctx.db.get(userId);
    const nowMs = Date.now();
    const userCreationMs = userDoc?._creationTime ?? nowMs;
    // If this account was created very recently, treat it as a new signup.
    const isLikelyNewUser = nowMs - userCreationMs < 5 * 60 * 1000;

    const now = new Date(nowMs).toISOString();
    await ctx.db.insert("userOnboarding", {
      userId,
      hasCompletedOnboarding: !isLikelyNewUser,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        hasCompletedOnboarding: true,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("userOnboarding", {
      userId,
      hasCompletedOnboarding: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Delete workout sets via their exercise references
    const logExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_workout", (q) => q.eq("userId", userId))
      .collect();
    for (const le of logExercises) {
      const sets = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q.eq("userId", userId).eq("workoutLogExerciseClientId", le.clientId)
        )
        .collect();
      for (const s of sets) {
        await ctx.db.delete(s._id);
      }
      await ctx.db.delete(le._id);
    }

    // Delete workout logs
    const logs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of logs) {
      await ctx.db.delete(doc._id);
    }

    // Delete template exercises
    const templateExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of templateExercises) {
      await ctx.db.delete(doc._id);
    }

    // Delete templates
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of templates) {
      await ctx.db.delete(doc._id);
    }

    // Delete exercises
    const exercises = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of exercises) {
      await ctx.db.delete(doc._id);
    }

    // Delete user settings
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of settings) {
      await ctx.db.delete(doc._id);
    }

    // Delete onboarding state
    const onboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of onboarding) {
      await ctx.db.delete(doc._id);
    }

    // Delete subscription records
    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const doc of subscriptions) {
      await ctx.db.delete(doc._id);
    }
  },
});

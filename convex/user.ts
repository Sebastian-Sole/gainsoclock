import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

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

// Internal mutation that deletes a batch of documents from a table.
// Returns true if there are more documents to delete.
export const deleteUserDataBatch = internalMutation({
  args: {
    userId: v.id("users"),
    table: v.string(),
    indexName: v.string(),
  },
  handler: async (ctx, { userId, table, indexName }) => {
    const BATCH_SIZE = 500;
    const docs = await (ctx.db as any)
      .query(table)
      .withIndex(indexName, (q: any) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length === BATCH_SIZE;
  },
});

// Internal mutation to delete workout sets for a batch of exercises.
export const deleteWorkoutSetsBatch = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const BATCH_SIZE = 200;
    const logExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_workout", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);

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
    return logExercises.length === BATCH_SIZE;
  },
});

export const getAuthUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

// Public action that orchestrates batched deletion across all tables.
export const deleteAllData = action({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("Not authenticated");

    // Delete workout sets + exercises first (nested relationship)
    let hasMore = true;
    while (hasMore) {
      hasMore = await ctx.runMutation(internal.user.deleteWorkoutSetsBatch, {
        userId,
      });
    }

    // Tables to delete with their index names
    const tables: { table: string; indexName: string }[] = [
      { table: "workoutLogs", indexName: "by_user" },
      { table: "templateExercises", indexName: "by_template" },
      { table: "templates", indexName: "by_user" },
      { table: "exercises", indexName: "by_user" },
      { table: "userSettings", indexName: "by_user" },
      { table: "recipes", indexName: "by_user" },
      { table: "mealLogs", indexName: "by_user" },
      { table: "nutritionGoals", indexName: "by_user" },
      { table: "userOnboarding", indexName: "by_user" },
      { table: "userSubscriptions", indexName: "by_user" },
      { table: "chatMessages", indexName: "by_conversation" },
      { table: "chatConversations", indexName: "by_user" },
      { table: "workoutPlans", indexName: "by_user" },
      { table: "planDays", indexName: "by_plan" },
    ];

    for (const { table, indexName } of tables) {
      let hasMore = true;
      while (hasMore) {
        hasMore = await ctx.runMutation(internal.user.deleteUserDataBatch, {
          userId,
          table,
          indexName,
        });
      }
    }
  },
});

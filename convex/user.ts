import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
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
  },
});

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("nutritionGoals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    calories: v.number(),
    protein: v.number(),
    carbs: v.number(),
    fat: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("nutritionGoals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("nutritionGoals", { userId, ...args });
    }
  },
});

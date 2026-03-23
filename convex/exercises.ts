import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { exerciseTypeValidator } from "./validators";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    clientId: v.string(),
    name: v.string(),
    type: exerciseTypeValidator,
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedup by clientId
    const existingById = await ctx.db
      .query("exercises")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existingById) return existingById._id;

    return await ctx.db.insert("exercises", { userId, ...args });
  },
});

export const bulkUpsert = mutation({
  args: {
    exercises: v.array(
      v.object({
        clientId: v.string(),
        name: v.string(),
        type: exerciseTypeValidator,
        createdAt: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const allExisting = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingClientIds = new Set(allExisting.map((e) => e.clientId));

    for (const exercise of args.exercises) {
      if (!existingClientIds.has(exercise.clientId)) {
        await ctx.db.insert("exercises", { userId, ...exercise });
      }
    }
  },
});

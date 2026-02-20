import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { exerciseValidator } from "./validators";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    clientId: v.string(),
    templateId: v.optional(v.string()),
    templateName: v.string(),
    exercises: v.array(exerciseValidator),
    startedAt: v.string(),
    completedAt: v.string(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("workoutLogs", { userId, ...args });
  },
});

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (log) await ctx.db.delete(log._id);
  },
});

export const update = mutation({
  args: {
    clientId: v.string(),
    templateName: v.optional(v.string()),
    exercises: v.optional(v.array(exerciseValidator)),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!log) return;

    const { clientId: _, ...updates } = args;
    await ctx.db.patch(log._id, updates);
  },
});

export const bulkUpsert = mutation({
  args: {
    logs: v.array(
      v.object({
        clientId: v.string(),
        templateId: v.optional(v.string()),
        templateName: v.string(),
        exercises: v.array(exerciseValidator),
        startedAt: v.string(),
        completedAt: v.string(),
        durationSeconds: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const allExisting = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingClientIds = new Set(allExisting.map((l) => l.clientId));

    for (const log of args.logs) {
      if (!existingClientIds.has(log.clientId)) {
        await ctx.db.insert("workoutLogs", { userId, ...log });
      }
    }
  },
});

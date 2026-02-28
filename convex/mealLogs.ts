import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { macrosValidator } from "./validators";

// ── Queries ────────────────────────────────────────────────────

export const listByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const logs = await ctx.db
      .query("mealLogs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", args.date)
      )
      .collect();

    // Sort by most recent first
    logs.sort(
      (a, b) =>
        new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
    );

    return logs;
  },
});

export const listDateRange = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const logs = await ctx.db
      .query("mealLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return logs.filter((l) => l.date >= args.from && l.date <= args.to);
  },
});

// ── Mutations ──────────────────────────────────────────────────

export const logMeal = mutation({
  args: {
    clientId: v.string(),
    date: v.string(),
    recipeClientId: v.optional(v.string()),
    title: v.string(),
    portionMultiplier: v.number(),
    macros: macrosValidator,
    notes: v.optional(v.string()),
    loggedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedup by clientId
    const existing = await ctx.db
      .query("mealLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("mealLogs", {
      userId,
      ...args,
    });
  },
});

export const updateMealLog = mutation({
  args: {
    clientId: v.string(),
    portionMultiplier: v.optional(v.number()),
    macros: v.optional(macrosValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const log = await ctx.db
      .query("mealLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!log) throw new Error("Meal log not found");

    const { clientId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) patch[key] = val;
    }
    await ctx.db.patch(log._id, patch);
  },
});

export const deleteMealLog = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const log = await ctx.db
      .query("mealLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (log) {
      await ctx.db.delete(log._id);
    }
  },
});

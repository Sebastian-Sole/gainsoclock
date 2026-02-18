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
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    clientId: v.string(),
    name: v.string(),
    exercises: v.array(exerciseValidator),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("templates")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("templates", { userId, ...args });
  },
});

export const updateByClientId = mutation({
  args: {
    clientId: v.string(),
    name: v.optional(v.string()),
    exercises: v.optional(v.array(exerciseValidator)),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const template = await ctx.db
      .query("templates")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!template) return;

    const { clientId: _, ...updates } = args;
    await ctx.db.patch(template._id, updates);
  },
});

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const template = await ctx.db
      .query("templates")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (template) await ctx.db.delete(template._id);
  },
});

export const bulkUpsert = mutation({
  args: {
    templates: v.array(
      v.object({
        clientId: v.string(),
        name: v.string(),
        exercises: v.array(exerciseValidator),
        createdAt: v.string(),
        updatedAt: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    for (const t of args.templates) {
      const existing = await ctx.db
        .query("templates")
        .withIndex("by_user_clientId", (q) =>
          q.eq("userId", userId).eq("clientId", t.clientId)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("templates", { userId, ...t });
      }
    }
  },
});

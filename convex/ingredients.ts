import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { macrosValidator, ingredientSourceValidator } from "./validators";

// ── Queries ────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const items = await ctx.db
      .query("ingredients")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Newest first
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return items;
  },
});

// ── Mutations ──────────────────────────────────────────────────

export const upsert = mutation({
  args: {
    clientId: v.string(),
    name: v.string(),
    per100g: macrosValidator,
    servingSizeG: v.optional(v.number()),
    barcode: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    source: ingredientSourceValidator,
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedupe by clientId (offline replays), then by barcode (re-scan of a
    // product that was already saved, possibly from another device).
    let existing = await ctx.db
      .query("ingredients")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!existing && args.barcode !== undefined) {
      existing = await ctx.db
        .query("ingredients")
        .withIndex("by_user_barcode", (q) =>
          q.eq("userId", userId).eq("barcode", args.barcode)
        )
        .first();
    }

    if (existing) {
      // Refresh the product data; keep the original clientId/createdAt so the
      // row stays stable for clients that already reference it.
      const patch: Record<string, unknown> = {
        name: args.name,
        per100g: args.per100g,
        source: args.source,
      };
      if (args.servingSizeG !== undefined) patch.servingSizeG = args.servingSizeG;
      if (args.barcode !== undefined) patch.barcode = args.barcode;
      if (args.imageUrl !== undefined) patch.imageUrl = args.imageUrl;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("ingredients", {
      userId,
      ...args,
    });
  },
});

export const deleteIngredient = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const item = await ctx.db
      .query("ingredients")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (item) {
      await ctx.db.delete(item._id);
    }
  },
});

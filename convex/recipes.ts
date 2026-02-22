import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ingredientValidator, macrosValidator } from "./validators";

// ── Queries ────────────────────────────────────────────────────

export const listRecipes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Sort by most recent first
    recipes.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return recipes;
  },
});

export const listSavedRecipes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return recipes
      .filter((r) => r.saved)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  },
});

export const getRecipe = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("recipes")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
  },
});

// ── Mutations ──────────────────────────────────────────────────

export const createRecipe = internalMutation({
  args: {
    userId: v.id("users"),
    clientId: v.string(),
    title: v.string(),
    description: v.string(),
    ingredients: v.array(ingredientValidator),
    instructions: v.array(v.string()),
    prepTimeMinutes: v.optional(v.number()),
    cookTimeMinutes: v.optional(v.number()),
    servings: v.optional(v.number()),
    macros: v.optional(macrosValidator),
    tags: v.optional(v.array(v.string())),
    sourceConversationClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Dedup by clientId
    const existing = await ctx.db
      .query("recipes")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", args.userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("recipes", {
      userId: args.userId,
      clientId: args.clientId,
      title: args.title,
      description: args.description,
      ingredients: args.ingredients,
      instructions: args.instructions,
      prepTimeMinutes: args.prepTimeMinutes,
      cookTimeMinutes: args.cookTimeMinutes,
      servings: args.servings,
      macros: args.macros,
      tags: args.tags,
      sourceConversationClientId: args.sourceConversationClientId,
      saved: true,
      createdAt: new Date().toISOString(),
    });
  },
});

export const toggleSaveRecipe = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (recipe) {
      await ctx.db.patch(recipe._id, { saved: !recipe.saved });
    }
  },
});

export const deleteRecipe = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (recipe) {
      await ctx.db.delete(recipe._id);
    }
  },
});

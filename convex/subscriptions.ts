import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Public query: check if current user has active pro subscription
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isActive: false };

    const subscription = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      isActive: subscription?.isActive ?? false,
      productId: subscription?.productId,
      expiresAt: subscription?.expiresAt,
    };
  },
});

// Internal query: check subscription for a specific userId (used by actions)
export const checkSubscription = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    return subscription?.isActive ?? false;
  },
});

// Public mutation: sync subscription from client after purchase/restore
export const syncFromClient = mutation({
  args: {
    revenuecatAppUserId: v.string(),
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const now = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        revenuecatAppUserId: args.revenuecatAppUserId,
        isActive: args.isActive,
        productId: args.productId,
        expiresAt: args.expiresAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSubscriptions", {
        userId,
        revenuecatAppUserId: args.revenuecatAppUserId,
        entitlement: "pro",
        isActive: args.isActive,
        productId: args.productId,
        expiresAt: args.expiresAt,
        updatedAt: now,
      });
    }
  },
});

// Internal mutation: update subscription from webhook
export const updateFromWebhook = internalMutation({
  args: {
    revenuecatAppUserId: v.string(),
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    store: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_revenuecat_id", (q) =>
        q.eq("revenuecatAppUserId", args.revenuecatAppUserId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: args.isActive,
        productId: args.productId,
        store: args.store,
        expiresAt: args.expiresAt,
        updatedAt: new Date().toISOString(),
      });
    }
    // If no existing record, the client sync will create it.
    // The webhook may fire before the client calls syncFromClient.
  },
});

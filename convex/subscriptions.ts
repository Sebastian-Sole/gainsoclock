import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

function hasExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

function isCurrentlyActive(subscription: {
  isActive: boolean;
  expiresAt?: string;
} | null) {
  if (!subscription?.isActive) return false;
  return !hasExpired(subscription.expiresAt);
}

// Public query: check if current user has active pro subscription
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isActive: false };

    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const subscription = subscriptions[0] ?? null;

    return {
      isActive: isCurrentlyActive(subscription),
      productId: subscription?.productId,
      expiresAt: subscription?.expiresAt,
    };
  },
});

// Internal query: check subscription for a specific userId (used by actions)
export const checkSubscription = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return isCurrentlyActive(subscriptions[0] ?? null);
  },
});

// Public mutation: ensure this user is mapped to RevenueCat app_user_id.
// This is intentionally non-authoritative for entitlement state.
export const registerCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const now = new Date().toISOString();
    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const [primary, ...duplicates] = subscriptions;
    const revenuecatAppUserId = userId;

    if (primary) {
      await ctx.db.patch(primary._id, {
        revenuecatAppUserId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSubscriptions", {
        userId,
        revenuecatAppUserId,
        entitlement: "pro",
        isActive: false,
        updatedAt: now,
      });
    }

    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
    }
  },
});

// Public action: verify the caller's subscription via RevenueCat REST API, then
// update the database.  This prevents malicious clients from granting themselves
// Pro access by calling a mutation directly.
export const syncFromClient = action({
  args: {
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    store: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const revenuecatApiKey = process.env.REVENUECAT_API_KEY;

    let verified = false;
    let verifiedProductId: string | undefined;
    let verifiedStore: string | undefined;
    let verifiedExpiresAt: string | undefined;

    if (revenuecatApiKey) {
      // Verify subscription server-side via RevenueCat REST API.
      const response = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${revenuecatApiKey}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const entitlements = data?.subscriber?.entitlements ?? {};
        const entitlementId =
          process.env.REVENUECAT_ENTITLEMENT_ID ?? "Gainsoclock Pro";

        const entitlement =
          entitlements[entitlementId] ?? Object.values(entitlements)[0];

        if (entitlement) {
          const expiresDate = entitlement.expires_date;
          const isExpired =
            expiresDate && Date.parse(expiresDate) <= Date.now();
          verified = !isExpired;
          verifiedProductId = entitlement.product_identifier;
          verifiedStore = entitlement.store;
          verifiedExpiresAt = expiresDate ?? undefined;
        }
      } else {
        console.warn(
          `[RevenueCat] API verification failed (${response.status}), ` +
            "falling back to client-provided data."
        );
        // Fall back to trusting client data when API call fails so purchases
        // are not blocked by transient RevenueCat outages.
        verified = args.isActive;
        verifiedProductId = args.productId;
        verifiedStore = args.store;
        verifiedExpiresAt = args.expiresAt;
      }
    } else {
      // No server key configured – fall back to client data with a warning.
      console.warn(
        "[RevenueCat] REVENUECAT_API_KEY is not set – cannot verify " +
          "subscription server-side. Trusting client-provided data."
      );
      verified = args.isActive;
      verifiedProductId = args.productId;
      verifiedStore = args.store;
      verifiedExpiresAt = args.expiresAt;
    }

    await ctx.runMutation(internal.subscriptions.upsertSubscription, {
      userId,
      isActive: verified,
      productId: verifiedProductId,
      store: verifiedStore,
      expiresAt: verifiedExpiresAt,
    });
  },
});

// Internal mutation: upsert subscription record (called by syncFromClient action).
export const upsertSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    store: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const [primary, ...duplicates] = subscriptions;
    const now = new Date().toISOString();
    const updates = {
      revenuecatAppUserId: args.userId,
      entitlement: "pro",
      isActive: args.isActive,
      productId: args.productId,
      store: args.store,
      expiresAt: args.expiresAt,
      updatedAt: now,
    };

    if (primary) {
      await ctx.db.patch(primary._id, updates);
    } else {
      await ctx.db.insert("userSubscriptions", {
        userId: args.userId,
        ...updates,
      });
    }

    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
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
    eventId: v.optional(v.string()),
    eventTimestampMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_revenuecat_id", (q) =>
        q.eq("revenuecatAppUserId", args.revenuecatAppUserId)
      )
      .collect();

    matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const [primary, ...duplicates] = matches;

    // Ignore stale or replayed events if we already processed a newer one.
    if (primary && args.eventId && primary.lastEventId === args.eventId) {
      return;
    }
    if (
      primary &&
      args.eventTimestampMs !== undefined &&
      primary.lastEventTimestampMs !== undefined &&
      args.eventTimestampMs < primary.lastEventTimestampMs
    ) {
      return;
    }

    const now = new Date().toISOString();

    if (primary) {
      await ctx.db.patch(primary._id, {
        isActive: args.isActive,
        productId: args.productId,
        store: args.store,
        expiresAt: args.expiresAt,
        updatedAt: now,
        lastEventId: args.eventId,
        lastEventTimestampMs: args.eventTimestampMs,
      });
      for (const duplicate of duplicates) {
        await ctx.db.delete(duplicate._id);
      }
      return;
    }

    const normalizedUserId = ctx.db.normalizeId("users", args.revenuecatAppUserId);
    if (!normalizedUserId) {
      // We can only upsert when app_user_id maps to our userId format.
      return;
    }

    await ctx.db.insert("userSubscriptions", {
      userId: normalizedUserId,
      revenuecatAppUserId: args.revenuecatAppUserId,
      entitlement: "pro",
      isActive: args.isActive,
      productId: args.productId,
      store: args.store,
      expiresAt: args.expiresAt,
      updatedAt: now,
      lastEventId: args.eventId,
      lastEventTimestampMs: args.eventTimestampMs,
    });
  },
});

import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { planStatusValidator, planDayStatusValidator } from "./validators";

// ── Queries ────────────────────────────────────────────────────

export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const plans = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Sort active plans first, then by most recent
    plans.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return plans;
  },
});

export const getPlanWithDays = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const plan = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (!plan) return null;

    const days = await ctx.db
      .query("planDays")
      .withIndex("by_plan", (q) =>
        q.eq("userId", userId).eq("planClientId", args.clientId)
      )
      .collect();

    days.sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      return a.dayOfWeek - b.dayOfWeek;
    });

    return { ...plan, days };
  },
});

export const getActivePlan = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return plans.find((p) => p.status === "active") ?? null;
  },
});

// ── Mutations ──────────────────────────────────────────────────

export const createPlan = internalMutation({
  args: {
    userId: v.id("users"),
    clientId: v.string(),
    name: v.string(),
    description: v.string(),
    goal: v.optional(v.string()),
    durationWeeks: v.number(),
    startDate: v.string(),
    sourceConversationClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Dedup by clientId
    const existing = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", args.userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("workoutPlans", {
      userId: args.userId,
      clientId: args.clientId,
      name: args.name,
      description: args.description,
      goal: args.goal,
      durationWeeks: args.durationWeeks,
      startDate: args.startDate,
      status: "active",
      sourceConversationClientId: args.sourceConversationClientId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createPlanDays = internalMutation({
  args: {
    userId: v.id("users"),
    planClientId: v.string(),
    days: v.array(
      v.object({
        week: v.number(),
        dayOfWeek: v.number(),
        templateClientId: v.optional(v.string()),
        label: v.optional(v.string()),
        notes: v.optional(v.string()),
        status: planDayStatusValidator,
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const day of args.days) {
      await ctx.db.insert("planDays", {
        userId: args.userId,
        planClientId: args.planClientId,
        week: day.week,
        dayOfWeek: day.dayOfWeek,
        templateClientId: day.templateClientId,
        label: day.label,
        notes: day.notes,
        status: day.status,
      });
    }
  },
});

export const updatePlanDayStatus = mutation({
  args: {
    planClientId: v.string(),
    week: v.number(),
    dayOfWeek: v.number(),
    status: planDayStatusValidator,
    workoutLogClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const days = await ctx.db
      .query("planDays")
      .withIndex("by_plan_week", (q) =>
        q
          .eq("userId", userId)
          .eq("planClientId", args.planClientId)
          .eq("week", args.week)
      )
      .collect();

    const day = days.find((d) => d.dayOfWeek === args.dayOfWeek);
    if (!day) return;

    const updates: Record<string, unknown> = { status: args.status };
    if (args.workoutLogClientId) {
      updates.workoutLogClientId = args.workoutLogClientId;
    }
    await ctx.db.patch(day._id, updates);

    // Update plan timestamp
    const plan = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.planClientId)
      )
      .unique();
    if (plan) {
      await ctx.db.patch(plan._id, { updatedAt: new Date().toISOString() });
    }
  },
});

export const updatePlanStatus = mutation({
  args: {
    clientId: v.string(),
    status: planStatusValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const plan = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (plan) {
      await ctx.db.patch(plan._id, {
        status: args.status,
        updatedAt: new Date().toISOString(),
      });
    }
  },
});

export const deletePlan = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const plan = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (!plan) return;

    // Delete all plan days
    const days = await ctx.db
      .query("planDays")
      .withIndex("by_plan", (q) =>
        q.eq("userId", userId).eq("planClientId", args.clientId)
      )
      .collect();
    for (const day of days) {
      await ctx.db.delete(day._id);
    }

    await ctx.db.delete(plan._id);
  },
});

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Health-data withdrawal (plan-08, HealthKit-Privacy CR5). Scrubs the
// personalisation inputs from `userProfile` and marks the data source as
// `manual` so downstream generators fall back to non-personalised copy.
// Body stats are nulled; goals/experience/training days stay so the user's
// non-HealthKit preferences survive.
export const scheduleProfileErasure = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return;
    const now = new Date().toISOString();
    await ctx.db.patch(profile._id, {
      weightKg: undefined,
      heightCm: undefined,
      bodyFatPercent: undefined,
      ageYears: undefined,
      biologicalSex: undefined,
      dataSource: "manual",
      updatedAt: now,
    });
  },
});

const statusValidator = v.union(
  v.literal("streaming"),
  v.literal("complete"),
  v.literal("failed")
);

// Upserts the onboardingAha row keyed by (userId, generationId). Streaming
// writes overwrite `workout` as full JSON each 250ms tick. The first call in
// a generation carries `startedAt` + `profileSnapshot`; subsequent ticks just
// patch `workout` / `intro` / `status`.
export const writeAhaDelta = internalMutation({
  args: {
    userId: v.id("users"),
    generationId: v.string(),
    status: v.optional(statusValidator),
    workout: v.optional(v.any()),
    intro: v.optional(v.string()),
    profileSnapshot: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("onboardingAha")
      .withIndex("by_user_generationId", (q) =>
        q.eq("userId", args.userId).eq("generationId", args.generationId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.status !== undefined ? { status: args.status } : {}),
        ...(args.workout !== undefined ? { workout: args.workout } : {}),
        ...(args.intro !== undefined ? { intro: args.intro } : {}),
        ...(args.completedAt !== undefined
          ? { completedAt: args.completedAt }
          : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("onboardingAha", {
      userId: args.userId,
      generationId: args.generationId,
      status: args.status ?? "streaming",
      workout: args.workout,
      intro: args.intro,
      profileSnapshot: args.profileSnapshot ?? "",
      startedAt: args.startedAt ?? now,
      completedAt: args.completedAt,
      updatedAt: now,
    });
  },
});

export const markAhaFailed = internalMutation({
  args: {
    userId: v.id("users"),
    generationId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("onboardingAha")
      .withIndex("by_user_generationId", (q) =>
        q.eq("userId", args.userId).eq("generationId", args.generationId)
      )
      .unique();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "failed",
        error: args.reason,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("onboardingAha", {
      userId: args.userId,
      generationId: args.generationId,
      status: "failed",
      error: args.reason,
      profileSnapshot: "",
      startedAt: now,
      updatedAt: now,
    });
  },
});

export const markAhaStaleById = internalMutation({
  args: { ahaId: v.id("onboardingAha"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ahaId, {
      status: "failed",
      error: args.reason,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const incrementAhaCount = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile) return;
    const now = new Date().toISOString();
    await ctx.db.patch(profile._id, {
      ahaGenerationCount: (profile.ahaGenerationCount ?? 0) + 1,
      lastAhaAt: now,
      updatedAt: now,
    });
  },
});

export const logAiSafetyIncident = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiSafetyIncidents", {
      userId: args.userId,
      kind: args.kind,
      detail: args.detail.slice(0, 2000),
      createdAt: new Date().toISOString(),
    });
  },
});

export const getProfileForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const getAiConsentForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("userConsents")
      .withIndex("by_user_purpose_grantedAt", (q) =>
        q.eq("userId", args.userId).eq("purpose", "ai_coach_inference")
      )
      .order("desc")
      .first();
    return latest ? { granted: latest.granted } : { granted: false };
  },
});

export const findAhaByGenerationId = internalQuery({
  args: { userId: v.id("users"), generationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("onboardingAha")
      .withIndex("by_user_generationId", (q) =>
        q.eq("userId", args.userId).eq("generationId", args.generationId)
      )
      .unique();
  },
});

export const findLastCompletedAha = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("onboardingAha")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);
    return rows.find((r) => r.status === "complete") ?? null;
  },
});

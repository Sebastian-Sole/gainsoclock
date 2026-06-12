import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Batch caps keep mutation payloads/write volume bounded (Convex limits).
const MAX_WORKOUT_BATCH = 200;
const MAX_METRIC_BATCH = 100;

const externalWorkoutPayload = v.object({
  healthKitUuid: v.string(),
  activityType: v.string(),
  sourceName: v.string(),
  sourceBundleId: v.optional(v.string()),
  startedAt: v.number(),
  endedAt: v.number(),
  durationSeconds: v.number(),
  activeEnergyKcal: v.optional(v.number()),
  distanceMeters: v.optional(v.number()),
  avgHeartRateBpm: v.optional(v.number()),
});

const dailyMetricPayload = v.object({
  date: v.string(), // "YYYY-MM-DD" (local)
  asleepSeconds: v.optional(v.number()),
  restingHeartRateBpm: v.optional(v.number()),
  hrvMs: v.optional(v.number()),
  steps: v.optional(v.number()),
  bodyMassKg: v.optional(v.number()),
  activeEnergyKcal: v.optional(v.number()),
});

// Idempotent import of HealthKit workouts, deduped by HK sample UUID.
// HK can re-deliver a sample with updated totals (e.g. energy finalized
// after the workout ends), so existing rows are patched when changed.
export const upsertExternalWorkouts = mutation({
  args: { workouts: v.array(externalWorkoutPayload) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.workouts.length > MAX_WORKOUT_BATCH) {
      throw new Error(
        `Batch too large: max ${MAX_WORKOUT_BATCH} workouts per call`
      );
    }

    let inserted = 0;
    let updated = 0;

    for (const w of args.workouts) {
      const existing = await ctx.db
        .query("externalWorkouts")
        .withIndex("by_user_uuid", (q) =>
          q.eq("userId", userId).eq("healthKitUuid", w.healthKitUuid)
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("externalWorkouts", { userId, ...w });
        inserted++;
      } else if (
        existing.endedAt !== w.endedAt ||
        existing.activeEnergyKcal !== w.activeEnergyKcal
      ) {
        await ctx.db.patch(existing._id, { ...w });
        updated++;
      }
    }

    return { inserted, updated };
  },
});

// Upsert one row per local day. Merge semantics: only fields present in
// the incoming payload overwrite stored values — partial updates (e.g. a
// steps-only sync) must not null out previously synced metrics.
export const upsertDailyMetrics = mutation({
  args: { metrics: v.array(dailyMetricPayload) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.metrics.length > MAX_METRIC_BATCH) {
      throw new Error(
        `Batch too large: max ${MAX_METRIC_BATCH} metrics per call`
      );
    }

    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const m of args.metrics) {
      const definedFields = {
        ...(m.asleepSeconds !== undefined && {
          asleepSeconds: m.asleepSeconds,
        }),
        ...(m.restingHeartRateBpm !== undefined && {
          restingHeartRateBpm: m.restingHeartRateBpm,
        }),
        ...(m.hrvMs !== undefined && { hrvMs: m.hrvMs }),
        ...(m.steps !== undefined && { steps: m.steps }),
        ...(m.bodyMassKg !== undefined && { bodyMassKg: m.bodyMassKg }),
        ...(m.activeEnergyKcal !== undefined && {
          activeEnergyKcal: m.activeEnergyKcal,
        }),
      };

      const existing = await ctx.db
        .query("healthDailyMetrics")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", userId).eq("date", m.date)
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("healthDailyMetrics", {
          userId,
          date: m.date,
          ...definedFields,
          updatedAt: now,
        });
        inserted++;
      } else {
        await ctx.db.patch(existing._id, { ...definedFields, updatedAt: now });
        updated++;
      }
    }

    return { inserted, updated };
  },
});

// External workouts in [start, end) — ms epoch bounds, newest first.
export const listExternalWorkouts = query({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("externalWorkouts")
      .withIndex("by_user_startedAt", (q) =>
        q
          .eq("userId", userId)
          .gte("startedAt", args.start)
          .lt("startedAt", args.end)
      )
      .order("desc")
      .collect();
  },
});

// Shared last-7-days aggregate used by both the client-facing summary
// query and the internal chat-context query.
async function buildHealthSummary(ctx: QueryCtx, userId: Id<"users">) {
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // by_user_date sorts lexicographically on "YYYY-MM-DD" — desc = newest first.
  const dailyMetricRows = await ctx.db
    .query("healthDailyMetrics")
    .withIndex("by_user_date", (q) => q.eq("userId", userId))
    .order("desc")
    .take(7);

  const recentWorkouts = await ctx.db
    .query("externalWorkouts")
    .withIndex("by_user_startedAt", (q) =>
      q.eq("userId", userId).gte("startedAt", sevenDaysAgoMs)
    )
    .order("desc")
    .collect();

  const last = recentWorkouts[0];

  return {
    dailyMetrics: dailyMetricRows.map((d) => ({
      date: d.date,
      ...(d.asleepSeconds !== undefined && { asleepSeconds: d.asleepSeconds }),
      ...(d.restingHeartRateBpm !== undefined && {
        restingHeartRateBpm: d.restingHeartRateBpm,
      }),
      ...(d.hrvMs !== undefined && { hrvMs: d.hrvMs }),
      ...(d.steps !== undefined && { steps: d.steps }),
      ...(d.bodyMassKg !== undefined && { bodyMassKg: d.bodyMassKg }),
      ...(d.activeEnergyKcal !== undefined && {
        activeEnergyKcal: d.activeEnergyKcal,
      }),
    })),
    externalWorkoutCount7d: recentWorkouts.length,
    // Deduped activity types for the 7-day window (for AI coach context).
    activityTypes7d: [...new Set(recentWorkouts.map((w) => w.activityType))],
    lastExternalWorkout: last
      ? {
          activityType: last.activityType,
          sourceName: last.sourceName,
          startedAt: last.startedAt,
        }
      : null,
  };
}

// Last-7-days health summary for the signed-in user.
export const getHealthSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await buildHealthSummary(ctx, userId);
  },
});

// Whether the user's latest health_data_personalization consent is granted.
// Gate every path that feeds imported health data into AI inference (chat
// context, weekly review LLM, post-workout feedback) on this. Showing the
// user their own imported data in-app (History timeline, review stats grid)
// is core functionality of the import toggle and is deliberately NOT gated
// here.
export async function hasHealthPersonalizationConsent(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<boolean> {
  const latest = await ctx.db
    .query("userConsents")
    .withIndex("by_user_purpose_grantedAt", (q) =>
      q.eq("userId", userId).eq("purpose", "health_data_personalization")
    )
    .order("desc")
    .first();
  return latest?.granted === true;
}

// Same summary shape, callable from actions (chatActions) with an explicit
// userId — the action has already authenticated the user. Returns null when
// the user has not granted health_data_personalization, so health data
// never reaches an AI prompt without consent.
export const getHealthContextForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    if (!(await hasHealthPersonalizationConsent(ctx, args.userId))) {
      return null;
    }
    return await buildHealthSummary(ctx, args.userId);
  },
});

import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { bestMatchingLog } from "./workoutOverlap";

// Batch caps keep mutation payloads/write volume bounded (Convex limits).
const MAX_WORKOUT_BATCH = 200;
const MAX_METRIC_BATCH = 100;

// Bounds for the native-log candidate lookup when link-matching an external
// workout (issue #117). ±1 day around the external window keeps the indexed
// range query small; 50 logs in a 3-day span is already implausible.
const LINK_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_LINK_CANDIDATES = 50;

// Best native log covering the same session as an external workout, or null.
// `completedAt` is always a full `Date.toISOString()` string client-side, so
// lexicographic range bounds on the by_user_completedAt index are correct.
async function findLinkedLogClientId(
  ctx: QueryCtx,
  userId: Id<"users">,
  w: { startedAt: number; endedAt: number }
): Promise<string | null> {
  const from = new Date(w.startedAt - LINK_WINDOW_MS).toISOString();
  const to = new Date(w.endedAt + LINK_WINDOW_MS).toISOString();
  const candidates = await ctx.db
    .query("workoutLogs")
    .withIndex("by_user_completedAt", (q) =>
      q.eq("userId", userId).gte("completedAt", from).lte("completedAt", to)
    )
    .take(MAX_LINK_CANDIDATES);
  return bestMatchingLog(w, candidates)?.clientId ?? null;
}

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
        // Link-match against native logs at import time (issue #117): the
        // Fitbull log usually reaches Convex before the watch workout does.
        const linked = await findLinkedLogClientId(ctx, userId, w);
        await ctx.db.insert("externalWorkouts", {
          userId,
          ...w,
          ...(linked !== null && { linkedWorkoutLogClientId: linked }),
        });
        inserted++;
      } else if (
        existing.endedAt !== w.endedAt ||
        existing.activeEnergyKcal !== w.activeEnergyKcal
      ) {
        // Re-delivery can finalize the end time — retry matching for rows
        // still unlinked, unless the user dismissed the link.
        const linked =
          existing.linkedWorkoutLogClientId === undefined &&
          existing.linkDismissed !== true
            ? await findLinkedLogClientId(ctx, userId, w)
            : null;
        await ctx.db.patch(existing._id, {
          ...w,
          ...(linked !== null && { linkedWorkoutLogClientId: linked }),
        });
        updated++;
      }
    }

    return { inserted, updated };
  },
});

// User override for a wrong auto-match ("Show separately" on the merged
// history card): clears the link and pins the row so the matcher never
// re-links it. Re-linking manually is deferred (issue #117).
export const unlinkExternalWorkout = mutation({
  args: { healthKitUuid: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("externalWorkouts")
      .withIndex("by_user_uuid", (q) =>
        q.eq("userId", userId).eq("healthKitUuid", args.healthKitUuid)
      )
      .unique();
    if (!existing) return;

    await ctx.db.patch(existing._id, {
      linkedWorkoutLogClientId: undefined,
      linkDismissed: true,
    });
  },
});

// One-time backfill of linkedWorkoutLogClientId over a user's existing
// external workouts (issue #117). Idempotent: only unlinked, non-dismissed
// rows are considered, and re-running after completion is a no-op. Paged so
// a large history stays within mutation limits. Invoke from the CLI, looping
// until isDone:
//   npx convex run healthData:backfillWorkoutLinks '{"userId":"<users id>"}'
//   npx convex run healthData:backfillWorkoutLinks \
//     '{"userId":"<users id>","cursor":"<continueCursor>"}'
export const backfillWorkoutLinks = internalMutation({
  args: {
    userId: v.id("users"),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.min(Math.max(args.batchSize ?? 100, 1), 200);
    const page = await ctx.db
      .query("externalWorkouts")
      .withIndex("by_user_startedAt", (q) => q.eq("userId", args.userId))
      .paginate({ cursor: args.cursor ?? null, numItems });

    let linked = 0;
    for (const w of page.page) {
      if (w.linkedWorkoutLogClientId !== undefined) continue;
      if (w.linkDismissed === true) continue;
      const match = await findLinkedLogClientId(ctx, args.userId, w);
      if (match !== null) {
        await ctx.db.patch(w._id, { linkedWorkoutLogClientId: match });
        linked++;
      }
    }

    return {
      scanned: page.page.length,
      linked,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// One page of user ids, for the all-users backfill driver below.
export const usersPage = internalQuery({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("users")
      .paginate({ cursor: args.cursor ?? null, numItems: args.numItems });
    return {
      userIds: page.page.map((u) => u._id),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// All-users driver for backfillWorkoutLinks (issue #117): pages through the
// users table and drains the per-user backfill for each. Users without
// external workouts cost one empty page read, so it's safe to run over the
// whole user base. Idempotent for the same reason the per-user one is.
// Bounded to `usersPerRun` users per invocation to stay well inside action
// limits — loop from the CLI until isDone:
//   npx convex run healthData:backfillAllWorkoutLinks '{}' --prod
//   npx convex run healthData:backfillAllWorkoutLinks \
//     '{"usersCursor":"<continueCursor>"}' --prod
export const backfillAllWorkoutLinks = internalAction({
  args: {
    usersCursor: v.optional(v.string()),
    usersPerRun: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    usersProcessed: number;
    usersWithLinks: number;
    linked: number;
    isDone: boolean;
    continueCursor: string;
  }> => {
    const numItems = Math.min(Math.max(args.usersPerRun ?? 50, 1), 200);
    // Explicit annotation: same-module internal.* references otherwise make
    // the function's type circular (TS7022).
    const users: {
      userIds: Id<"users">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.healthData.usersPage, {
      cursor: args.usersCursor,
      numItems,
    });

    let usersWithLinks = 0;
    let linked = 0;
    for (const userId of users.userIds) {
      let cursor: string | undefined;
      let linkedForUser = 0;
      do {
        const result: {
          linked: number;
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runMutation(internal.healthData.backfillWorkoutLinks, {
          userId,
          cursor,
        });
        linkedForUser += result.linked;
        cursor = result.isDone ? undefined : result.continueCursor;
      } while (cursor !== undefined);
      if (linkedForUser > 0) usersWithLinks++;
      linked += linkedForUser;
    }

    return {
      usersProcessed: users.userIds.length,
      usersWithLinks,
      linked,
      isDone: users.isDone,
      continueCursor: users.continueCursor,
    };
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

// Bounds the payload of listDailyMetrics regardless of the requested range.
const MAX_METRICS_RANGE_DAYS = 400;

// Daily-metric history (body weight, sleep, RHR, HRV, steps, active energy)
// for the signed-in user, `from`..`to` half-open ("YYYY-MM-DD" local, both
// bounds copy the weeklyReview.ts `by_user_date` range pattern). `from` is
// clamped server-side so the range never exceeds MAX_METRICS_RANGE_DAYS,
// keeping the payload bounded even if the client asks for more.
//
// Not gated on health_data_personalization: that consent covers feeding
// imported health data into AI inference (see the comment on
// hasHealthPersonalizationConsent below). Showing the user their own
// imported data in-app is core functionality of the import toggle and is
// deliberately not gated there either — this query follows the same rule.
export const listDailyMetrics = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const toMs = Date.parse(`${args.to}T00:00:00Z`);
    const fromMs = Date.parse(`${args.from}T00:00:00Z`);
    const minFromMs = toMs - MAX_METRICS_RANGE_DAYS * 24 * 60 * 60 * 1000;
    const clampedFrom =
      Number.isFinite(toMs) && Number.isFinite(fromMs) && fromMs < minFromMs
        ? new Date(minFromMs).toISOString().slice(0, 10)
        : args.from;

    const rows = await ctx.db
      .query("healthDailyMetrics")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).gte("date", clampedFrom).lt("date", args.to)
      )
      .collect();

    return rows.map((d) => ({
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
    }));
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

  // A linked external workout is the same session as a native log (issue
  // #117) — the log already represents it in the coach's context, so only
  // unlinked rows count as separate external sessions.
  const unlinkedWorkouts = recentWorkouts.filter(
    (w) => w.linkedWorkoutLogClientId === undefined
  );

  const last = unlinkedWorkouts[0];

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
    externalWorkoutCount7d: unlinkedWorkouts.length,
    // Deduped activity types for the 7-day window (for AI coach context).
    activityTypes7d: [...new Set(unlinkedWorkouts.map((w) => w.activityType))],
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

// "Export my data" (issue #107) — read-only queries the client pages through
// to assemble a full JSON export of the authenticated user's data.
//
// Design: one paginated query per table page, assembled on-device. A single
// action returning everything would hit Convex per-transaction read limits
// (16,384 docs / 8 MiB scanned per query) and the 16 MiB function-result cap
// for heavy users; small pages keep every call comfortably inside both.
//
// Sanitization happens server-side (lib/data-export.ts) so Convex ids,
// ownership fields, and RevenueCat system fields never leave the server.
// Auth internals (sessions, refresh tokens, verification codes) and
// mealPhotos (transient storage pointers) are not exported at all.

import { getAuthUserId } from "@convex-dev/auth/server";
import type { PaginationResult } from "convex/server";
import { v } from "convex/values";
import {
  EXPORT_TABLES,
  sanitizeExportRow,
  sanitizeSubscriptionRow,
  type ExportRow,
} from "../lib/data-export";
import { query } from "./_generated/server";

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;

// Derived from the shared table list so client and server can't drift: a
// table added to EXPORT_TABLES without a switch branch below fails the
// exhaustiveness check at typecheck time.
const exportTableValidator = v.union(
  ...EXPORT_TABLES.map((table) => v.literal(table))
);

function toExportPage<T extends ExportRow>(result: PaginationResult<T>): {
  page: ExportRow[];
  isDone: boolean;
  continueCursor: string;
} {
  return {
    page: result.page.map(sanitizeExportRow),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected export table: ${String(value)}`);
}

// One page of one user-owned table, sanitized. The client loops
// `{ table, cursor }` until `isDone` for each table in EXPORT_TABLES.
export const exportPage = query({
  args: {
    table: exportTableValidator,
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const numItems = Math.min(
      Math.max(args.numItems ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const opts = { cursor: args.cursor, numItems };
    switch (args.table) {
      case "exercises":
        return toExportPage(
          await ctx.db
            .query("exercises")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "templates":
        return toExportPage(
          await ctx.db
            .query("templates")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "templateExercises":
        return toExportPage(
          await ctx.db
            .query("templateExercises")
            .withIndex("by_template", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "workoutLogs":
        return toExportPage(
          await ctx.db
            .query("workoutLogs")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "workoutLogExercises":
        return toExportPage(
          await ctx.db
            .query("workoutLogExercises")
            .withIndex("by_workout", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "workoutSets":
        return toExportPage(
          await ctx.db
            .query("workoutSets")
            .withIndex("by_workout_exercise", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "workoutPlans":
        return toExportPage(
          await ctx.db
            .query("workoutPlans")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "planDays":
        return toExportPage(
          await ctx.db
            .query("planDays")
            .withIndex("by_plan", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "recipes":
        return toExportPage(
          await ctx.db
            .query("recipes")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "ingredients":
        return toExportPage(
          await ctx.db
            .query("ingredients")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "mealLogs":
        return toExportPage(
          await ctx.db
            .query("mealLogs")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "chatConversations":
        return toExportPage(
          await ctx.db
            .query("chatConversations")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "chatMessages":
        return toExportPage(
          await ctx.db
            .query("chatMessages")
            .withIndex("by_conversation", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "externalWorkouts":
        return toExportPage(
          await ctx.db
            .query("externalWorkouts")
            .withIndex("by_user_uuid", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "healthDailyMetrics":
        return toExportPage(
          await ctx.db
            .query("healthDailyMetrics")
            .withIndex("by_user_date", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "weeklyReviews":
        return toExportPage(
          await ctx.db
            .query("weeklyReviews")
            .withIndex("by_user_week", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "userConsents":
        return toExportPage(
          await ctx.db
            .query("userConsents")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "onboardingAha":
        return toExportPage(
          await ctx.db
            .query("onboardingAha")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      case "aiSafetyIncidents":
        return toExportPage(
          await ctx.db
            .query("aiSafetyIncidents")
            .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
            .paginate(opts)
        );
      default:
        return assertNever(args.table);
    }
  },
});

// Single-row-per-user data for the `user` section of the export. The auth
// `users` doc is reduced to name/email/image; auth machinery is excluded.
// The subscription row is reduced to its user-meaningful fields.
export const exportUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const userDoc = await ctx.db.get(userId);
    const account = userDoc
      ? {
          name: userDoc.name ?? null,
          email: userDoc.email ?? null,
          image: userDoc.image ?? null,
          accountCreatedAt: new Date(userDoc._creationTime).toISOString(),
        }
      : null;

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const onboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const nutritionGoals = await ctx.db
      .query("nutritionGoals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const subscription = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      account,
      profile: profile ? sanitizeExportRow(profile) : null,
      settings: settings ? sanitizeExportRow(settings) : null,
      onboarding: onboarding ? sanitizeExportRow(onboarding) : null,
      nutritionGoals: nutritionGoals ? sanitizeExportRow(nutritionGoals) : null,
      subscription: sanitizeSubscriptionRow(subscription),
    };
  },
});

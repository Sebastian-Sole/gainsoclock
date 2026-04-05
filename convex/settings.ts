import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { weekStartDayValidator } from "./validators";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    weightUnit: v.union(v.literal("kg"), v.literal("lbs")),
    distanceUnit: v.union(v.literal("km"), v.literal("mi")),
    defaultRestTime: v.number(),
    hapticsEnabled: v.boolean(),
    weekStartDay: v.optional(weekStartDayValidator),
    prefillFromLastWorkout: v.optional(v.boolean()),
    notificationsRestTimerEnabled: v.optional(v.boolean()),
    notificationsPostWorkoutEnabled: v.optional(v.boolean()),
    notificationsPostWorkoutDelay: v.optional(v.number()),
    notificationsReminderEnabled: v.optional(v.boolean()),
    notificationsReminderTime: v.optional(v.string()),
    notificationsMorningPlanEnabled: v.optional(v.boolean()),
    notificationsMorningPlanTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("userSettings", { userId, ...args });
    }
  },
});

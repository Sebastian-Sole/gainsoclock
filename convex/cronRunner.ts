import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { reportServerError } from "./errorBoundary";

/**
 * Reporting boundary for cron jobs.
 *
 * Every cron target in `crons.ts` is an `internalMutation`, and a mutation
 * that throws rolls back its own error report (scheduling is transactional in
 * mutations). So on the Starter plan — without Convex's native Sentry
 * integration — a failing cron would vanish into the logs with no alert.
 *
 * This action wraps the mutation: it runs it, and on failure reports to Sentry
 * (via the scheduler, which survives the re-throw because ACTION scheduling is
 * not transactional) before re-throwing so Convex still records the failure.
 *
 * `crons.ts` targets `internal.cronRunner.run` with a `job` key instead of the
 * mutation directly. Adding a cron? Add the literal here AND in the switch.
 */

const jobValidator = v.union(
  v.literal("sendTrialReminders"),
  v.literal("sendDcsa6Month"),
  v.literal("sendGraceNudges"),
  v.literal("sendWinbacks"),
  v.literal("demoteExpiredTempGrants"),
  v.literal("sweepOrphanPhotos"),
  v.literal("enqueueWeeklyReviews"),
);

export const run = internalAction({
  args: { job: jobValidator },
  handler: async (ctx, { job }) => {
    try {
      switch (job) {
        case "sendTrialReminders":
          await ctx.runMutation(internal.subscriptionCrons.sendTrialReminders, {});
          break;
        case "sendDcsa6Month":
          await ctx.runMutation(internal.subscriptionCrons.sendDcsa6Month, {});
          break;
        case "sendGraceNudges":
          await ctx.runMutation(internal.subscriptionCrons.sendGraceNudges, {});
          break;
        case "sendWinbacks":
          await ctx.runMutation(internal.subscriptionCrons.sendWinbacks, {});
          break;
        case "demoteExpiredTempGrants":
          await ctx.runMutation(internal.subscriptionCrons.demoteExpiredTempGrants, {});
          break;
        case "sweepOrphanPhotos":
          await ctx.runMutation(internal.nutritionVision.sweepOrphanPhotos, {});
          break;
        case "enqueueWeeklyReviews":
          await ctx.runMutation(internal.weeklyReview.enqueueWeeklyReviews, {});
          break;
      }
    } catch (e) {
      await reportServerError(ctx, `cron.${job}`, e);
      throw e;
    }
  },
});

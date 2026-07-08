import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { legacyTypeToMetrics } from "./metricsMap";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Backfill `metrics` on exercises / templateExercises / workoutLogExercises from
 * the legacy `type`. Optional for correctness (reads fall back to
 * resolveExerciseMetrics client-side) but keeps server rows self-describing.
 *
 * Run from the Convex dashboard. Pass `logOnly: true` first to dry-run.
 */
export const migrateExerciseMetrics = internalMutation({
  args: { logOnly: v.boolean() },
  handler: async (ctx, args) => {
    let touched = 0;
    let skipped = 0;

    const exercises = await ctx.db.query("exercises").collect();
    for (const row of exercises) {
      if (row.metrics !== undefined) {
        skipped++;
        continue;
      }
      const metrics = legacyTypeToMetrics(row.type);
      if (metrics.length === 0) {
        skipped++;
        continue;
      }
      if (args.logOnly) {
        console.log(
          `[migrate metrics] exercises/${row.clientId} ${row.type} -> ${metrics.join(",")}`,
        );
      } else {
        await ctx.db.patch(row._id, { metrics });
      }
      touched++;
    }

    // Denormalized copies on the log/template join rows use their parent
    // exercise's type; look it up from the exercises already collected above
    // (one Map build instead of a per-row indexed query).
    const typeByUserClientId = new Map<string, string>();
    for (const ex of exercises) {
      typeByUserClientId.set(`${ex.userId}|${ex.clientId}`, ex.type);
    }

    const templateExercises = await ctx.db.query("templateExercises").collect();
    const logExercises = await ctx.db.query("workoutLogExercises").collect();

    for (const row of [...templateExercises, ...logExercises]) {
      if (row.metrics !== undefined) {
        skipped++;
        continue;
      }
      const type = typeByUserClientId.get(`${row.userId}|${row.exerciseClientId}`);
      const metrics = legacyTypeToMetrics(type ?? "");
      if (metrics.length === 0) {
        skipped++;
        continue;
      }
      if (args.logOnly) {
        console.log(
          `[migrate metrics] ${row.exerciseClientId} -> ${metrics.join(",")}`,
        );
      } else {
        await ctx.db.patch(row._id, { metrics });
      }
      touched++;
    }

    console.log(
      `[migrate metrics] done — touched=${touched} skipped=${skipped} dryRun=${args.logOnly}`,
    );
    return { touched, skipped, dryRun: args.logOnly };
  },
});

/**
 * One-shot migration to backfill the V2 state-machine columns on existing
 * userSubscriptions rows. Pre-V2 rows only have (isActive, expiresAt,
 * productId); we derive (status, source, trialExpiresAt, willAutoRenew).
 *
 * Run from the Convex dashboard. Pass `logOnly: true` first to dry-run;
 * inspect logs, then re-run with `logOnly: false` to commit the writes.
 */
export const migrateSubscriptionsV2 = internalMutation({
  args: { logOnly: v.boolean() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("userSubscriptions").collect();
    let touched = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (const row of rows) {
      if (row.status) {
        // Already migrated.
        skipped++;
        continue;
      }

      let nextStatus: "free" | "trial" | "pro";
      let nextSource: "rc_intro" | "rc_paid" | null;
      let trialExpiresAt: string | undefined;
      let willAutoRenew: boolean;

      if (!row.isActive) {
        nextStatus = "free";
        nextSource = null;
        willAutoRenew = false;
      } else {
        const isAnnual = row.productId?.includes("annual") ?? false;
        const expiresMs = row.expiresAt ? Date.parse(row.expiresAt) : NaN;
        const updatedMs = Date.parse(row.updatedAt);
        const inferTrial =
          isAnnual &&
          Number.isFinite(expiresMs) &&
          Number.isFinite(updatedMs) &&
          expiresMs - updatedMs <= SEVEN_DAYS_MS;
        if (inferTrial) {
          nextStatus = "trial";
          nextSource = "rc_intro";
          trialExpiresAt = row.expiresAt;
          willAutoRenew = true;
        } else {
          nextStatus = "pro";
          nextSource = "rc_paid";
          willAutoRenew = true;
        }
      }

      const log = {
        userId: row.userId,
        from: { isActive: row.isActive, productId: row.productId },
        to: { status: nextStatus, source: nextSource, trialExpiresAt },
      };

      if (args.logOnly) {
        console.log(`[migrate v2] would patch ${JSON.stringify(log)}`);
        touched++;
        continue;
      }

      await ctx.db.patch(row._id, {
        status: nextStatus,
        source: nextSource ?? undefined,
        trialExpiresAt,
        willAutoRenew,
        sourceHistory: [
          {
            source: nextSource ?? "migration",
            reason: "migrate_v2_backfill",
            grantedAt: nowIso,
          },
        ],
        emailOptOut: row.emailOptOut ?? false,
        updatedAt: nowIso,
      });
      console.log(`[migrate v2] patched ${JSON.stringify(log)}`);
      touched++;
    }

    console.log(
      `[migrate v2] done — touched=${touched} skipped=${skipped} dryRun=${args.logOnly}`,
    );
    return { touched, skipped, dryRun: args.logOnly };
  },
});

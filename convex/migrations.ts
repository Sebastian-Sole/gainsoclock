import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { legacyTypeToMetrics, type MetricId } from "./metricsMap";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rows read per batch. Each join row costs its own read plus (at most) one
 * indexed parent lookup, so the ceiling is 2x this — keep well under Convex's
 * 4096-reads-per-transaction limit.
 */
const DEFAULT_BATCH_SIZE = 500;

const batchArgs = {
  cursor: v.union(v.string(), v.null()),
  batchSize: v.number(),
  logOnly: v.boolean(),
};

const batchResult = v.object({
  cursor: v.union(v.string(), v.null()),
  isDone: v.boolean(),
  touched: v.number(),
  skipped: v.number(),
});

/**
 * Metrics for a join row, derived from its parent exercise. Prefers the
 * parent's own `metrics` (new-style rows whose `type` is "metrics" carry no
 * usable legacy type) and falls back to mapping the legacy `type`.
 *
 * `cache` dedupes lookups within one batch — workout logs reference the same
 * handful of exercises repeatedly, so this keeps reads far below the ceiling.
 */
async function metricsForParentExercise(
  ctx: MutationCtx,
  userId: Id<"users">,
  exerciseClientId: string,
  cache: Map<string, MetricId[]>,
): Promise<MetricId[]> {
  const key = `${userId}|${exerciseClientId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const parent = await ctx.db
    .query("exercises")
    .withIndex("by_user_clientId", (q) =>
      q.eq("userId", userId).eq("clientId", exerciseClientId),
    )
    .unique();

  const resolved =
    parent?.metrics ?? legacyTypeToMetrics(parent?.type ?? "");
  cache.set(key, resolved);
  return resolved;
}

/**
 * Backfill `metrics` on `exercises` from the legacy `type`, one page at a time.
 *
 * Idempotent: rows that already have `metrics` are skipped, so a failed or
 * partial run can simply be re-run. Driven by `runMigrateExerciseMetrics`.
 */
export const migrateExercisesBatch = internalMutation({
  args: batchArgs,
  returns: batchResult,
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("exercises")
      .paginate({ cursor: args.cursor, numItems: args.batchSize });

    let touched = 0;
    let skipped = 0;

    for (const row of page) {
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

    return { cursor: isDone ? null : continueCursor, isDone, touched, skipped };
  },
});

/** Backfill `metrics` on `templateExercises` from the parent exercise. */
export const migrateTemplateExercisesBatch = internalMutation({
  args: batchArgs,
  returns: batchResult,
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("templateExercises")
      .paginate({ cursor: args.cursor, numItems: args.batchSize });

    const cache = new Map<string, MetricId[]>();
    let touched = 0;
    let skipped = 0;

    for (const row of page) {
      if (row.metrics !== undefined) {
        skipped++;
        continue;
      }
      const metrics = await metricsForParentExercise(
        ctx,
        row.userId,
        row.exerciseClientId,
        cache,
      );
      if (metrics.length === 0) {
        skipped++;
        continue;
      }
      if (args.logOnly) {
        console.log(
          `[migrate metrics] templateExercises/${row.clientId} -> ${metrics.join(",")}`,
        );
      } else {
        await ctx.db.patch(row._id, { metrics });
      }
      touched++;
    }

    return { cursor: isDone ? null : continueCursor, isDone, touched, skipped };
  },
});

/** Backfill `metrics` on `workoutLogExercises` from the parent exercise. */
export const migrateWorkoutLogExercisesBatch = internalMutation({
  args: batchArgs,
  returns: batchResult,
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("workoutLogExercises")
      .paginate({ cursor: args.cursor, numItems: args.batchSize });

    const cache = new Map<string, MetricId[]>();
    let touched = 0;
    let skipped = 0;

    for (const row of page) {
      if (row.metrics !== undefined) {
        skipped++;
        continue;
      }
      const metrics = await metricsForParentExercise(
        ctx,
        row.userId,
        row.exerciseClientId,
        cache,
      );
      if (metrics.length === 0) {
        skipped++;
        continue;
      }
      if (args.logOnly) {
        console.log(
          `[migrate metrics] workoutLogExercises/${row.clientId} -> ${metrics.join(",")}`,
        );
      } else {
        await ctx.db.patch(row._id, { metrics });
      }
      touched++;
    }

    return { cursor: isDone ? null : continueCursor, isDone, touched, skipped };
  },
});

/**
 * Collapse legacy interval sets (paired 'work' + 'rest' rows) into single sets.
 * Driven by rest rows: each rest row's `time` moves onto its preceding work
 * sibling as `restTime`, the work row's `variant` is dropped, and the rest row
 * is deleted. Orphan rest rows (no work sibling) are deleted.
 *
 * Idempotent: once merged there are no rest rows left, so a re-run is a no-op.
 * Driven by `runMigrateIntervalSets`.
 */
export const migrateIntervalSetsBatch = internalMutation({
  args: batchArgs,
  returns: batchResult,
  handler: async (ctx, args) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("workoutSets")
      .paginate({ cursor: args.cursor, numItems: args.batchSize });

    let touched = 0;
    let skipped = 0;

    for (const rest of page) {
      if (rest.variant !== "rest") {
        skipped++;
        continue;
      }

      // The work sibling: same exercise, greatest order below this rest row.
      const siblings = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q
            .eq("userId", rest.userId)
            .eq("workoutLogExerciseClientId", rest.workoutLogExerciseClientId),
        )
        .collect();
      const work = siblings
        .filter((s) => s.variant !== "rest" && s.order < rest.order)
        .sort((a, b) => b.order - a.order)[0];

      if (args.logOnly) {
        console.log(
          `[migrate intervals] ${rest.clientId} rest=${rest.time ?? 0}s -> ${
            work ? work.clientId : "(orphan, delete)"
          }`,
        );
      } else {
        if (work) {
          await ctx.db.patch(work._id, { restTime: rest.time ?? 0, variant: undefined });
        }
        await ctx.db.delete(rest._id);
      }
      touched++;
    }

    return { cursor: isDone ? null : continueCursor, isDone, touched, skipped };
  },
});

/**
 * Driver: walks every page of all three tables, one transaction per batch.
 *
 * Backfilling `metrics` is optional for correctness — reads fall back to
 * resolveExerciseMetrics client-side — but rows must be self-describing before
 * the deprecated `type` column is dropped (docs/decisions/custom-exercise-metrics.md).
 *
 * Dry-run first, then commit:
 *   npx convex run --prod migrations:runMigrateExerciseMetrics '{"logOnly": true}'
 *   npx convex run --prod migrations:runMigrateExerciseMetrics '{"logOnly": false}'
 */
type BatchOutcome = {
  cursor: string | null;
  isDone: boolean;
  touched: number;
  skipped: number;
};

type BatchFn = FunctionReference<
  "mutation",
  "internal",
  { cursor: string | null; batchSize: number; logOnly: boolean },
  BatchOutcome
>;

/** Walk every page of one table, one transaction per batch. */
async function drainTable(
  ctx: ActionCtx,
  table: string,
  fn: BatchFn,
  batchSize: number,
  logOnly: boolean,
): Promise<{ touched: number; skipped: number }> {
  let cursor: string | null = null;
  let isDone = false;
  let touched = 0;
  let skipped = 0;
  let batches = 0;

  while (!isDone) {
    const result: BatchOutcome = await ctx.runMutation(fn, {
      cursor,
      batchSize,
      logOnly,
    });
    cursor = result.cursor;
    isDone = result.isDone;
    touched += result.touched;
    skipped += result.skipped;
    batches++;
  }

  console.log(
    `[migrate metrics] ${table} — batches=${batches} touched=${touched} skipped=${skipped}`,
  );
  return { touched, skipped };
}

type TableTotals = { touched: number; skipped: number };

export const runMigrateExerciseMetrics = internalAction({
  args: { logOnly: v.boolean(), batchSize: v.optional(v.number()) },
  // Explicit return type: this module imports `internal`, so without it the
  // handler's inferred type would cycle back through _generated/api.
  handler: async (
    ctx,
    args,
  ): Promise<{ dryRun: boolean; totals: Record<string, TableTotals> }> => {
    const size = args.batchSize ?? DEFAULT_BATCH_SIZE;
    const { logOnly } = args;

    // Exercises first so join rows can read a populated parent `metrics`.
    const totals: Record<string, TableTotals> = {
      exercises: await drainTable(
        ctx,
        "exercises",
        internal.migrations.migrateExercisesBatch,
        size,
        logOnly,
      ),
      templateExercises: await drainTable(
        ctx,
        "templateExercises",
        internal.migrations.migrateTemplateExercisesBatch,
        size,
        logOnly,
      ),
      workoutLogExercises: await drainTable(
        ctx,
        "workoutLogExercises",
        internal.migrations.migrateWorkoutLogExercisesBatch,
        size,
        logOnly,
      ),
    };

    console.log(
      `[migrate metrics] done — dryRun=${logOnly} ${JSON.stringify(totals)}`,
    );
    return { dryRun: logOnly, totals };
  },
});

/**
 * Driver: merge legacy interval work/rest pairs into single sets.
 *
 * Dry-run first, then commit:
 *   npx convex run --prod migrations:runMigrateIntervalSets '{"logOnly": true}'
 *   npx convex run --prod migrations:runMigrateIntervalSets '{"logOnly": false}'
 */
export const runMigrateIntervalSets = internalAction({
  args: { logOnly: v.boolean(), batchSize: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ dryRun: boolean; totals: TableTotals }> => {
    const size = args.batchSize ?? DEFAULT_BATCH_SIZE;
    const totals = await drainTable(
      ctx,
      "workoutSets",
      internal.migrations.migrateIntervalSetsBatch,
      size,
      args.logOnly,
    );
    console.log(
      `[migrate intervals] done — dryRun=${args.logOnly} ${JSON.stringify(totals)}`,
    );
    return { dryRun: args.logOnly, totals };
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

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { flatSetValidator } from "./validators";

const exercisePayload = v.object({
  clientId: v.string(),
  exerciseClientId: v.string(),
  order: v.number(),
  restTimeSeconds: v.number(),
  sets: v.array(flatSetValidator),
});

// Lightweight list: only workout metadata, no exercise/set joins.
// Full exercise/set data lives in the local Zustand store (synced via create mutation).
// This keeps the query fast and well within Convex read limits for any data size.
export const listMeta = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Full list with exercises and sets joined in.
// Used for hydration when local data is missing (e.g. after migration or new device).
export const listFull = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const logs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Build exercise name/type lookup
    const exerciseDefs = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const exerciseMap = new Map(
      exerciseDefs.map((e) => [e.clientId, { name: e.name, type: e.type }])
    );

    return await Promise.all(
      logs.map(async (log) => {
        const exercises = await ctx.db
          .query("workoutLogExercises")
          .withIndex("by_workout", (q) =>
            q.eq("userId", userId).eq("workoutLogClientId", log.clientId)
          )
          .collect();

        const exercisesWithSets = await Promise.all(
          exercises.map(async (ex) => {
            const sets = await ctx.db
              .query("workoutSets")
              .withIndex("by_workout_exercise", (q) =>
                q
                  .eq("userId", userId)
                  .eq("workoutLogExerciseClientId", ex.clientId)
              )
              .collect();

            const def = exerciseMap.get(ex.exerciseClientId);

            return {
              clientId: ex.clientId,
              exerciseClientId: ex.exerciseClientId,
              name: def?.name ?? "Unknown",
              type: def?.type ?? ("reps_weight" as const),
              order: ex.order,
              restTimeSeconds: ex.restTimeSeconds,
              sets: sets
                .sort((a, b) => a.order - b.order)
                .map((s) => ({
                  clientId: s.clientId,
                  completed: s.completed,
                  type: s.type,
                  ...(s.reps !== undefined && { reps: s.reps }),
                  ...(s.weight !== undefined && { weight: s.weight }),
                  ...(s.time !== undefined && { time: s.time }),
                  ...(s.distance !== undefined && { distance: s.distance }),
                })),
            };
          })
        );

        return {
          clientId: log.clientId,
          templateId: log.templateId,
          templateName: log.templateName,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          durationSeconds: log.durationSeconds,
          exercises: exercisesWithSets.sort((a, b) => a.order - b.order),
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    clientId: v.string(),
    templateId: v.optional(v.string()),
    templateName: v.string(),
    startedAt: v.string(),
    completedAt: v.string(),
    durationSeconds: v.number(),
    exercises: v.array(exercisePayload),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedup by clientId
    const existing = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    // Insert the workout log
    const logId = await ctx.db.insert("workoutLogs", {
      userId,
      clientId: args.clientId,
      templateId: args.templateId,
      templateName: args.templateName,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      durationSeconds: args.durationSeconds,
    });

    // Insert workoutLogExercises and workoutSets
    for (const ex of args.exercises) {
      await ctx.db.insert("workoutLogExercises", {
        userId,
        clientId: ex.clientId,
        workoutLogClientId: args.clientId,
        exerciseClientId: ex.exerciseClientId,
        order: ex.order,
        restTimeSeconds: ex.restTimeSeconds,
      });

      for (const s of ex.sets) {
        await ctx.db.insert("workoutSets", {
          userId,
          clientId: s.clientId,
          workoutLogExerciseClientId: ex.clientId,
          exerciseClientId: ex.exerciseClientId,
          order: s.order,
          completed: s.completed,
          type: s.type,
          ...(s.reps !== undefined && { reps: s.reps }),
          ...(s.weight !== undefined && { weight: s.weight }),
          ...(s.time !== undefined && { time: s.time }),
          ...(s.distance !== undefined && { distance: s.distance }),
        });
      }
    }

    return logId;
  },
});

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (log) {
      // Delete associated workoutLogExercises and workoutSets
      const exercises = await ctx.db
        .query("workoutLogExercises")
        .withIndex("by_workout", (q) =>
          q.eq("userId", userId).eq("workoutLogClientId", args.clientId)
        )
        .collect();

      for (const ex of exercises) {
        const sets = await ctx.db
          .query("workoutSets")
          .withIndex("by_workout_exercise", (q) =>
            q
              .eq("userId", userId)
              .eq("workoutLogExerciseClientId", ex.clientId)
          )
          .collect();
        for (const s of sets) {
          await ctx.db.delete(s._id);
        }
        await ctx.db.delete(ex._id);
      }

      await ctx.db.delete(log._id);
    }
  },
});

export const update = mutation({
  args: {
    clientId: v.string(),
    templateName: v.optional(v.string()),
    exercises: v.optional(v.array(exercisePayload)),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!log) return;

    // Patch metadata fields on the log document
    const { clientId: _, exercises, ...metadataUpdates } = args;
    await ctx.db.patch(log._id, metadataUpdates);

    // If exercises are provided, replace all exercises and sets
    if (exercises) {
      // Delete old exercises and their sets
      const oldExercises = await ctx.db
        .query("workoutLogExercises")
        .withIndex("by_workout", (q) =>
          q.eq("userId", userId).eq("workoutLogClientId", args.clientId)
        )
        .collect();

      for (const ex of oldExercises) {
        const oldSets = await ctx.db
          .query("workoutSets")
          .withIndex("by_workout_exercise", (q) =>
            q
              .eq("userId", userId)
              .eq("workoutLogExerciseClientId", ex.clientId)
          )
          .collect();
        for (const s of oldSets) {
          await ctx.db.delete(s._id);
        }
        await ctx.db.delete(ex._id);
      }

      // Insert new exercises and sets
      for (const ex of exercises) {
        await ctx.db.insert("workoutLogExercises", {
          userId,
          clientId: ex.clientId,
          workoutLogClientId: args.clientId,
          exerciseClientId: ex.exerciseClientId,
          order: ex.order,
          restTimeSeconds: ex.restTimeSeconds,
        });

        for (const s of ex.sets) {
          await ctx.db.insert("workoutSets", {
            userId,
            clientId: s.clientId,
            workoutLogExerciseClientId: ex.clientId,
            exerciseClientId: ex.exerciseClientId,
            order: s.order,
            completed: s.completed,
            type: s.type,
            ...(s.reps !== undefined && { reps: s.reps }),
            ...(s.weight !== undefined && { weight: s.weight }),
            ...(s.time !== undefined && { time: s.time }),
            ...(s.distance !== undefined && { distance: s.distance }),
          });
        }
      }
    }
  },
});

export const bulkUpsert = mutation({
  args: {
    logs: v.array(
      v.object({
        clientId: v.string(),
        templateId: v.optional(v.string()),
        templateName: v.string(),
        startedAt: v.string(),
        completedAt: v.string(),
        durationSeconds: v.number(),
        exercises: v.array(exercisePayload),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const allExisting = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingClientIds = new Set(allExisting.map((l) => l.clientId));

    for (const log of args.logs) {
      if (!existingClientIds.has(log.clientId)) {
        // Insert log
        await ctx.db.insert("workoutLogs", {
          userId,
          clientId: log.clientId,
          templateId: log.templateId,
          templateName: log.templateName,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          durationSeconds: log.durationSeconds,
        });

        // Insert exercises and sets
        for (const ex of log.exercises) {
          await ctx.db.insert("workoutLogExercises", {
            userId,
            clientId: ex.clientId,
            workoutLogClientId: log.clientId,
            exerciseClientId: ex.exerciseClientId,
            order: ex.order,
            restTimeSeconds: ex.restTimeSeconds,
          });

          for (const s of ex.sets) {
            await ctx.db.insert("workoutSets", {
              userId,
              clientId: s.clientId,
              workoutLogExerciseClientId: ex.clientId,
              exerciseClientId: ex.exerciseClientId,
              order: s.order,
              completed: s.completed,
              type: s.type,
              ...(s.reps !== undefined && { reps: s.reps }),
              ...(s.weight !== undefined && { weight: s.weight }),
              ...(s.time !== undefined && { time: s.time }),
              ...(s.distance !== undefined && { distance: s.distance }),
            });
          }
        }
      }
    }
  },
});

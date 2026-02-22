import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { exerciseTypeValidator } from "./validators";

const exercisePayload = v.object({
  clientId: v.string(),
  exerciseClientId: v.string(),
  exerciseName: v.string(),
  exerciseType: exerciseTypeValidator,
  order: v.number(),
  restTimeSeconds: v.number(),
  defaultSetsCount: v.number(),
  suggestedReps: v.optional(v.number()),
  suggestedWeight: v.optional(v.number()),
  suggestedTime: v.optional(v.number()),
  suggestedDistance: v.optional(v.number()),
});

export const listWithExercises = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const templates = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Fetch all exercises for lookups
    const allExercises = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const exerciseMap = new Map(
      allExercises.map((e) => [e.clientId, e])
    );

    const result = [];
    for (const template of templates) {
      const templateExercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) =>
          q.eq("userId", userId).eq("templateClientId", template.clientId)
        )
        .collect();

      templateExercises.sort((a, b) => a.order - b.order);

      result.push({
        ...template,
        exercises: templateExercises.map((te) => {
          const exercise = exerciseMap.get(te.exerciseClientId);
          return {
            id: te.clientId,
            exerciseId: te.exerciseClientId,
            name: exercise?.name ?? "Unknown",
            type: exercise?.type ?? ("reps_weight" as const),
            order: te.order,
            restTimeSeconds: te.restTimeSeconds,
            defaultSetsCount: te.defaultSetsCount,
            suggestedReps: te.suggestedReps,
            suggestedWeight: te.suggestedWeight,
            suggestedTime: te.suggestedTime,
            suggestedDistance: te.suggestedDistance,
          };
        }),
      });
    }

    return result;
  },
});

export const create = mutation({
  args: {
    clientId: v.string(),
    name: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    exercises: v.array(exercisePayload),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Dedup template by clientId
    const existing = await ctx.db
      .query("templates")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (existing) return existing._id;

    // Upsert referenced exercises into the exercises table
    for (const ex of args.exercises) {
      const existingExercise = await ctx.db
        .query("exercises")
        .withIndex("by_user_clientId", (q) =>
          q.eq("userId", userId).eq("clientId", ex.exerciseClientId)
        )
        .unique();
      if (!existingExercise) {
        await ctx.db.insert("exercises", {
          userId,
          clientId: ex.exerciseClientId,
          name: ex.exerciseName,
          type: ex.exerciseType,
          createdAt: args.createdAt,
        });
      }
    }

    // Insert the template
    const templateId = await ctx.db.insert("templates", {
      userId,
      clientId: args.clientId,
      name: args.name,
      notes: args.notes,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    });

    // Insert templateExercises
    for (const ex of args.exercises) {
      await ctx.db.insert("templateExercises", {
        userId,
        clientId: ex.clientId,
        templateClientId: args.clientId,
        exerciseClientId: ex.exerciseClientId,
        order: ex.order,
        restTimeSeconds: ex.restTimeSeconds,
        defaultSetsCount: ex.defaultSetsCount,
        suggestedReps: ex.suggestedReps,
        suggestedWeight: ex.suggestedWeight,
        suggestedTime: ex.suggestedTime,
        suggestedDistance: ex.suggestedDistance,
      });
    }

    return templateId;
  },
});

export const updateByClientId = mutation({
  args: {
    clientId: v.string(),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    updatedAt: v.string(),
    exercises: v.optional(v.array(exercisePayload)),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const template = await ctx.db
      .query("templates")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();
    if (!template) return;

    // Update template fields
    const updates: Record<string, unknown> = { updatedAt: args.updatedAt };
    if (args.name !== undefined) updates.name = args.name;
    if (args.notes !== undefined) updates.notes = args.notes;
    await ctx.db.patch(template._id, updates);

    // Replace templateExercises if provided
    if (args.exercises !== undefined) {
      // Delete old templateExercises
      const oldExercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) =>
          q.eq("userId", userId).eq("templateClientId", args.clientId)
        )
        .collect();
      for (const old of oldExercises) {
        await ctx.db.delete(old._id);
      }

      // Upsert exercises and insert new templateExercises
      for (const ex of args.exercises) {
        const existingExercise = await ctx.db
          .query("exercises")
          .withIndex("by_user_clientId", (q) =>
            q.eq("userId", userId).eq("clientId", ex.exerciseClientId)
          )
          .unique();
        if (!existingExercise) {
          await ctx.db.insert("exercises", {
            userId,
            clientId: ex.exerciseClientId,
            name: ex.exerciseName,
            type: ex.exerciseType,
            createdAt: args.updatedAt,
          });
        }

        await ctx.db.insert("templateExercises", {
          userId,
          clientId: ex.clientId,
          templateClientId: args.clientId,
          exerciseClientId: ex.exerciseClientId,
          order: ex.order,
          restTimeSeconds: ex.restTimeSeconds,
          defaultSetsCount: ex.defaultSetsCount,
          suggestedReps: ex.suggestedReps,
          suggestedWeight: ex.suggestedWeight,
          suggestedTime: ex.suggestedTime,
          suggestedDistance: ex.suggestedDistance,
        });
      }
    }
  },
});

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const template = await ctx.db
      .query("templates")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId)
      )
      .unique();

    if (template) {
      // Delete associated templateExercises
      const exercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) =>
          q.eq("userId", userId).eq("templateClientId", args.clientId)
        )
        .collect();
      for (const ex of exercises) {
        await ctx.db.delete(ex._id);
      }

      await ctx.db.delete(template._id);
    }
  },
});

export const bulkUpsert = mutation({
  args: {
    templates: v.array(
      v.object({
        clientId: v.string(),
        name: v.string(),
        notes: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
        exercises: v.array(exercisePayload),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const allExisting = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingClientIds = new Set(allExisting.map((t) => t.clientId));

    for (const t of args.templates) {
      if (!existingClientIds.has(t.clientId)) {
        // Upsert exercises
        for (const ex of t.exercises) {
          const existingExercise = await ctx.db
            .query("exercises")
            .withIndex("by_user_clientId", (q) =>
              q.eq("userId", userId).eq("clientId", ex.exerciseClientId)
            )
            .unique();
          if (!existingExercise) {
            await ctx.db.insert("exercises", {
              userId,
              clientId: ex.exerciseClientId,
              name: ex.exerciseName,
              type: ex.exerciseType,
              createdAt: t.createdAt,
            });
          }
        }

        // Insert template
        await ctx.db.insert("templates", {
          userId,
          clientId: t.clientId,
          name: t.name,
          notes: t.notes,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        });

        // Insert templateExercises
        for (const ex of t.exercises) {
          await ctx.db.insert("templateExercises", {
            userId,
            clientId: ex.clientId,
            templateClientId: t.clientId,
            exerciseClientId: ex.exerciseClientId,
            order: ex.order,
            restTimeSeconds: ex.restTimeSeconds,
            defaultSetsCount: ex.defaultSetsCount,
            suggestedReps: ex.suggestedReps,
            suggestedWeight: ex.suggestedWeight,
            suggestedTime: ex.suggestedTime,
            suggestedDistance: ex.suggestedDistance,
          });
        }
      }
    }
  },
});

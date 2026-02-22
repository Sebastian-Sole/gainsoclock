import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Public mutation called by the client when user approves an AI action.
 * Parses the payload and dispatches to the appropriate creation function.
 */
export const executeApproval = mutation({
  args: {
    type: v.string(),
    payload: v.string(), // JSON string
    conversationClientId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const data = JSON.parse(args.payload);
    const now = new Date().toISOString();

    if (args.type === "create_template") {
      // Create a single template
      const templateClientId = generateId();
      const exercises = (data.exercises ?? []).map(
        (ex: { name: string; type: string; defaultSetsCount: number; restTimeSeconds: number; suggestedReps?: number; suggestedWeight?: number; suggestedTime?: number; suggestedDistance?: number }, i: number) => {
          const exerciseClientId = generateId();
          return { ...ex, exerciseClientId, clientId: generateId(), order: i };
        }
      );

      // Upsert exercises
      for (const ex of exercises) {
        const existing = await ctx.db
          .query("exercises")
          .withIndex("by_user_name", (q) =>
            q.eq("userId", userId).eq("name", ex.name)
          )
          .unique();

        if (!existing) {
          await ctx.db.insert("exercises", {
            userId,
            clientId: ex.exerciseClientId,
            name: ex.name,
            type: ex.type,
            createdAt: now,
          });
        } else {
          ex.exerciseClientId = existing.clientId;
        }
      }

      // Create template
      await ctx.db.insert("templates", {
        userId,
        clientId: templateClientId,
        name: data.name,
        notes: data.notes,
        createdAt: now,
        updatedAt: now,
      });

      for (const ex of exercises) {
        await ctx.db.insert("templateExercises", {
          userId,
          clientId: ex.clientId,
          templateClientId,
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
    } else if (args.type === "create_plan") {
      // Create templates first
      const templateNameToClientId = new Map<string, string>();

      for (const template of data.templates ?? []) {
        const templateClientId = generateId();
        templateNameToClientId.set(template.name, templateClientId);

        const exercises = (template.exercises ?? []).map(
          (ex: { name: string; type: string; defaultSetsCount: number; restTimeSeconds: number; suggestedReps?: number; suggestedWeight?: number; suggestedTime?: number; suggestedDistance?: number }, i: number) => {
            const exerciseClientId = generateId();
            return { ...ex, exerciseClientId, clientId: generateId(), order: i };
          }
        );

        // Upsert exercises
        for (const ex of exercises) {
          const existing = await ctx.db
            .query("exercises")
            .withIndex("by_user_name", (q) =>
              q.eq("userId", userId).eq("name", ex.name)
            )
            .unique();

          if (!existing) {
            await ctx.db.insert("exercises", {
              userId,
              clientId: ex.exerciseClientId,
              name: ex.name,
              type: ex.type,
              createdAt: now,
            });
          } else {
            ex.exerciseClientId = existing.clientId;
          }
        }

        await ctx.db.insert("templates", {
          userId,
          clientId: templateClientId,
          name: template.name,
          notes: template.notes,
          createdAt: now,
          updatedAt: now,
        });

        for (const ex of exercises) {
          await ctx.db.insert("templateExercises", {
            userId,
            clientId: ex.clientId,
            templateClientId,
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

      // Create the plan
      const planClientId = generateId();
      await ctx.db.insert("workoutPlans", {
        userId,
        clientId: planClientId,
        name: data.name,
        description: data.description ?? "",
        goal: data.goal,
        durationWeeks: data.durationWeeks,
        startDate: data.startDate ?? now.split("T")[0],
        status: "active",
        sourceConversationClientId: args.conversationClientId,
        createdAt: now,
        updatedAt: now,
      });

      // Create plan days
      for (const day of data.days ?? []) {
        const templateClientId = day.templateName
          ? templateNameToClientId.get(day.templateName)
          : undefined;

        await ctx.db.insert("planDays", {
          userId,
          planClientId,
          week: day.week,
          dayOfWeek: day.dayOfWeek,
          templateClientId,
          label: day.label ?? day.templateName,
          notes: day.notes,
          status: day.templateName ? "pending" : "rest",
        });
      }
    } else if (args.type === "update_plan") {
      const { planClientId, updates } = data;

      // Find the plan
      const plan = await ctx.db
        .query("workoutPlans")
        .withIndex("by_user_clientId", (q) =>
          q.eq("userId", userId).eq("clientId", planClientId)
        )
        .unique();

      if (!plan) throw new Error("Plan not found");

      // Update plan metadata
      const planPatch: Record<string, string> = { updatedAt: now };
      if (updates.name) planPatch.name = updates.name;
      if (updates.description) planPatch.description = updates.description;
      await ctx.db.patch(plan._id, planPatch);

      // Pre-load all user templates for name resolution
      const allTemplates = await ctx.db
        .query("templates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const templatesByName = new Map(allTemplates.map((t) => [t.name, t.clientId]));

      // Create new templates if provided
      for (const template of updates.newTemplates ?? []) {
        const templateClientId = generateId();
        templatesByName.set(template.name, templateClientId);

        const exercises = (template.exercises ?? []).map(
          (ex: { name: string; type: string; defaultSetsCount: number; restTimeSeconds: number }, i: number) => {
            const exerciseClientId = generateId();
            return { ...ex, exerciseClientId, clientId: generateId(), order: i };
          }
        );

        for (const ex of exercises) {
          const existing = await ctx.db
            .query("exercises")
            .withIndex("by_user_name", (q) =>
              q.eq("userId", userId).eq("name", ex.name)
            )
            .unique();

          if (!existing) {
            await ctx.db.insert("exercises", {
              userId,
              clientId: ex.exerciseClientId,
              name: ex.name,
              type: ex.type,
              createdAt: now,
            });
          } else {
            ex.exerciseClientId = existing.clientId;
          }
        }

        await ctx.db.insert("templates", {
          userId,
          clientId: templateClientId,
          name: template.name,
          createdAt: now,
          updatedAt: now,
        });

        for (const ex of exercises) {
          await ctx.db.insert("templateExercises", {
            userId,
            clientId: ex.clientId,
            templateClientId,
            exerciseClientId: ex.exerciseClientId,
            order: ex.order,
            restTimeSeconds: ex.restTimeSeconds,
            defaultSetsCount: ex.defaultSetsCount,
          });
        }
      }

      // Load existing plan days
      const existingDays = await ctx.db
        .query("planDays")
        .withIndex("by_plan", (q) =>
          q.eq("userId", userId).eq("planClientId", planClientId)
        )
        .collect();

      // Update plan days
      for (const dayUpdate of updates.daysToUpdate ?? []) {
        const existingDay = existingDays.find(
          (d: { week: number; dayOfWeek: number }) =>
            d.week === dayUpdate.week && d.dayOfWeek === dayUpdate.dayOfWeek
        );

        if (dayUpdate.remove && existingDay) {
          await ctx.db.delete(existingDay._id);
        } else if (existingDay) {
          const patch: Record<string, string | undefined> = {};

          if (dayUpdate.templateName) {
            const resolvedId = templatesByName.get(dayUpdate.templateName);
            if (resolvedId) patch.templateClientId = resolvedId;
            patch.status = "pending";
          }
          if (dayUpdate.label) patch.label = dayUpdate.label;
          if (dayUpdate.notes !== undefined) patch.notes = dayUpdate.notes;

          if (Object.keys(patch).length > 0) {
            await ctx.db.patch(existingDay._id, patch);
          }
        } else {
          // Create new day
          const templateClientId = dayUpdate.templateName
            ? templatesByName.get(dayUpdate.templateName)
            : undefined;

          await ctx.db.insert("planDays", {
            userId,
            planClientId,
            week: dayUpdate.week,
            dayOfWeek: dayUpdate.dayOfWeek,
            templateClientId,
            label: dayUpdate.label ?? dayUpdate.templateName,
            notes: dayUpdate.notes,
            status: dayUpdate.templateName ? "pending" : "rest",
          });
        }
      }
    } else if (args.type === "create_recipe") {
      const recipeClientId = generateId();
      await ctx.db.insert("recipes", {
        userId,
        clientId: recipeClientId,
        title: data.title,
        description: data.description ?? "",
        ingredients: data.ingredients ?? [],
        instructions: data.instructions ?? [],
        prepTimeMinutes: data.prepTimeMinutes,
        cookTimeMinutes: data.cookTimeMinutes,
        servings: data.servings,
        macros: data.macros,
        tags: data.tags,
        sourceConversationClientId: args.conversationClientId,
        saved: true,
        createdAt: now,
      });
    }
  },
});

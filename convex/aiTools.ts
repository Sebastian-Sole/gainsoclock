import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

function generateId(): string {
  return crypto.randomUUID();
}

// --- Payload validation helpers (no external dependencies) ---

const VALID_EXERCISE_TYPES = [
  "reps_weight",
  "reps_time",
  "time_only",
  "time_distance",
  "reps_only",
] as const;

type ExerciseType = (typeof VALID_EXERCISE_TYPES)[number];

function assertString(val: unknown, field: string): asserts val is string {
  if (typeof val !== "string" || val.length === 0) {
    throw new Error(`Invalid payload: "${field}" must be a non-empty string.`);
  }
}

function assertNumber(val: unknown, field: string): asserts val is number {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error(`Invalid payload: "${field}" must be a finite number.`);
  }
}

function assertOptionalString(val: unknown, field: string): void {
  if (val !== undefined && val !== null && typeof val !== "string") {
    throw new Error(`Invalid payload: "${field}" must be a string if provided.`);
  }
}

function assertOptionalNumber(val: unknown, field: string): void {
  if (val !== undefined && val !== null) {
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new Error(
        `Invalid payload: "${field}" must be a finite number if provided.`
      );
    }
  }
}

function assertArray(val: unknown, field: string): asserts val is unknown[] {
  if (!Array.isArray(val)) {
    throw new Error(`Invalid payload: "${field}" must be an array.`);
  }
}

function assertExerciseType(
  val: unknown,
  field: string
): asserts val is (typeof VALID_EXERCISE_TYPES)[number] {
  if (
    typeof val !== "string" ||
    !(VALID_EXERCISE_TYPES as readonly string[]).includes(val)
  ) {
    throw new Error(
      `Invalid payload: "${field}" must be one of: ${VALID_EXERCISE_TYPES.join(", ")}.`
    );
  }
}

/** Validate a single exercise object from the AI payload. */
function validateExercise(
  ex: Record<string, unknown>,
  index: number,
  context: string
): void {
  const prefix = `${context}exercises[${index}]`;
  assertString(ex.name, `${prefix}.name`);
  assertExerciseType(ex.type, `${prefix}.type`);
  assertNumber(ex.defaultSetsCount, `${prefix}.defaultSetsCount`);
  assertNumber(ex.restTimeSeconds, `${prefix}.restTimeSeconds`);
  assertOptionalNumber(ex.suggestedReps, `${prefix}.suggestedReps`);
  assertOptionalNumber(ex.suggestedWeight, `${prefix}.suggestedWeight`);
  assertOptionalNumber(ex.suggestedTime, `${prefix}.suggestedTime`);
  assertOptionalNumber(ex.suggestedDistance, `${prefix}.suggestedDistance`);
}

/** Validate a template payload (used by create_template and inside create_plan). */
function validateTemplatePayload(
  data: Record<string, unknown>,
  context = ""
): void {
  assertString(data.name, `${context}name`);
  assertOptionalString(data.notes, `${context}notes`);
  const exercises = data.exercises ?? [];
  assertArray(exercises, `${context}exercises`);
  (exercises as Record<string, unknown>[]).forEach((ex, i) =>
    validateExercise(ex, i, context)
  );
}

/** Validate the full create_plan payload. */
function validateCreatePlanPayload(data: Record<string, unknown>): void {
  assertString(data.name, "name");
  // description is optional — falls back to ""
  assertOptionalString(data.description, "description");
  assertOptionalString(data.goal, "goal");
  assertNumber(data.durationWeeks, "durationWeeks");
  assertOptionalString(data.startDate, "startDate");

  const templates = data.templates ?? [];
  assertArray(templates, "templates");
  (templates as Record<string, unknown>[]).forEach((t, i) =>
    validateTemplatePayload(t, `templates[${i}].`)
  );

  const days = data.days ?? [];
  assertArray(days, "days");
  (days as Record<string, unknown>[]).forEach((day, i) => {
    assertNumber(day.week, `days[${i}].week`);
    assertNumber(day.dayOfWeek, `days[${i}].dayOfWeek`);
    assertOptionalString(day.templateName, `days[${i}].templateName`);
    assertOptionalString(day.label, `days[${i}].label`);
    assertOptionalString(day.notes, `days[${i}].notes`);
  });
}

/** Validate the update_plan payload. */
function validateUpdatePlanPayload(data: Record<string, unknown>): void {
  assertString(data.planClientId, "planClientId");

  if (data.updates === undefined || data.updates === null || typeof data.updates !== "object") {
    throw new Error('Invalid payload: "updates" must be an object.');
  }
  const updates = data.updates as Record<string, unknown>;

  assertOptionalString(updates.name, "updates.name");
  assertOptionalString(updates.description, "updates.description");

  const newTemplates = updates.newTemplates ?? [];
  assertArray(newTemplates, "updates.newTemplates");
  (newTemplates as Record<string, unknown>[]).forEach((t, i) =>
    validateTemplatePayload(t, `updates.newTemplates[${i}].`)
  );

  const daysToUpdate = updates.daysToUpdate ?? [];
  assertArray(daysToUpdate, "updates.daysToUpdate");
  (daysToUpdate as Record<string, unknown>[]).forEach((day, i) => {
    assertNumber(day.week, `updates.daysToUpdate[${i}].week`);
    assertNumber(day.dayOfWeek, `updates.daysToUpdate[${i}].dayOfWeek`);
    assertOptionalString(
      day.templateName,
      `updates.daysToUpdate[${i}].templateName`
    );
    assertOptionalString(day.label, `updates.daysToUpdate[${i}].label`);
    assertOptionalString(day.notes, `updates.daysToUpdate[${i}].notes`);
  });
}

/** Validate a macros object. */
function validateMacros(
  macros: unknown,
  field: string
): void {
  if (macros === undefined || macros === null) return;
  if (typeof macros !== "object" || Array.isArray(macros)) {
    throw new Error(`Invalid payload: "${field}" must be an object.`);
  }
  const m = macros as Record<string, unknown>;
  assertNumber(m.calories, `${field}.calories`);
  assertNumber(m.protein, `${field}.protein`);
  assertNumber(m.carbs, `${field}.carbs`);
  assertNumber(m.fat, `${field}.fat`);
}

/** Validate a single ingredient. */
function validateIngredient(
  ing: unknown,
  index: number
): void {
  if (typeof ing !== "object" || ing === null || Array.isArray(ing)) {
    throw new Error(`Invalid payload: "ingredients[${index}]" must be an object.`);
  }
  const obj = ing as Record<string, unknown>;
  assertString(obj.name, `ingredients[${index}].name`);
  assertString(obj.amount, `ingredients[${index}].amount`);
  assertOptionalString(obj.unit, `ingredients[${index}].unit`);
  validateMacros(obj.macros, `ingredients[${index}].macros`);
}

/** Validate the create_recipe payload. */
function validateCreateRecipePayload(data: Record<string, unknown>): void {
  assertString(data.title, "title");
  assertOptionalString(data.description, "description");

  const ingredients = data.ingredients ?? [];
  assertArray(ingredients, "ingredients");
  (ingredients as unknown[]).forEach((ing, i) => validateIngredient(ing, i));

  const instructions = data.instructions ?? [];
  assertArray(instructions, "instructions");
  (instructions as unknown[]).forEach((inst, i) => {
    if (typeof inst !== "string") {
      throw new Error(
        `Invalid payload: "instructions[${i}]" must be a string.`
      );
    }
  });

  assertOptionalNumber(data.prepTimeMinutes, "prepTimeMinutes");
  assertOptionalNumber(data.cookTimeMinutes, "cookTimeMinutes");
  assertOptionalNumber(data.servings, "servings");
  validateMacros(data.macros, "macros");

  if (data.tags !== undefined && data.tags !== null) {
    assertArray(data.tags, "tags");
    (data.tags as unknown[]).forEach((tag, i) => {
      if (typeof tag !== "string") {
        throw new Error(`Invalid payload: "tags[${i}]" must be a string.`);
      }
    });
  }
}

interface ExercisePayload {
  name: string;
  type: ExerciseType;
  defaultSetsCount: number;
  restTimeSeconds: number;
  suggestedReps?: number;
  suggestedWeight?: number;
  suggestedTime?: number;
  suggestedDistance?: number;
}

// --- End validation helpers ---

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

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(args.payload);
    } catch {
      throw new Error("Invalid payload: malformed JSON.");
    }

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Invalid payload: expected a JSON object.");
    }

    const now = new Date().toISOString();

    if (args.type === "create_template") {
      // Validate
      validateTemplatePayload(data);

      // Create a single template
      const templateClientId = generateId();
      const exercises = (data.exercises as ExercisePayload[] ?? []).map(
        (ex, i) => {
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
        name: data.name as string,
        notes: data.notes as string | undefined,
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
      // Validate
      validateCreatePlanPayload(data);

      // Create templates first
      const templateNameToClientId = new Map<string, string>();

      for (const template of (data.templates as Record<string, unknown>[]) ?? []) {
        const templateClientId = generateId();
        templateNameToClientId.set(template.name as string, templateClientId);

        const exercises = ((template.exercises as ExercisePayload[]) ?? []).map(
          (ex, i) => {
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
          name: template.name as string,
          notes: template.notes as string | undefined,
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
        name: data.name as string,
        description: (data.description as string) ?? "",
        goal: data.goal as string | undefined,
        durationWeeks: data.durationWeeks as number,
        startDate: (data.startDate as string) ?? now.split("T")[0],
        status: "active",
        sourceConversationClientId: args.conversationClientId,
        createdAt: now,
        updatedAt: now,
      });

      // Create plan days
      for (const day of (data.days as Record<string, unknown>[]) ?? []) {
        const templateClientId = day.templateName
          ? templateNameToClientId.get(day.templateName as string)
          : undefined;

        await ctx.db.insert("planDays", {
          userId,
          planClientId,
          week: day.week as number,
          dayOfWeek: day.dayOfWeek as number,
          templateClientId,
          label: (day.label as string) ?? (day.templateName as string),
          notes: day.notes as string | undefined,
          status: day.templateName ? "pending" : "rest",
        });
      }
    } else if (args.type === "update_plan") {
      // Validate
      validateUpdatePlanPayload(data);

      const planClientId = data.planClientId as string;
      const updates = data.updates as Record<string, unknown>;

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
      if (updates.name) planPatch.name = updates.name as string;
      if (updates.description) planPatch.description = updates.description as string;
      await ctx.db.patch(plan._id, planPatch);

      // Pre-load all user templates for name resolution
      const allTemplates = await ctx.db
        .query("templates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const templatesByName = new Map(allTemplates.map((t) => [t.name, t.clientId]));

      // Create new templates if provided
      for (const template of (updates.newTemplates as Record<string, unknown>[]) ?? []) {
        const templateClientId = generateId();
        templatesByName.set(template.name as string, templateClientId);

        const exercises = ((template.exercises as ExercisePayload[]) ?? []).map(
          (ex, i) => {
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
          name: template.name as string,
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
      for (const dayUpdate of (updates.daysToUpdate as Record<string, unknown>[]) ?? []) {
        const existingDay = existingDays.find(
          (d: { week: number; dayOfWeek: number }) =>
            d.week === (dayUpdate.week as number) && d.dayOfWeek === (dayUpdate.dayOfWeek as number)
        );

        if (dayUpdate.remove && existingDay) {
          await ctx.db.delete(existingDay._id);
        } else if (existingDay) {
          const patch: Record<string, string | undefined> = {};

          if (dayUpdate.templateName) {
            const resolvedId = templatesByName.get(dayUpdate.templateName as string);
            if (resolvedId) patch.templateClientId = resolvedId;
            patch.status = "pending";
          }
          if (dayUpdate.label) patch.label = dayUpdate.label as string;
          if (dayUpdate.notes !== undefined) patch.notes = dayUpdate.notes as string | undefined;

          if (Object.keys(patch).length > 0) {
            await ctx.db.patch(existingDay._id, patch);
          }
        } else {
          // Create new day
          const templateClientId = dayUpdate.templateName
            ? templatesByName.get(dayUpdate.templateName as string)
            : undefined;

          await ctx.db.insert("planDays", {
            userId,
            planClientId,
            week: dayUpdate.week as number,
            dayOfWeek: dayUpdate.dayOfWeek as number,
            templateClientId,
            label: (dayUpdate.label as string) ?? (dayUpdate.templateName as string),
            notes: dayUpdate.notes as string | undefined,
            status: dayUpdate.templateName ? "pending" : "rest",
          });
        }
      }
    } else if (args.type === "create_recipe") {
      // Validate
      validateCreateRecipePayload(data);

      const recipeClientId = generateId();
      await ctx.db.insert("recipes", {
        userId,
        clientId: recipeClientId,
        title: data.title as string,
        description: (data.description as string) ?? "",
        ingredients: (data.ingredients as Array<{ name: string; amount: string; unit?: string; macros?: { calories: number; protein: number; carbs: number; fat: number } }>) ?? [],
        instructions: (data.instructions as string[]) ?? [],
        prepTimeMinutes: data.prepTimeMinutes as number | undefined,
        cookTimeMinutes: data.cookTimeMinutes as number | undefined,
        servings: data.servings as number | undefined,
        macros: data.macros as { calories: number; protein: number; carbs: number; fat: number } | undefined,
        tags: data.tags as string[] | undefined,
        sourceConversationClientId: args.conversationClientId,
        saved: true,
        createdAt: now,
      });
    }
  },
});

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
): TemplatePayload {
  assertString(data.name, `${context}name`);
  assertOptionalString(data.notes, `${context}notes`);
  const exercises = data.exercises ?? [];
  assertArray(exercises, `${context}exercises`);
  (exercises as Record<string, unknown>[]).forEach((ex, i) =>
    validateExercise(ex, i, context)
  );
  return {
    name: data.name as string,
    notes: data.notes as string | undefined,
    exercises: exercises as ExercisePayload[],
  };
}

/** Validate the full create_plan payload. */
function validateCreatePlanPayload(data: Record<string, unknown>): CreatePlanPayload {
  assertString(data.name, "name");
  // description is optional — falls back to ""
  assertOptionalString(data.description, "description");
  assertOptionalString(data.goal, "goal");
  assertNumber(data.durationWeeks, "durationWeeks");
  assertOptionalString(data.startDate, "startDate");

  const rawTemplates = data.templates ?? [];
  assertArray(rawTemplates, "templates");
  const templates = (rawTemplates as Record<string, unknown>[]).map((t, i) =>
    validateTemplatePayload(t, `templates[${i}].`)
  );

  const rawDays = data.days ?? [];
  assertArray(rawDays, "days");
  const days = (rawDays as Record<string, unknown>[]).map((day, i) => {
    assertNumber(day.week, `days[${i}].week`);
    assertNumber(day.dayOfWeek, `days[${i}].dayOfWeek`);
    assertOptionalString(day.templateName, `days[${i}].templateName`);
    assertOptionalString(day.label, `days[${i}].label`);
    assertOptionalString(day.notes, `days[${i}].notes`);
    return {
      week: day.week as number,
      dayOfWeek: day.dayOfWeek as number,
      templateName: day.templateName as string | undefined,
      label: day.label as string | undefined,
      notes: day.notes as string | undefined,
    };
  });

  return {
    name: data.name as string,
    description: data.description as string | undefined,
    goal: data.goal as string | undefined,
    durationWeeks: data.durationWeeks as number,
    startDate: data.startDate as string | undefined,
    templates,
    days,
  };
}

/** Validate the update_plan payload. */
function validateUpdatePlanPayload(data: Record<string, unknown>): UpdatePlanPayload {
  assertString(data.planClientId, "planClientId");

  if (data.updates === undefined || data.updates === null || typeof data.updates !== "object") {
    throw new Error('Invalid payload: "updates" must be an object.');
  }
  const rawUpdates = data.updates as Record<string, unknown>;

  assertOptionalString(rawUpdates.name, "updates.name");
  assertOptionalString(rawUpdates.description, "updates.description");

  const rawNewTemplates = rawUpdates.newTemplates ?? [];
  assertArray(rawNewTemplates, "updates.newTemplates");
  const newTemplates = (rawNewTemplates as Record<string, unknown>[]).map((t, i) =>
    validateTemplatePayload(t, `updates.newTemplates[${i}].`)
  );

  const rawDaysToUpdate = rawUpdates.daysToUpdate ?? [];
  assertArray(rawDaysToUpdate, "updates.daysToUpdate");
  const daysToUpdate = (rawDaysToUpdate as Record<string, unknown>[]).map((day, i) => {
    assertNumber(day.week, `updates.daysToUpdate[${i}].week`);
    assertNumber(day.dayOfWeek, `updates.daysToUpdate[${i}].dayOfWeek`);
    assertOptionalString(
      day.templateName,
      `updates.daysToUpdate[${i}].templateName`
    );
    assertOptionalString(day.label, `updates.daysToUpdate[${i}].label`);
    assertOptionalString(day.notes, `updates.daysToUpdate[${i}].notes`);
    return {
      week: day.week as number,
      dayOfWeek: day.dayOfWeek as number,
      templateName: day.templateName as string | undefined,
      label: day.label as string | undefined,
      notes: day.notes as string | undefined,
      remove: day.remove === true ? true : undefined,
    };
  });

  return {
    planClientId: data.planClientId as string,
    updates: {
      name: rawUpdates.name as string | undefined,
      description: rawUpdates.description as string | undefined,
      newTemplates,
      daysToUpdate,
    },
  };
}

/** Validate a macros object. */
function validateMacros(
  macros: unknown,
  field: string
): MacrosPayload | undefined {
  if (macros === undefined || macros === null) return undefined;
  if (typeof macros !== "object" || Array.isArray(macros)) {
    throw new Error(`Invalid payload: "${field}" must be an object.`);
  }
  const m = macros as Record<string, unknown>;
  assertNumber(m.calories, `${field}.calories`);
  assertNumber(m.protein, `${field}.protein`);
  assertNumber(m.carbs, `${field}.carbs`);
  assertNumber(m.fat, `${field}.fat`);
  return {
    calories: m.calories as number,
    protein: m.protein as number,
    carbs: m.carbs as number,
    fat: m.fat as number,
  };
}

/** Validate a single ingredient. */
function validateIngredient(
  ing: unknown,
  index: number
): IngredientPayload {
  if (typeof ing !== "object" || ing === null || Array.isArray(ing)) {
    throw new Error(`Invalid payload: "ingredients[${index}]" must be an object.`);
  }
  const obj = ing as Record<string, unknown>;
  assertString(obj.name, `ingredients[${index}].name`);
  assertString(obj.amount, `ingredients[${index}].amount`);
  assertOptionalString(obj.unit, `ingredients[${index}].unit`);
  const macros = validateMacros(obj.macros, `ingredients[${index}].macros`);
  return {
    name: obj.name as string,
    amount: obj.amount as string,
    unit: obj.unit as string | undefined,
    macros,
  };
}

/** Validate the create_recipe payload. */
function validateCreateRecipePayload(data: Record<string, unknown>): CreateRecipePayload {
  assertString(data.title, "title");
  assertOptionalString(data.description, "description");

  const rawIngredients = data.ingredients ?? [];
  assertArray(rawIngredients, "ingredients");
  const ingredients = (rawIngredients as unknown[]).map((ing, i) => validateIngredient(ing, i));

  const rawInstructions = data.instructions ?? [];
  assertArray(rawInstructions, "instructions");
  const instructions = (rawInstructions as unknown[]).map((inst, i) => {
    if (typeof inst !== "string") {
      throw new Error(
        `Invalid payload: "instructions[${i}]" must be a string.`
      );
    }
    return inst;
  });

  assertOptionalNumber(data.prepTimeMinutes, "prepTimeMinutes");
  assertOptionalNumber(data.cookTimeMinutes, "cookTimeMinutes");
  assertOptionalNumber(data.servings, "servings");
  const macros = validateMacros(data.macros, "macros");

  let tags: string[] | undefined;
  if (data.tags !== undefined && data.tags !== null) {
    assertArray(data.tags, "tags");
    tags = (data.tags as unknown[]).map((tag, i) => {
      if (typeof tag !== "string") {
        throw new Error(`Invalid payload: "tags[${i}]" must be a string.`);
      }
      return tag;
    });
  }

  return {
    title: data.title as string,
    description: data.description as string | undefined,
    ingredients,
    instructions,
    prepTimeMinutes: data.prepTimeMinutes as number | undefined,
    cookTimeMinutes: data.cookTimeMinutes as number | undefined,
    servings: data.servings as number | undefined,
    macros,
    tags,
  };
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

interface TemplatePayload {
  name: string;
  notes?: string;
  exercises: ExercisePayload[];
}

interface PlanDayPayload {
  week: number;
  dayOfWeek: number;
  templateName?: string;
  label?: string;
  notes?: string;
}

interface CreatePlanPayload {
  name: string;
  description?: string;
  goal?: string;
  durationWeeks: number;
  startDate?: string;
  templates: TemplatePayload[];
  days: PlanDayPayload[];
}

interface DayUpdatePayload extends PlanDayPayload {
  remove?: boolean;
}

interface UpdatePlanPayload {
  planClientId: string;
  updates: {
    name?: string;
    description?: string;
    newTemplates: TemplatePayload[];
    daysToUpdate: DayUpdatePayload[];
  };
}

interface MacrosPayload {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface IngredientPayload {
  name: string;
  amount: string;
  unit?: string;
  macros?: MacrosPayload;
}

interface CreateRecipePayload {
  title: string;
  description?: string;
  ingredients: IngredientPayload[];
  instructions: string[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  macros?: MacrosPayload;
  tags?: string[];
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
      const tpl = validateTemplatePayload(data);

      // Create a single template
      const templateClientId = generateId();
      const exercises = tpl.exercises.map(
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
        name: tpl.name,
        notes: tpl.notes,
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
      const planData = validateCreatePlanPayload(data);

      // Create templates first
      const templateNameToClientId = new Map<string, string>();

      for (const template of planData.templates) {
        const templateClientId = generateId();
        templateNameToClientId.set(template.name, templateClientId);

        const exercises = template.exercises.map(
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
        name: planData.name,
        description: planData.description ?? "",
        goal: planData.goal,
        durationWeeks: planData.durationWeeks,
        startDate: planData.startDate ?? now.split("T")[0],
        status: "active",
        sourceConversationClientId: args.conversationClientId,
        createdAt: now,
        updatedAt: now,
      });

      // Create plan days
      for (const day of planData.days) {
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
      // Validate
      const updateData = validateUpdatePlanPayload(data);
      const { updates } = updateData;

      // Find the plan
      const plan = await ctx.db
        .query("workoutPlans")
        .withIndex("by_user_clientId", (q) =>
          q.eq("userId", userId).eq("clientId", updateData.planClientId)
        )
        .unique();

      if (!plan) throw new Error("Plan not found");

      // Update plan metadata
      const planPatch: Record<string, string> = { updatedAt: now };
      if (updates.name !== undefined) planPatch.name = updates.name;
      if (updates.description !== undefined) planPatch.description = updates.description;
      await ctx.db.patch(plan._id, planPatch);

      // Pre-load all user templates for name resolution
      const allTemplates = await ctx.db
        .query("templates")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const templatesByName = new Map(allTemplates.map((t) => [t.name, t.clientId]));

      // Create new templates if provided
      for (const template of updates.newTemplates) {
        const templateClientId = generateId();
        templatesByName.set(template.name, templateClientId);

        const exercises = template.exercises.map(
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
          q.eq("userId", userId).eq("planClientId", updateData.planClientId)
        )
        .collect();

      // Update plan days
      for (const dayUpdate of updates.daysToUpdate) {
        const existingDay = existingDays.find(
          (d) => d.week === dayUpdate.week && d.dayOfWeek === dayUpdate.dayOfWeek
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
            planClientId: updateData.planClientId,
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
      // Validate
      const recipe = validateCreateRecipePayload(data);

      const recipeClientId = generateId();
      await ctx.db.insert("recipes", {
        userId,
        clientId: recipeClientId,
        title: recipe.title,
        description: recipe.description ?? "",
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        servings: recipe.servings,
        macros: recipe.macros,
        tags: recipe.tags,
        sourceConversationClientId: args.conversationClientId,
        saved: true,
        createdAt: now,
      });
    }
  },
});

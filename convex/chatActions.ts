"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { OPENAI_CHAT_MODEL } from "./openaiConfig";
import { METRIC_IDS } from "./metricsMap";

// ── Helpers ────────────────────────────────────────────────────

/**
 * Remove JSON blobs that the model sometimes echoes as plain text
 * alongside tool calls. Keeps any natural-language text before/after.
 */
function stripInlineJson(text: string): string {
  // Remove fenced JSON code blocks
  let cleaned = text.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, "");

  // Remove bare top-level JSON objects (heuristic: starts with { on its own line
  // and contains known tool-call keys like "title", "name", "exercises", "ingredients")
  cleaned = cleaned.replace(
    /^\s*\{[\s\S]*?\}\s*$/gm,
    (match) => {
      // Only strip if it looks like a tool call payload
      if (
        /"(?:title|name|exercises|ingredients|instructions|macros)"/.test(match)
      ) {
        return "";
      }
      return match;
    }
  );

  return cleaned.trim();
}

/**
 * Chat history sent to OpenAI carries only message text — the tool calls
 * behind approval cards are never replayed. Without a marker the model has
 * no memory that it already proposed (or saved) a plan, which is the root
 * cause of duplicate create_workout_plan proposals on follow-up questions
 * (issue #102). Returns a compact bracketed note describing the proposal
 * and its outcome, appended to the assistant message content.
 */
function approvalMarker(approval: {
  type: string;
  payload: string;
  status: string;
}): string {
  const TYPE_LABELS: Record<string, string> = {
    create_plan: "a new workout plan",
    update_plan: "an update to the user's existing workout plan",
    create_template: "a workout template",
    create_recipe: "a recipe",
    log_meal: "a meal log entry",
    set_nutrition_goals: "new nutrition goals",
  };
  const label = TYPE_LABELS[approval.type] ?? "an action";

  let name = "";
  try {
    const parsed: unknown = JSON.parse(approval.payload);
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const candidate = obj.name ?? obj.title;
      if (typeof candidate === "string" && candidate.length > 0) {
        name = ` "${candidate}"`;
      }
    }
  } catch {
    // Marker still communicates type + status without the name.
  }

  const outcome =
    approval.status === "approved"
      ? "the user approved it and it was saved"
      : approval.status === "rejected"
        ? "the user rejected it"
        : "it is still awaiting the user's approval";

  return `\n\n[Tool proposal: you proposed ${label}${name} via a tool call — ${outcome}.]`;
}

// Number of trailing (user+assistant) messages sent to OpenAI per request.
// Keeps prompts well under the model context limit while preserving
// session-scale memory; long-term memory lives in the user-context block,
// not raw chat scrollback. Tune later with plan 029's size/cost data.
const OPENAI_HISTORY_WINDOW = 30;

// ── Tool Definitions ───────────────────────────────────────────

// Shared shape of one exercise inside a template payload. Metric-aware: the
// model composes `metrics` from the palette (max 5) and sets type "metrics".
// Legacy `type` values and "intervals" remain accepted for back-compat.
const AI_EXERCISE_ITEM = {
  type: "object",
  properties: {
    name: { type: "string", description: "Exercise name" },
    metrics: {
      type: "array",
      items: { type: "string", enum: METRIC_IDS },
      description:
        'Ordered metrics this exercise tracks (max 5), composed from the palette. Examples: strength ["weight","reps"]; bodyweight ["reps"]; running/rowing ["duration","distance","pace","heart_rate_avg"]; cycling ["duration","distance","speed","heart_rate_avg"]; watts bike ["duration","power_avg","distance","heart_rate_avg"]; timed hold ["duration"]. Required: must be non-empty for every non-interval exercise and match the movement (a run must NOT get ["weight","reps"]). For "intervals" exercises pass an empty array.',
    },
    type: {
      type: "string",
      enum: [
        "reps_weight",
        "reps_time",
        "time_only",
        "time_distance",
        "reps_only",
        "intervals",
        "metrics",
      ],
      description:
        'Use "metrics" for normal exercises (and provide the `metrics` array). Use "intervals" only for work/rest interval exercises. Legacy types are still accepted.',
    },
    defaultSetsCount: { type: "number", description: "Number of sets" },
    restTimeSeconds: {
      type: "number",
      description: "Rest between sets in seconds",
    },
    suggestedReps: {
      type: "number",
      description: "Suggested reps per set based on user history and goals",
    },
    suggestedWeight: {
      type: "number",
      description:
        "Suggested weight per set in the user's preferred unit, based on history",
    },
    suggestedTime: {
      type: "number",
      description:
        "Suggested time in seconds per set (duration-based exercises)",
    },
    suggestedDistance: {
      type: "number",
      description: "Suggested distance per set (distance-based exercises)",
    },
  },
  required: ["name", "metrics", "defaultSetsCount", "restTimeSeconds"],
} as const;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_workout_template",
      description:
        "Create a new workout template with exercises. Returns the template for user approval before saving.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Template name, e.g. 'Push Day A'",
          },
          notes: {
            type: "string",
            description:
              "Workout notes describing goals, intensity guidelines, target muscle groups, and exercise-specific context (e.g., pace zones for running, RPE targets)",
          },
          exercises: {
            type: "array",
            items: AI_EXERCISE_ITEM,
          },
        },
        required: ["name", "exercises"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_workout_plan",
      description:
        "Create a brand-new multi-week workout plan with scheduled workouts. Only for when the user wants a NEW plan — never for modifying a plan that already exists (use update_workout_plan for that). Call this at most ONCE per response. Include the templates array with full exercise details for each unique workout type.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          goal: { type: "string" },
          durationWeeks: { type: "number" },
          startDate: {
            type: "string",
            description: "ISO date (YYYY-MM-DD) for plan start",
          },
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                week: { type: "number", description: "1-indexed week number" },
                dayOfWeek: {
                  type: "number",
                  description: "0=Sun, 1=Mon, ..., 6=Sat",
                },
                templateName: {
                  type: "string",
                  description: "Name of the workout template for this day",
                },
                label: {
                  type: "string",
                  description: "Display label for the day",
                },
                notes: { type: "string" },
              },
              required: ["week", "dayOfWeek"],
            },
          },
          templates: {
            type: "array",
            description: "Workout templates to create as part of the plan",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                notes: {
                  type: "string",
                  description:
                    "Workout notes describing goals, intensity, and exercise context",
                },
                exercises: {
                  type: "array",
                  items: AI_EXERCISE_ITEM,
                },
              },
              required: ["name", "exercises"],
            },
          },
        },
        required: ["name", "description", "durationWeeks", "days", "templates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_workout_plan",
      description:
        "Update the user's existing workout plan in place — modify or remove days, swap templates, rename, or add new templates. Use this whenever the user asks to change, tweak, extend, or fix a plan that already exists (its Plan ID is in the Active Plan section of the system prompt). This edits the existing plan; it never creates a second one.",
      parameters: {
        type: "object",
        properties: {
          planClientId: {
            type: "string",
            description: "The clientId of the plan to update",
          },
          updates: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              daysToUpdate: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    week: { type: "number" },
                    dayOfWeek: { type: "number" },
                    templateName: { type: "string" },
                    label: { type: "string" },
                    notes: { type: "string" },
                    remove: { type: "boolean" },
                  },
                  required: ["week", "dayOfWeek"],
                },
              },
              newTemplates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    exercises: {
                      type: "array",
                      items: AI_EXERCISE_ITEM,
                    },
                  },
                  required: ["name", "exercises"],
                },
              },
            },
          },
        },
        required: ["planClientId", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_recipe",
      description:
        "Suggest a meal or recipe based on user goals, preferences, and macro targets.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                amount: { type: "string" },
                unit: { type: "string" },
              },
              required: ["name", "amount"],
            },
          },
          instructions: { type: "array", items: { type: "string" } },
          prepTimeMinutes: { type: "number" },
          cookTimeMinutes: { type: "number" },
          servings: { type: "number" },
          macros: {
            type: "object",
            properties: {
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" },
            },
            required: ["calories", "protein", "carbs", "fat"],
          },
          tags: { type: "array", items: { type: "string" } },
        },
        required: [
          "title",
          "description",
          "ingredients",
          "instructions",
          "macros",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_meal",
      description:
        "Log a meal the user already ate, with AI-estimated macros. Use when the user describes food they consumed (e.g. 'I had a chicken burrito and a coke'). Returns the meal for user approval before saving to their nutrition log.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Short meal name, e.g. 'Chicken burrito + Coke'",
          },
          date: {
            type: "string",
            description:
              "ISO date (YYYY-MM-DD) the meal was eaten. Omit for today.",
          },
          macros: {
            type: "object",
            description:
              "Estimated totals for the whole described meal (calories in kcal, protein/carbs/fat in grams)",
            properties: {
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" },
            },
            required: ["calories", "protein", "carbs", "fat"],
          },
          portionDescription: {
            type: "string",
            description:
              "The portion assumption behind the estimate, e.g. 'large burrito (~350g) + 330ml regular coke'",
          },
          notes: { type: "string" },
        },
        required: ["title", "macros"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_nutrition_goals",
      description:
        "Set the user's daily nutrition goals (calories and macro grams). Use when the user asks you to set/update their targets (e.g. 'set my protein goal to 180g', 'my daily target is 2200 calories'). Returns the new goals for user approval before saving.",
      parameters: {
        type: "object",
        properties: {
          calories: { type: "number", description: "Daily calorie target in kcal." },
          protein: { type: "number", description: "Daily protein target in grams." },
          carbs: { type: "number", description: "Daily carbohydrate target in grams." },
          fat: { type: "number", description: "Daily fat target in grams." },
        },
        required: ["calories", "protein", "carbs", "fat"],
      },
    },
  },
];

// ── System Prompt Builder ──────────────────────────────────────

interface UserContext {
  settings: {
    weightUnit: string;
    distanceUnit: string;
    defaultRestTime: number;
  };
  exercises: { name: string; type: string }[];
  exercisesTotal: number;
  templates: {
    clientId: string;
    name: string;
    exercises: {
      name: string;
      type: string;
      defaultSetsCount: number;
      restTimeSeconds: number;
    }[];
  }[];
  recentLogs: {
    date: string;
    templateName: string;
    durationMinutes: number;
  }[];
  exerciseHistory: {
    name: string;
    type: string;
    lastUsed: string;
    recentSets: { reps?: number; weight?: number; time?: number; distance?: number }[];
  }[];
  stats: {
    totalWorkouts: number;
    workoutsPerWeek: number;
    currentStreak: number;
  };
  activePlan: {
    clientId: string;
    name: string;
    goal?: string;
    durationWeeks: number;
    startDate: string;
    currentWeek: number;
    completedDays: number;
    totalDays: number;
    days: {
      week: number;
      dayOfWeek: number;
      templateName?: string;
      label?: string;
      status: string;
    }[];
  } | null;
}

interface HealthContext {
  dailyMetrics: {
    date: string;
    asleepSeconds?: number;
    restingHeartRateBpm?: number;
    hrvMs?: number;
    steps?: number;
    bodyMassKg?: number;
    activeEnergyKcal?: number;
  }[];
  externalWorkoutCount7d: number;
  activityTypes7d: string[];
  lastExternalWorkout: {
    activityType: string;
    sourceName: string;
    startedAt: number;
  } | null;
}

/**
 * Builds the "Recent health & recovery" prompt section from Apple Health
 * data. Returns "" when no data exists so the section is omitted entirely
 * (the model must never see fabricated recovery data). `health` is null
 * when the user has not granted health_data_personalization — the section
 * is omitted the same way.
 */
function buildHealthSection(health: HealthContext | null): string {
  if (!health) return "";
  const lines: string[] = [];

  // dailyMetrics is ordered date desc, so find() returns the latest value.
  const sleepValues = health.dailyMetrics
    .map((d) => d.asleepSeconds)
    .filter((s): s is number => s !== undefined);
  if (sleepValues.length > 0) {
    const avgHours =
      sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length / 3600;
    lines.push(
      `- Average sleep (last 7 days): ${avgHours.toFixed(1)}h/night (${sleepValues.length} night${sleepValues.length === 1 ? "" : "s"} tracked)`
    );
  }

  const latestRhr = health.dailyMetrics.find(
    (d) => d.restingHeartRateBpm !== undefined
  )?.restingHeartRateBpm;
  if (latestRhr !== undefined) {
    lines.push(`- Latest resting heart rate: ${Math.round(latestRhr)} bpm`);
  }

  const hrvValues = health.dailyMetrics
    .map((d) => d.hrvMs)
    .filter((h): h is number => h !== undefined);
  const latestHrv = hrvValues[0];
  if (latestHrv !== undefined && hrvValues.length > 0) {
    const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
    const trend =
      latestHrv > avgHrv * 1.05
        ? "above"
        : latestHrv < avgHrv * 0.95
          ? "below"
          : "near";
    lines.push(
      `- HRV: latest ${Math.round(latestHrv)}ms — ${trend} 7-day average (${Math.round(avgHrv)}ms)`
    );
  }

  if (health.externalWorkoutCount7d > 0) {
    lines.push(
      `- External workouts this week: ${health.externalWorkoutCount7d} (${health.activityTypes7d.join(", ")})`
    );
    if (health.lastExternalWorkout) {
      const w = health.lastExternalWorkout;
      const date = new Date(w.startedAt).toISOString().split("T")[0];
      lines.push(`- Most recent: ${w.activityType} via ${w.sourceName} on ${date}`);
    }
  }

  if (lines.length === 0) return "";

  return `\n## Recent Health & Recovery (from Apple Health)\n${lines.join("\n")}\n`;
}

function buildSystemPrompt(
  context: UserContext,
  health: HealthContext | null
): string {
  const exerciseList =
    context.exercises.length > 0
      ? context.exercises.map((e) => `- ${e.name} (${e.type})`).join("\n") +
        (context.exercisesTotal > context.exercises.length
          ? `\n- …and ${context.exercisesTotal - context.exercises.length} more (older)`
          : "")
      : "No exercises yet.";

  const templateList =
    context.templates.length > 0
      ? context.templates
          .map(
            (t) =>
              `- "${t.name}": ${t.exercises.map((e) => e.name).join(", ")}`,
          )
          .join("\n")
      : "No templates yet.";

  const recentActivity =
    context.recentLogs.length > 0
      ? context.recentLogs
          .map(
            (l) => `- ${l.date}: "${l.templateName}" (${l.durationMinutes}min)`,
          )
          .join("\n")
      : "No recent workouts.";

  const exerciseHistorySection =
    context.exerciseHistory.length > 0
      ? context.exerciseHistory
          .map((eh) => {
            const setsStr = eh.recentSets
              .map((s) => {
                if (s.reps !== undefined && s.weight !== undefined)
                  return `${s.weight}${context.settings.weightUnit}×${s.reps}`;
                if (s.reps !== undefined) return `${s.reps} reps`;
                if (s.time !== undefined && s.distance !== undefined)
                  return `${s.distance}${context.settings.distanceUnit} in ${s.time}s`;
                if (s.time !== undefined) return `${s.time}s`;
                return "—";
              })
              .join(", ");
            return `- ${eh.name} (${eh.type}): last used ${eh.lastUsed} — ${setsStr}`;
          })
          .join("\n")
      : "No exercise history yet.";

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const planSection = context.activePlan
    ? (() => {
        const p = context.activePlan!;
        let section = `Active plan: "${p.name}" (Plan ID: ${p.clientId})\n`;
        section += `Goal: ${p.goal ?? "N/A"} | Duration: ${p.durationWeeks} weeks | Start: ${p.startDate}\n`;
        section += `Progress: Week ${p.currentWeek}/${p.durationWeeks}, ${p.completedDays}/${p.totalDays} workout days completed\n`;
        section += "Schedule:\n";

        for (let w = 1; w <= p.durationWeeks; w++) {
          const weekDays = p.days
            .filter((d) => d.week === w)
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
          if (weekDays.length === 0) {
            section += `  Week ${w}: rest week\n`;
          } else {
            const dayStrs = weekDays
              .map(
                (d) =>
                  `${DAY_NAMES[d.dayOfWeek]}=${d.templateName ?? d.label ?? "?"} (${d.status})`,
              )
              .join(", ");
            section += `  Week ${w}: ${dayStrs}\n`;
          }
        }
        return section;
      })()
    : "No active plan.";

  return `You are a personalized fitness coach assistant in a workout tracking app. You help users with workout planning, exercise advice, and meal suggestions. You have full access to the user's fitness data.

## User Profile
- Weight unit: ${context.settings.weightUnit}
- Distance unit: ${context.settings.distanceUnit}
- Default rest time: ${context.settings.defaultRestTime}s

## Exercise Library (${context.exercisesTotal} exercises)
${exerciseList}

## Workout Templates (${context.templates.length} templates)
${templateList}

## Recent Activity (last 14 days)
${recentActivity}

## Exercise Performance History (most recent session per exercise)
${exerciseHistorySection}

## Stats
- Total workouts: ${context.stats.totalWorkouts}
- Workouts per week (30-day avg): ${context.stats.workoutsPerWeek}
- Current streak: ${context.stats.currentStreak} days
${buildHealthSection(health)}
## Active Plan
${planSection}

## Important Rules
- CRITICAL: Before responding, assess the COMPLEXITY of the user's request:
  * SIMPLE requests (e.g., "make a PB&J recipe", "give me a bicep curl exercise", "create a quick stretch routine") — Just do it. These have obvious, well-known answers. Do NOT ask clarifying questions. Produce the result immediately using the appropriate tool.
  * COMPLEX requests (e.g., "create a 12-week training program", "design a meal plan for cutting", "build a PPL split for my goals") — These require personalization. Ask 2-3 targeted clarifying questions BEFORE generating anything. Ask about relevant factors like: experience level, available equipment, training frequency, specific goals, injury history, time constraints, or dietary restrictions. It is far better to ask a few questions and create something perfect than to guess and produce something generic.
  * When in doubt, lean toward just answering. Only ask questions when the request genuinely benefits from personalization AND the answer would meaningfully change based on the user's response. You can always infer reasonable defaults from the user's exercise history and stats above.
- When creating templates, plans, or recipes, ALWAYS use the tool functions. Do NOT just describe them in text.
- When the user describes food they ALREADY ATE ("I had...", "I ate...", "just finished a..."), use the log_meal tool — not suggest_recipe. suggest_recipe is only for proposing meals the user might cook/eat in the future.
- For log_meal: estimate macros conservatively from typical portion sizes and state your portion assumption in portionDescription. Make exactly ONE log_meal call per distinct meal (combine items eaten together, e.g. a burrito and a coke at lunch, into one call; separate meals like "breakfast and lunch" get one call each). Only ask about portion size when it genuinely changes the estimate AND the description is truly ambiguous — otherwise assume a standard portion and log it.
- When the user asks you to set or update their daily nutrition/macro targets (e.g. "set my protein to 180g", "aim for 2200 calories a day"), use the set_nutrition_goals tool with all four fields (calories, protein, carbs, fat). If they only mention one or two values, infer the rest using a reasonable split (e.g. keep their implied ratio, or default to ~30/40/30 protein/carbs/fat) rather than asking — state your assumption in your text response before the tool call.
- IMPORTANT: Before calling any tool function, you MUST first write a brief explanation in your text response. Explain what you're creating and why — e.g. the reasoning behind exercise selection, set/rep schemes, plan structure, or recipe choices. This gives the user context before they see the approval card. Keep it concise (2-4 sentences).
- When creating templates, include suggested values matching each exercise's metrics — suggestedReps/suggestedWeight for strength, suggestedTime/suggestedDistance for cardio. Base these on the user's exercise performance history above. If no history exists, use sensible defaults for the movement and apparent experience level.
- When creating a workout plan, use create_workout_plan and include ALL necessary templates in the templates array.
- You can create multiple templates at once by making multiple create_workout_template tool calls in a single response. Each will appear as a separate approval card for the user.
- Always include notes for each template describing the workout's purpose, target muscle groups, intensity level, and any specific guidance (e.g., pace zones for running, RPE targets, rest guidance).
- For running/cardio plans, create distinct exercises for each run type (Easy Run, Tempo Run, Long Run, Intervals, etc.). Compose their metrics from the palette — e.g. runs ["duration","distance","pace","heart_rate_avg"], a watts-bike session ["duration","power_avg","distance","heart_rate_avg"] — and reserve "intervals" for true work/rest exercises. Use the template notes to describe pace zones, heart rate targets, and workout intent.
- When creating a workout plan, always set startDate to the nearest upcoming Monday (or Sunday for sunday-start users) from the current date, unless the user specifies a different start date. The startDate is the first day of Week 1.
- Prefer exercises from the user's existing library when possible. Match names exactly.
- All data you create will require user approval before being saved. The user can reject and ask for changes.
- Use the user's preferred units (${context.settings.weightUnit}, ${context.settings.distanceUnit}).
- Be concise but helpful. Focus on actionable advice.
- Every exercise you create should set type "metrics" and list the metrics it tracks (compose from weight, reps, duration, distance, pace, speed, power_avg, heart_rate_avg, cadence, calories; max 5). Reserve "intervals" for work/rest interval exercises.
- For workout plans, use dayOfWeek values: 0=Sunday, 1=Monday, ..., 6=Saturday.
- For rest days in plans, omit the templateName field.
- When the user asks to modify their existing plan, use the update_workout_plan tool with the plan's Plan ID (shown above in the Active Plan section). Reference existing template names exactly as they appear in the schedule. Only include newTemplates if you need to add workout types that don't already exist.
- When a user says "my plan", "the plan", or similar, they mean the active plan. Use its Plan ID for updates.
- NEVER create a new plan when the user is asking to modify an existing one. Use update_workout_plan instead.
- The user has at most ONE plan under discussion at a time. If you already proposed a plan earlier in this conversation (see the [Tool proposal: ...] markers in the history), follow-up questions and change requests refer to THAT plan. Once approved it becomes the Active Plan above — modify it with update_workout_plan and its Plan ID. Do not propose another new plan.
- Only call create_workout_plan when there is no plan under discussion, or when the user explicitly asks for a brand-new, separate plan (e.g. "make me a different plan", "start over"). Never call create_workout_plan more than once in a single response.
- When you call update_workout_plan, briefly state in your text response which plan you are updating, by name.`;
}

// ── Main Chat Action ───────────────────────────────────────────

export const sendMessage = action({
  args: {
    conversationClientId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check subscription before allowing AI features
    const isPro = await ctx.runQuery(
      internal.subscriptions.checkSubscription,
      { userId }
    );
    if (!isPro) {
      throw new Error(
        "Subscription required: Your current plan doesn't include AI Coach. Please upgrade to Pro to use this feature."
      );
    }

    // 1. Insert user message
    await ctx.runMutation(internal.chat.insertMessage, {
      userId,
      conversationClientId: args.conversationClientId,
      role: "user",
      content: args.content,
      status: "complete",
    });

    // 2. Gather user context
    const context = await ctx.runQuery(internal.chatInternal.getUserContext, {
      userId,
    });

    // 2b. Gather recent health & recovery context (Apple Health imports)
    const healthContext = await ctx.runQuery(
      internal.healthData.getHealthContextForUser,
      { userId },
    );

    // 3. Load conversation history
    const history = await ctx.runQuery(internal.chat.getHistory, {
      userId,
      conversationClientId: args.conversationClientId,
    });

    // 4. Build messages array for OpenAI. Window to the most recent
    // exchange so prompt size stays bounded as conversations grow.
    const recentHistory = history
      .filter((m) => m.role !== "system")
      .slice(-OPENAI_HISTORY_WINDOW);
    const systemPrompt = buildSystemPrompt(context, healthContext);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          m.role === "assistant" && m.pendingApproval
            ? m.content + approvalMarker(m.pendingApproval)
            : m.content,
      })),
    ];

    // Cost tripwire for backlog.md LATER #2 — counts only, never content.
    void ctx
      .runAction(internal.analytics.captureServer, {
        distinctId: userId,
        eventName: "ai_context_size",
        properties: {
          systemPromptChars: systemPrompt.length,
          historyMessages: recentHistory.length,
          historyMessagesRaw: history.length,
          historyChars: recentHistory.reduce((n, m) => n + m.content.length, 0),
          totalWorkouts: context.stats.totalWorkouts,
          exerciseCount: context.exercises.length,
        },
      })
      .catch(() => {});

    // 5. Insert placeholder assistant message
    const assistantMessageId = await ctx.runMutation(
      internal.chat.insertMessage,
      {
        userId,
        conversationClientId: args.conversationClientId,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    );

    // 6. Call OpenAI with streaming
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
      const stream = await openai.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        messages,
        tools: TOOLS,
        stream: true,
        max_completion_tokens: 8000,
      });

      let fullContent = "";
      let lastUpdateTime = 0;

      // Accumulate tool calls from stream deltas
      const toolCallAccumulator: Map<
        number,
        { id: string; name: string; arguments: string }
      > = new Map();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Accumulate text content
        if (delta?.content) {
          fullContent += delta.content;

          // Update message content periodically (~500ms)
          const now = Date.now();
          if (now - lastUpdateTime > 200) {
            await ctx.runMutation(internal.chat.updateMessageContent, {
              messageId: assistantMessageId,
              content: fullContent,
            });
            lastUpdateTime = now;
          }
        }

        // Accumulate tool calls
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallAccumulator.get(tc.index);
            if (!existing) {
              toolCallAccumulator.set(tc.index, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              });
            } else {
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments)
                existing.arguments += tc.function.arguments;
            }
          }
        }
      }

      // 7. Process completed stream
      const rawToolCalls = Array.from(toolCallAccumulator.values()).filter(
        (tc) => tc.id && tc.name,
      );

      // Structural guard (issue #102): a single assistant turn may propose at
      // most ONE new workout plan. The model occasionally emits several
      // create_workout_plan calls in one response; each would become its own
      // approval card and, once approved, its own saved plan. Keep the first
      // and drop the rest — prompt rules alone are not a guardrail.
      let sawCreatePlan = false;
      const toolCalls = rawToolCalls.filter((tc) => {
        if (tc.name !== "create_workout_plan") return true;
        if (sawCreatePlan) {
          console.error(
            "[chat] dropped duplicate create_workout_plan tool call in a single turn",
          );
          return false;
        }
        sawCreatePlan = true;
        return true;
      });

      if (toolCalls.length > 0) {
        // Strip raw JSON that the model sometimes echoes as text content
        // alongside tool calls (e.g., dumping the recipe/template JSON inline).
        // We keep only non-JSON text (the explanation the model wrote).
        fullContent = stripInlineJson(fullContent);

        // Helper to determine approval type from tool name
        function getApprovalType(name: string) {
          if (name === "create_workout_template") return "create_template";
          if (name === "create_workout_plan") return "create_plan";
          if (name === "update_workout_plan") return "update_plan";
          if (name === "log_meal") return "log_meal";
          if (name === "set_nutrition_goals") return "set_nutrition_goals";
          return "create_recipe";
        }

        // First tool call goes on the main assistant message (with text content)
        const firstToolCall = toolCalls[0];
        let firstToolArgs: unknown;
        let firstToolArgsOk = true;
        try {
          firstToolArgs = JSON.parse(firstToolCall.arguments);
        } catch {
          firstToolArgsOk = false;
          console.error(
            `[chat] tool-call arguments unparseable (likely token truncation): ${firstToolCall.name}`,
          );
        }

        if (firstToolArgsOk) {
          await ctx.runMutation(internal.chat.updateMessageWithToolCalls, {
            messageId: assistantMessageId,
            content: fullContent,
            toolCalls: toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            })),
            pendingApproval: {
              type: getApprovalType(firstToolCall.name),
              payload: JSON.stringify(firstToolArgs),
              status: "pending",
            },
            status: "complete",
          });
        } else {
          // Truncated tool-call JSON — degrade to the streamed text content
          // instead of failing the whole turn.
          await ctx.runMutation(internal.chat.updateMessageContent, {
            messageId: assistantMessageId,
            content: fullContent,
            status: "complete",
          });
        }

        // Additional tool calls each get their own assistant message
        for (let i = 1; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          let tcArgs: unknown;
          try {
            tcArgs = JSON.parse(tc.arguments);
          } catch {
            console.error(
              `[chat] tool-call arguments unparseable (likely token truncation): ${tc.name}`,
            );
            continue;
          }

          await ctx.runMutation(internal.chat.insertMessage, {
            userId,
            conversationClientId: args.conversationClientId,
            role: "assistant",
            content: "",
            status: "complete",
            pendingApproval: {
              type: getApprovalType(tc.name),
              payload: JSON.stringify(tcArgs),
              status: "pending",
            },
          });
        }
      } else {
        // Final content update for non-tool-call responses
        await ctx.runMutation(internal.chat.updateMessageContent, {
          messageId: assistantMessageId,
          content: fullContent,
          status: "complete",
        });
      }

      // 8. Auto-generate conversation title if first user message
      const userMessages = history.filter((m) => m.role === "user");
      if (userMessages.length <= 1) {
        try {
          const titleResponse = await openai.chat.completions.create({
            model: OPENAI_CHAT_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "Generate a concise 3-5 word title for this fitness conversation. Return only the title, no quotes or punctuation.",
              },
              { role: "user", content: args.content },
            ],
            max_completion_tokens: 20,
          });
          const title =
            titleResponse.choices[0]?.message?.content?.trim() || "New Chat";
          await ctx.runMutation(internal.chat.updateConversationTitle, {
            userId,
            conversationClientId: args.conversationClientId,
            title,
          });
        } catch {
          // Title generation is non-critical
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[chat] sendMessage failed: ${reason}`);

      // Handled failure: the user gets a fallback message below, so Convex's
      // native (uncaught) Sentry integration never sees this. Report it.
      await ctx.scheduler.runAfter(0, internal.errorReporting.reportHandledError, {
        where: "chat.sendMessage",
        message: reason,
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        extra: { conversationClientId: args.conversationClientId },
      });

      // Mark message as error
      await ctx.runMutation(internal.chat.updateMessageContent, {
        messageId: assistantMessageId,
        content:
          "Sorry, I encountered an error processing your request. Please try again.",
        status: "error",
      });
    }
  },
});

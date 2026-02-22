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

// ── Tool Definitions ───────────────────────────────────────────

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
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Exercise name" },
                type: {
                  type: "string",
                  enum: [
                    "reps_weight",
                    "reps_time",
                    "time_only",
                    "time_distance",
                    "reps_only",
                  ],
                  description: "Exercise measurement type",
                },
                defaultSetsCount: {
                  type: "number",
                  description: "Number of sets",
                },
                restTimeSeconds: {
                  type: "number",
                  description: "Rest between sets in seconds",
                },
                suggestedReps: {
                  type: "number",
                  description:
                    "Suggested reps per set based on user history and goals",
                },
                suggestedWeight: {
                  type: "number",
                  description:
                    "Suggested weight per set in user's preferred unit, based on history",
                },
                suggestedTime: {
                  type: "number",
                  description:
                    "Suggested time in seconds per set (for time-based exercises)",
                },
                suggestedDistance: {
                  type: "number",
                  description:
                    "Suggested distance per set (for distance-based exercises)",
                },
              },
              required: ["name", "type", "defaultSetsCount", "restTimeSeconds"],
            },
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
        "Create a multi-week workout plan with scheduled workouts. Include the templates array with full exercise details for each unique workout type.",
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
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: {
                        type: "string",
                        enum: [
                          "reps_weight",
                          "reps_time",
                          "time_only",
                          "time_distance",
                          "reps_only",
                        ],
                      },
                      defaultSetsCount: { type: "number" },
                      restTimeSeconds: { type: "number" },
                      suggestedReps: { type: "number" },
                      suggestedWeight: { type: "number" },
                      suggestedTime: { type: "number" },
                      suggestedDistance: { type: "number" },
                    },
                    required: [
                      "name",
                      "type",
                      "defaultSetsCount",
                      "restTimeSeconds",
                    ],
                  },
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
        "Update an existing workout plan. Can modify days, swap templates, or add notes.",
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
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          type: {
                            type: "string",
                            enum: [
                              "reps_weight",
                              "reps_time",
                              "time_only",
                              "time_distance",
                              "reps_only",
                            ],
                          },
                          defaultSetsCount: { type: "number" },
                          restTimeSeconds: { type: "number" },
                        },
                        required: [
                          "name",
                          "type",
                          "defaultSetsCount",
                          "restTimeSeconds",
                        ],
                      },
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
];

// ── System Prompt Builder ──────────────────────────────────────

interface UserContext {
  settings: {
    weightUnit: string;
    distanceUnit: string;
    defaultRestTime: number;
  };
  exercises: { name: string; type: string }[];
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

function buildSystemPrompt(context: UserContext): string {
  const exerciseList =
    context.exercises.length > 0
      ? context.exercises.map((e) => `- ${e.name} (${e.type})`).join("\n")
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

## Exercise Library (${context.exercises.length} exercises)
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

## Active Plan
${planSection}

## Important Rules
- CRITICAL: If the user's request lacks sufficient detail to create a truly personalized workout, plan, or recipe, you MUST ask clarifying questions BEFORE generating anything. Ask about: experience level, available equipment, training frequency, specific goals, injury history, time constraints per session, and preferred training style. It is far better to ask 2-3 targeted questions and create something perfect than to guess and produce something generic. Only skip questions if the user provided comprehensive details or you can confidently infer everything from their exercise history and stats above.
- When creating templates, plans, or recipes, ALWAYS use the tool functions. Do NOT just describe them in text.
- IMPORTANT: Before calling any tool function, you MUST first write a brief explanation in your text response. Explain what you're creating and why — e.g. the reasoning behind exercise selection, set/rep schemes, plan structure, or recipe choices. This gives the user context before they see the approval card. Keep it concise (2-4 sentences).
- When creating templates, ALWAYS include suggestedReps and suggestedWeight (or suggestedTime/suggestedDistance for time/distance exercises) for each exercise. Base these on the user's exercise performance history above. If no history exists for an exercise, use sensible defaults for the exercise type and apparent experience level.
- When creating a workout plan, use create_workout_plan and include ALL necessary templates in the templates array.
- You can create multiple templates at once by making multiple create_workout_template tool calls in a single response. Each will appear as a separate approval card for the user.
- Always include notes for each template describing the workout's purpose, target muscle groups, intensity level, and any specific guidance (e.g., pace zones for running, RPE targets, rest guidance).
- For running/cardio plans, create distinct exercises for each run type (Easy Run, Tempo Run, Long Run, Intervals, etc.) using time_distance type. Use the template notes to describe pace zones, heart rate targets, and workout intent.
- When creating a workout plan, always set startDate to the nearest upcoming Monday (or Sunday for sunday-start users) from the current date, unless the user specifies a different start date. The startDate is the first day of Week 1.
- Prefer exercises from the user's existing library when possible. Match names exactly.
- All data you create will require user approval before being saved. The user can reject and ask for changes.
- Use the user's preferred units (${context.settings.weightUnit}, ${context.settings.distanceUnit}).
- Be concise but helpful. Focus on actionable advice.
- When suggesting exercises, consider the user's exercise types (reps_weight, reps_time, time_only, time_distance, reps_only).
- For workout plans, use dayOfWeek values: 0=Sunday, 1=Monday, ..., 6=Saturday.
- For rest days in plans, omit the templateName field.
- When the user asks to modify their existing plan, use the update_workout_plan tool with the plan's Plan ID (shown above in the Active Plan section). Reference existing template names exactly as they appear in the schedule. Only include newTemplates if you need to add workout types that don't already exist.
- When a user says "my plan", "the plan", or similar, they mean the active plan. Use its Plan ID for updates.
- NEVER create a new plan when the user is asking to modify an existing one. Use update_workout_plan instead.`;
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

    // 3. Load conversation history
    const history = await ctx.runMutation(internal.chat.getHistory, {
      userId,
      conversationClientId: args.conversationClientId,
    });

    // 4. Build messages array for OpenAI
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(context) },
      ...history
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    ];

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
        model: "gpt-5.2",
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
      const toolCalls = Array.from(toolCallAccumulator.values()).filter(
        (tc) => tc.id && tc.name,
      );

      if (toolCalls.length > 0) {
        // Helper to determine approval type from tool name
        function getApprovalType(name: string) {
          if (name === "create_workout_template") return "create_template";
          if (name === "create_workout_plan") return "create_plan";
          if (name === "update_workout_plan") return "update_plan";
          return "create_recipe";
        }

        // First tool call goes on the main assistant message (with text content)
        const firstToolCall = toolCalls[0];
        const firstToolArgs = JSON.parse(firstToolCall.arguments);

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

        // Additional tool calls each get their own assistant message
        for (let i = 1; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          const tcArgs = JSON.parse(tc.arguments);

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
            model: "gpt-5.2",
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
      // Mark message as error
      await ctx.runMutation(internal.chat.updateMessageContent, {
        messageId: assistantMessageId,
        content:
          "Sorry, I encountered an error processing your request. Please try again.",
        status: "error",
      });
      throw error;
    }
  },
});

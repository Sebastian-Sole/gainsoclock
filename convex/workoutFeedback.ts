// Post-workout AI feedback (proactive AI coach, Phase 2).
//
// One small Pro-gated action that turns a finished workout into a single
// punchy notification-sized insight. Runs in the Convex default runtime
// (the `openai` v6 SDK is fetch-based) so the internal context query can
// live in the same file.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { hasHealthPersonalizationConsent } from "./healthData";
import { OPENAI_CHAT_MODEL } from "./openaiConfig";

// Bounds for PR detection (same approach as convex/weeklyReview.ts:
// PRs are measured against a capped window of recent history).
const MAX_PRIOR_LOGS = 60;
const MAX_HISTORY_SCAN_PER_EXERCISE = 40;
const MAX_PRIOR_SESSIONS_PER_EXERCISE = 6;
const MAX_PROMPT_EXERCISES = 8;

type FeedbackContext = {
  templateName: string;
  completedAtDate: string;
  durationMinutes: number;
  weightUnit: string;
  exercises: { name: string; topSetLabel: string; isPr: boolean }[];
  prCount: number;
  currentStreak: number;
  avgSleepHours7d?: number;
  latestRestingHr?: number;
};

const FEEDBACK_SYSTEM_PROMPT = `You are Fitbull's AI coach. Write ONE punchy post-workout insight for a push notification: 1-2 sentences, 140 characters maximum. Plain text only — no emojis, no hashtags, no surrounding quotes. Include one concrete number from the data when possible (a weight, PR, streak, or duration). Be encouraging and specific, never generic. No medical advice.`;

function buildFeedbackPrompt(c: FeedbackContext): string {
  const lines: string[] = [
    `Workout: "${c.templateName}" — ${c.durationMinutes} min on ${c.completedAtDate}.`,
  ];

  if (c.exercises.length > 0) {
    lines.push("Top sets:");
    for (const e of c.exercises.slice(0, MAX_PROMPT_EXERCISES)) {
      lines.push(`- ${e.name}: ${e.topSetLabel}${e.isPr ? " (new PR)" : ""}`);
    }
  }

  lines.push(
    `PRs this session: ${c.prCount}. Current streak: ${c.currentStreak} day${c.currentStreak === 1 ? "" : "s"}.`
  );

  const recovery: string[] = [];
  if (c.avgSleepHours7d !== undefined) {
    recovery.push(`avg sleep ${c.avgSleepHours7d}h/night`);
  }
  if (c.latestRestingHr !== undefined) {
    recovery.push(`resting HR ${c.latestRestingHr} bpm`);
  }
  if (recovery.length > 0) {
    lines.push(`Recovery (last 7 days): ${recovery.join(", ")}.`);
  }

  return lines.join("\n");
}

// ── Internal: gather everything the prompt needs in one query ──

export const getFeedbackContext = internalQuery({
  args: { userId: v.id("users"), workoutLogClientId: v.string() },
  handler: async (ctx, args): Promise<FeedbackContext | null> => {
    // Looked up by clientId: at completion time the client only knows its
    // offline-first id — the server _id may not exist yet when the action
    // fires (the log syncs through the offline queue).
    const log = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", args.userId).eq("clientId", args.workoutLogClientId)
      )
      .unique();
    if (!log) return null;

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const weightUnit = settings?.weightUnit ?? "kg";
    const distanceUnit = settings?.distanceUnit ?? "km";

    // Exercises + sets for this workout.
    const logExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_workout", (q) =>
        q.eq("userId", args.userId).eq("workoutLogClientId", log.clientId)
      )
      .collect();
    logExercises.sort((a, b) => a.order - b.order);

    // Recent prior logs (before this workout) define the PR window.
    const priorLogs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user_completedAt", (q) =>
        q.eq("userId", args.userId).lt("completedAt", log.completedAt)
      )
      .order("desc")
      .take(MAX_PRIOR_LOGS);
    const priorLogIds = new Set(priorLogs.map((l) => l.clientId));

    const exercises: { name: string; topSetLabel: string; isPr: boolean }[] =
      [];
    let prCount = 0;

    for (const le of logExercises.slice(0, MAX_PROMPT_EXERCISES)) {
      const sets = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q
            .eq("userId", args.userId)
            .eq("workoutLogExerciseClientId", le.clientId)
        )
        .collect();

      const completedSets = sets.filter((s) => s.completed);
      if (completedSets.length === 0) continue;

      const def = await ctx.db
        .query("exercises")
        .withIndex("by_user_clientId", (q) =>
          q.eq("userId", args.userId).eq("clientId", le.exerciseClientId)
        )
        .unique();
      const name = def?.name ?? "Unknown exercise";

      // Top set: heaviest weighted set, else longest time / distance / reps.
      let topSetLabel = `${completedSets.length} set${completedSets.length === 1 ? "" : "s"}`;
      let topWeight: number | undefined;
      let topReps: number | undefined;
      for (const s of completedSets) {
        if (s.weight !== undefined && s.reps !== undefined) {
          if (topWeight === undefined || s.weight > topWeight) {
            topWeight = s.weight;
            topReps = s.reps;
          }
        }
      }
      if (topWeight !== undefined) {
        topSetLabel = `${topWeight}${weightUnit} × ${topReps}`;
      } else {
        const maxDistance = Math.max(
          ...completedSets.map((s) => s.distance ?? 0)
        );
        const maxTime = Math.max(...completedSets.map((s) => s.time ?? 0));
        const maxReps = Math.max(...completedSets.map((s) => s.reps ?? 0));
        if (maxDistance > 0) {
          topSetLabel = `${maxDistance}${distanceUnit}${maxTime > 0 ? ` in ${Math.round(maxTime / 60)} min` : ""}`;
        } else if (maxTime > 0) {
          topSetLabel = `${Math.round(maxTime)}s`;
        } else if (maxReps > 0) {
          topSetLabel = `${maxReps} reps`;
        }
      }

      // PR check (weighted lifts only): heaviest set vs recent prior history.
      let isPr = false;
      if (topWeight !== undefined) {
        const recentLogExercises = await ctx.db
          .query("workoutLogExercises")
          .withIndex("by_exercise", (q) =>
            q
              .eq("userId", args.userId)
              .eq("exerciseClientId", le.exerciseClientId)
          )
          .order("desc")
          .take(MAX_HISTORY_SCAN_PER_EXERCISE);

        const priorSessions = recentLogExercises
          .filter((p) => priorLogIds.has(p.workoutLogClientId))
          .slice(0, MAX_PRIOR_SESSIONS_PER_EXERCISE);

        let priorBest: number | undefined;
        for (const session of priorSessions) {
          const priorSets = await ctx.db
            .query("workoutSets")
            .withIndex("by_workout_exercise", (q) =>
              q
                .eq("userId", args.userId)
                .eq("workoutLogExerciseClientId", session.clientId)
            )
            .collect();
          for (const s of priorSets) {
            if (!s.completed || s.weight === undefined || s.reps === undefined)
              continue;
            if (priorBest === undefined || s.weight > priorBest) {
              priorBest = s.weight;
            }
          }
        }
        isPr = priorBest !== undefined && topWeight > priorBest;
        if (isPr) prCount++;
      }

      exercises.push({ name, topSetLabel, isPr });
    }

    // Current streak (consecutive days with a workout, ending today) —
    // same algorithm as convex/chatInternal.ts.
    const allLogs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const logDates = new Set(allLogs.map((l) => l.completedAt.split("T")[0]));
    let streak = 0;
    const checkDate = new Date();
    while (true) {
      const dateStr = checkDate.toISOString().split("T")[0];
      if (logDates.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Last 7 days of health metrics (newest first via the date index).
    // Only included in the AI prompt when the user has granted
    // health_data_personalization — feedback still works without them,
    // it just speaks to the workout alone.
    const metrics = (await hasHealthPersonalizationConsent(ctx, args.userId))
      ? await ctx.db
          .query("healthDailyMetrics")
          .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
          .order("desc")
          .take(7)
      : [];

    const sleepValues = metrics
      .map((m) => m.asleepSeconds)
      .filter((x): x is number => x !== undefined);
    const avgSleepHours7d =
      sleepValues.length > 0
        ? Math.round(
            (sleepValues.reduce((a, b) => a + b, 0) /
              sleepValues.length /
              3600) *
              10
          ) / 10
        : undefined;
    const latestRestingHr = metrics.find(
      (m) => m.restingHeartRateBpm !== undefined
    )?.restingHeartRateBpm;

    return {
      templateName: log.templateName,
      completedAtDate: log.completedAt.split("T")[0],
      durationMinutes: Math.round(log.durationSeconds / 60),
      weightUnit,
      exercises,
      prCount,
      currentStreak: streak,
      ...(avgSleepHours7d !== undefined && { avgSleepHours7d }),
      ...(latestRestingHr !== undefined && {
        latestRestingHr: Math.round(latestRestingHr),
      }),
    };
  },
});

// ── Action: one punchy post-workout insight ────────────────────

export const generateFeedback = action({
  args: { workoutLogClientId: v.string() },
  handler: async (ctx, args): Promise<{ feedback: string } | null> => {
    // Never throw to the client — the caller falls back to static
    // notification copy on null.
    try {
      const userId: Id<"users"> | null = await getAuthUserId(ctx);
      if (!userId) return null;

      const isPro: boolean = await ctx.runQuery(
        internal.subscriptions.checkSubscription,
        { userId }
      );
      if (!isPro) return null;

      const context: FeedbackContext | null = await ctx.runQuery(
        internal.workoutFeedback.getFeedbackContext,
        { userId, workoutLogClientId: args.workoutLogClientId }
      );
      if (!context) return null;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        messages: [
          { role: "system", content: FEEDBACK_SYSTEM_PROMPT },
          { role: "user", content: buildFeedbackPrompt(context) },
        ],
        max_completion_tokens: 100,
      });

      let feedback = response.choices[0]?.message?.content?.trim() ?? "";
      // Strip wrapping quotes the model occasionally adds.
      if (feedback.startsWith('"') && feedback.endsWith('"')) {
        feedback = feedback.slice(1, -1).trim();
      }
      if (feedback.length === 0) return null;

      return { feedback };
    } catch {
      return null;
    }
  },
});

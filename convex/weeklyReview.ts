// Weekly training review (proactive AI coach, Phase 2).
//
// NOTE: this file intentionally runs in the Convex default runtime (no
// "use node") so the public queries, internal helpers, and the OpenAI
// action can live together. The `openai` v6 SDK is fetch-based and works
// in the default runtime.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { OPENAI_CHAT_MODEL } from "./openaiConfig";
import {
  weeklyReviewRecommendationValidator,
  weeklyReviewStatsValidator,
} from "./validators";

// ── Types & constants ──────────────────────────────────────────

const RECOMMENDATION_KINDS = [
  "deload",
  "swap",
  "volume",
  "rest",
  "keep_going",
] as const;

type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

type Recommendation = { kind: RecommendationKind; text: string };

type WeekStats = {
  workoutCount: number;
  totalVolumeKg: number;
  totalSets: number;
  prCount: number;
  planAdherencePct?: number;
  externalWorkoutCount: number;
  avgSleepHours?: number;
  avgRestingHr?: number;
};

type ProgressionHighlight = {
  name: string;
  weekBestWeightKg: number;
  weekBestReps?: number;
  priorBestWeightKg?: number;
  isPr: boolean;
  // Best weighted set per prior session, newest first (bounded).
  priorSessionBests: { date: string; weightKg: number }[];
};

type WeekStatsResult = {
  stats: WeekStats;
  highlights: ProgressionHighlight[];
};

// Bounds keep the live stats computation within Convex read limits even
// for long-time users: only one week of logs is joined fully, and PR
// detection scans a capped window of recent history per exercise.
const MAX_WEEK_LOGS = 40;
const MAX_PRIOR_LOGS = 60;
const MAX_HISTORY_SCAN_PER_EXERCISE = 40;
const MAX_PRIOR_SESSIONS_PER_EXERCISE = 8;
const MAX_HIGHLIGHT_EXERCISES = 15;
const LBS_TO_KG = 0.45359237;
const REGENERATE_AFTER_MS = 24 * 60 * 60 * 1000;

// ── Small helpers ──────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isRecommendationKind(x: string): x is RecommendationKind {
  return RECOMMENDATION_KINDS.some((k) => k === x);
}

// ── Stats computation (shared by public query + internal query) ─

async function buildWeekStats(
  ctx: QueryCtx,
  userId: Id<"users">,
  weekStart: string
): Promise<WeekStatsResult> {
  const weekEnd = addDays(weekStart, 7);

  // Weights are stored in the user's preferred unit; normalize to kg.
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const toKg = (weight: number): number =>
    settings?.weightUnit === "lbs" ? weight * LBS_TO_KG : weight;

  // 1. Workouts in [weekStart, weekStart+7d). `completedAt` is full ISO,
  // so lexicographic bounds against "YYYY-MM-DD" give the half-open week.
  const weekLogs = await ctx.db
    .query("workoutLogs")
    .withIndex("by_user_completedAt", (q) =>
      q
        .eq("userId", userId)
        .gte("completedAt", weekStart)
        .lt("completedAt", weekEnd)
    )
    .take(MAX_WEEK_LOGS);

  let totalVolumeKg = 0;
  let totalSets = 0;
  const weekBestByExercise = new Map<
    string,
    { weightKg: number; reps?: number }
  >();

  for (const log of weekLogs) {
    const logExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_workout", (q) =>
        q.eq("userId", userId).eq("workoutLogClientId", log.clientId)
      )
      .collect();

    for (const le of logExercises) {
      const sets = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q
            .eq("userId", userId)
            .eq("workoutLogExerciseClientId", le.clientId)
        )
        .collect();

      for (const s of sets) {
        if (!s.completed) continue;
        totalSets++;
        if (s.reps !== undefined && s.weight !== undefined) {
          const weightKg = toKg(s.weight);
          totalVolumeKg += s.reps * weightKg;
          const best = weekBestByExercise.get(le.exerciseClientId);
          if (
            !best ||
            weightKg > best.weightKg ||
            (weightKg === best.weightKg && s.reps > (best.reps ?? 0))
          ) {
            weekBestByExercise.set(le.exerciseClientId, {
              weightKg,
              reps: s.reps,
            });
          }
        }
      }
    }
  }

  // 2. PR detection + per-exercise progression highlights.
  // Prior history is bounded: the last MAX_PRIOR_LOGS workouts before the
  // week define the comparison window (a "PR" vs the recent past).
  const priorLogs = await ctx.db
    .query("workoutLogs")
    .withIndex("by_user_completedAt", (q) =>
      q.eq("userId", userId).lt("completedAt", weekStart)
    )
    .order("desc")
    .take(MAX_PRIOR_LOGS);
  const priorLogDates = new Map(priorLogs.map((l) => [l.clientId, l.completedAt]));

  let prCount = 0;
  const highlights: ProgressionHighlight[] = [];

  const weekExercises = [...weekBestByExercise.entries()].slice(
    0,
    MAX_HIGHLIGHT_EXERCISES
  );

  for (const [exerciseClientId, weekBest] of weekExercises) {
    const exercise = await ctx.db
      .query("exercises")
      .withIndex("by_user_clientId", (q) =>
        q.eq("userId", userId).eq("clientId", exerciseClientId)
      )
      .unique();

    const recentLogExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseClientId", exerciseClientId)
      )
      .order("desc")
      .take(MAX_HISTORY_SCAN_PER_EXERCISE);

    const priorSessions = recentLogExercises
      .filter((le) => priorLogDates.has(le.workoutLogClientId))
      .slice(0, MAX_PRIOR_SESSIONS_PER_EXERCISE);

    const priorSessionBests: { date: string; weightKg: number }[] = [];
    for (const le of priorSessions) {
      const sets = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q
            .eq("userId", userId)
            .eq("workoutLogExerciseClientId", le.clientId)
        )
        .collect();

      let sessionBest: number | undefined;
      for (const s of sets) {
        if (!s.completed || s.weight === undefined || s.reps === undefined)
          continue;
        const weightKg = toKg(s.weight);
        if (sessionBest === undefined || weightKg > sessionBest) {
          sessionBest = weightKg;
        }
      }
      if (sessionBest !== undefined) {
        const completedAt = priorLogDates.get(le.workoutLogClientId) ?? "";
        priorSessionBests.push({
          date: completedAt.split("T")[0],
          weightKg: round1(sessionBest),
        });
      }
    }
    priorSessionBests.sort((a, b) => b.date.localeCompare(a.date));

    const priorBestWeightKg =
      priorSessionBests.length > 0
        ? Math.max(...priorSessionBests.map((p) => p.weightKg))
        : undefined;
    const isPr =
      priorBestWeightKg !== undefined &&
      round1(weekBest.weightKg) > priorBestWeightKg;
    if (isPr) prCount++;

    highlights.push({
      name: exercise?.name ?? "Unknown exercise",
      weekBestWeightKg: round1(weekBest.weightKg),
      ...(weekBest.reps !== undefined && { weekBestReps: weekBest.reps }),
      ...(priorBestWeightKg !== undefined && { priorBestWeightKg }),
      isPr,
      priorSessionBests: priorSessionBests.slice(0, 5),
    });
  }

  // 3. Plan adherence — only when a plan is active and this calendar week
  // falls inside its duration. Approximation: the plan week containing
  // weekStart (plans usually start on the user's week-start day).
  let planAdherencePct: number | undefined;
  const plans = await ctx.db
    .query("workoutPlans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const activePlan = plans.find((p) => p.status === "active");

  if (activePlan) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const planStartDay = activePlan.startDate.split("T")[0];
    const diffDays = Math.floor(
      (Date.parse(`${weekStart}T00:00:00Z`) -
        Date.parse(`${planStartDay}T00:00:00Z`)) /
        msPerDay
    );
    const weekIndex = Math.floor(diffDays / 7) + 1;

    if (
      Number.isFinite(weekIndex) &&
      weekIndex >= 1 &&
      weekIndex <= activePlan.durationWeeks
    ) {
      const planDays = await ctx.db
        .query("planDays")
        .withIndex("by_plan_week", (q) =>
          q
            .eq("userId", userId)
            .eq("planClientId", activePlan.clientId)
            .eq("week", weekIndex)
        )
        .collect();

      const scheduled = planDays.filter((d) => d.status !== "rest");
      if (scheduled.length > 0) {
        const completed = scheduled.filter(
          (d) => d.status === "completed"
        ).length;
        planAdherencePct = Math.round((completed / scheduled.length) * 100);
      }
    }
  }

  // 4. External workouts (Apple Health imports) in the week.
  const weekStartMs = Date.parse(`${weekStart}T00:00:00Z`);
  const weekEndMs = Date.parse(`${weekEnd}T00:00:00Z`);
  const externalWorkouts = await ctx.db
    .query("externalWorkouts")
    .withIndex("by_user_startedAt", (q) =>
      q
        .eq("userId", userId)
        .gte("startedAt", weekStartMs)
        .lt("startedAt", weekEndMs)
    )
    .collect();

  // 5. Sleep / resting-HR averages for the week (max 7 rows).
  const metrics = await ctx.db
    .query("healthDailyMetrics")
    .withIndex("by_user_date", (q) =>
      q.eq("userId", userId).gte("date", weekStart).lt("date", weekEnd)
    )
    .collect();

  const sleepValues = metrics
    .map((m) => m.asleepSeconds)
    .filter((x): x is number => x !== undefined);
  const avgSleepHours =
    sleepValues.length > 0
      ? round1(
          sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length / 3600
        )
      : undefined;

  const rhrValues = metrics
    .map((m) => m.restingHeartRateBpm)
    .filter((x): x is number => x !== undefined);
  const avgRestingHr =
    rhrValues.length > 0
      ? Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length)
      : undefined;

  return {
    stats: {
      workoutCount: weekLogs.length,
      totalVolumeKg: round1(totalVolumeKg),
      totalSets,
      prCount,
      ...(planAdherencePct !== undefined && { planAdherencePct }),
      externalWorkoutCount: externalWorkouts.length,
      ...(avgSleepHours !== undefined && { avgSleepHours }),
      ...(avgRestingHr !== undefined && { avgRestingHr }),
    },
    highlights,
  };
}

// ── Public queries ─────────────────────────────────────────────

export const getReview = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args): Promise<Doc<"weeklyReviews"> | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("weeklyReviews")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("weekStart", args.weekStart)
      )
      .unique();
  },
});

export const computeWeekStats = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args): Promise<WeekStats | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const { stats } = await buildWeekStats(ctx, userId, args.weekStart);
    return stats;
  },
});

// ── Internal helpers (called from the action) ──────────────────

export const getWeekStatsForUser = internalQuery({
  args: { userId: v.id("users"), weekStart: v.string() },
  handler: async (ctx, args): Promise<WeekStatsResult> => {
    return await buildWeekStats(ctx, args.userId, args.weekStart);
  },
});

export const getReviewForUser = internalQuery({
  args: { userId: v.id("users"), weekStart: v.string() },
  handler: async (ctx, args): Promise<Doc<"weeklyReviews"> | null> => {
    return await ctx.db
      .query("weeklyReviews")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", args.userId).eq("weekStart", args.weekStart)
      )
      .unique();
  },
});

export const upsertReview = internalMutation({
  args: {
    userId: v.id("users"),
    weekStart: v.string(),
    stats: weeklyReviewStatsValidator,
    narrative: v.optional(v.string()),
    recommendation: v.optional(weeklyReviewRecommendationValidator),
    llmUsed: v.boolean(),
  },
  handler: async (ctx, args): Promise<Doc<"weeklyReviews">> => {
    const now = Date.now();

    const existing = await ctx.db
      .query("weeklyReviews")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", args.userId).eq("weekStart", args.weekStart)
      )
      .unique();

    let id: Id<"weeklyReviews">;
    if (existing) {
      // Full overwrite semantics: `undefined` unsets stale narrative /
      // recommendation from a previous generation.
      await ctx.db.patch(existing._id, {
        stats: args.stats,
        narrative: args.narrative,
        recommendation: args.recommendation,
        generatedAt: now,
        llmUsed: args.llmUsed,
      });
      id = existing._id;
    } else {
      id = await ctx.db.insert("weeklyReviews", {
        userId: args.userId,
        weekStart: args.weekStart,
        stats: args.stats,
        ...(args.narrative !== undefined && { narrative: args.narrative }),
        ...(args.recommendation !== undefined && {
          recommendation: args.recommendation,
        }),
        generatedAt: now,
        llmUsed: args.llmUsed,
      });
    }

    const row = await ctx.db.get(id);
    if (!row) throw new Error("Failed to load weekly review after upsert");
    return row;
  },
});

// ── Rule-based fallback (free users / OpenAI failure) ──────────

function ruleBasedRecommendation(
  stats: WeekStats,
  highlights: ProgressionHighlight[]
): Recommendation {
  // Poor recovery → rest.
  if (stats.avgSleepHours !== undefined && stats.avgSleepHours < 6.5) {
    return {
      kind: "rest",
      text: `You averaged ${stats.avgSleepHours}h of sleep this week — prioritize an extra rest day and earlier nights before pushing intensity.`,
    };
  }

  // A lift with 3+ sessions and no improvement → deload.
  const stalled = highlights.find(
    (h) =>
      h.priorSessionBests.length >= 2 &&
      h.priorBestWeightKg !== undefined &&
      h.weekBestWeightKg <= h.priorSessionBests[0].weightKg &&
      h.priorSessionBests[0].weightKg <= h.priorSessionBests[1].weightKg
  );
  if (stalled) {
    return {
      kind: "deload",
      text: `${stalled.name} has been flat at ~${stalled.weekBestWeightKg}kg for several sessions — drop the load about 10% for a week, then build back up.`,
    };
  }

  // Poor plan adherence → swap a day.
  if (stats.planAdherencePct !== undefined && stats.planAdherencePct < 60) {
    return {
      kind: "swap",
      text: `You completed ${stats.planAdherencePct}% of your planned sessions — try moving a workout to a day that fits your schedule better.`,
    };
  }

  // Progressing well → add volume.
  if (stats.prCount > 0) {
    return {
      kind: "volume",
      text: `You set ${stats.prCount} PR${stats.prCount === 1 ? "" : "s"} this week — recovery looks good, so consider adding one extra set to your main lifts.`,
    };
  }

  if (stats.workoutCount === 0) {
    return {
      kind: "keep_going",
      text: "No workouts logged this week — schedule one short session in the next two days to restart momentum.",
    };
  }

  return {
    kind: "keep_going",
    text: `${stats.workoutCount} workout${stats.workoutCount === 1 ? "" : "s"} and ${stats.totalSets} sets in the books — keep the same rhythm going next week.`,
  };
}

// ── LLM prompt + parsing ───────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `You are Fitbull's AI fitness coach writing a short weekly training review.

Respond with JSON only, exactly this shape:
{"narrative": "...", "recommendation": {"kind": "deload" | "swap" | "volume" | "rest" | "keep_going", "text": "..."}}

narrative: 3-5 encouraging sentences summarizing the user's training week in second person. Cite concrete numbers from the data (workouts, volume, PRs, sleep). No emojis, no medical advice, no body commentary.

recommendation: exactly ONE recommendation. Pick the kind using these rules, in priority order:
- "deload" if a lift has stalled for 3+ weeks (session bests flat or declining across the listed history)
- "rest" if recovery metrics are poor (average sleep well under 7h, elevated resting heart rate, or HRV trending down)
- "volume" if lifts are progressing well (new PRs, climbing session bests) — suggest adding a set or a small load increase
- "swap" if plan adherence is poor and scheduled days keep getting missed — suggest moving a specific workout to a different day
- "keep_going" otherwise
text: one concrete, actionable sentence naming the specific exercise, day, or number it applies to.`;

type HealthContext = {
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
};

function buildReviewUserPrompt(
  weekStart: string,
  stats: WeekStats,
  highlights: ProgressionHighlight[],
  health: HealthContext
): string {
  const lines: string[] = [
    `Week of ${weekStart} (Monday to Sunday).`,
    "",
    "Stats:",
    `- Workouts logged: ${stats.workoutCount}`,
    `- Total volume: ${stats.totalVolumeKg}kg across ${stats.totalSets} sets`,
    `- PRs this week: ${stats.prCount}`,
  ];
  if (stats.planAdherencePct !== undefined) {
    lines.push(`- Plan adherence: ${stats.planAdherencePct}%`);
  }
  lines.push(
    `- External workouts (Apple Health): ${stats.externalWorkoutCount}`
  );
  if (stats.avgSleepHours !== undefined) {
    lines.push(`- Average sleep: ${stats.avgSleepHours}h/night`);
  }
  if (stats.avgRestingHr !== undefined) {
    lines.push(`- Average resting heart rate: ${stats.avgRestingHr} bpm`);
  }

  // Recovery context (last 7 days, may extend past the review week).
  const recoveryLines: string[] = [];
  const hrvValues = health.dailyMetrics
    .map((d) => d.hrvMs)
    .filter((x): x is number => x !== undefined);
  if (hrvValues.length > 0) {
    const latest = hrvValues[0];
    const avg = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
    recoveryLines.push(
      `- HRV: latest ${Math.round(latest)}ms vs ${Math.round(avg)}ms 7-day average`
    );
  }
  const latestRhr = health.dailyMetrics.find(
    (d) => d.restingHeartRateBpm !== undefined
  )?.restingHeartRateBpm;
  if (latestRhr !== undefined) {
    recoveryLines.push(`- Latest resting heart rate: ${Math.round(latestRhr)} bpm`);
  }
  if (health.externalWorkoutCount7d > 0) {
    recoveryLines.push(
      `- Cross-training last 7 days: ${health.externalWorkoutCount7d} sessions (${health.activityTypes7d.join(", ")})`
    );
  }
  lines.push("");
  lines.push("Recovery (last 7 days):");
  lines.push(
    recoveryLines.length > 0 ? recoveryLines.join("\n") : "- No recovery data."
  );

  lines.push("");
  lines.push("Exercise progression (weighted lifts this week):");
  if (highlights.length === 0) {
    lines.push("- No weighted lifts logged this week.");
  } else {
    for (const h of highlights) {
      const weekBest = `best this week ${h.weekBestWeightKg}kg${h.weekBestReps !== undefined ? `×${h.weekBestReps}` : ""}${h.isPr ? " (new PR)" : ""}`;
      const prior =
        h.priorBestWeightKg !== undefined
          ? `prior best ${h.priorBestWeightKg}kg`
          : "no prior history";
      const sessions =
        h.priorSessionBests.length > 0
          ? `; recent session bests: ${h.priorSessionBests
              .map((p) => `${p.date} ${p.weightKg}kg`)
              .join(", ")}`
          : "";
      lines.push(`- ${h.name}: ${weekBest}; ${prior}${sessions}`);
    }
  }

  return lines.join("\n");
}

type ParsedReview = { narrative: string; recommendation: Recommendation };

function parseReviewJson(raw: string): ParsedReview | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  const narrative = data.narrative;
  if (typeof narrative !== "string" || narrative.trim().length === 0) {
    return null;
  }

  const rec = data.recommendation;
  if (!isRecord(rec)) return null;
  const kind = rec.kind;
  const text = rec.text;
  if (typeof kind !== "string" || !isRecommendationKind(kind)) return null;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  return {
    narrative: narrative.trim(),
    recommendation: { kind, text: text.trim() },
  };
}

// ── Action: generate (or refresh) the weekly review ────────────

export const generateReview = action({
  args: { weekStart: v.string() },
  handler: async (ctx, args): Promise<Doc<"weeklyReviews">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Idempotency: a review generated in the last 24h is returned as-is.
    const existing: Doc<"weeklyReviews"> | null = await ctx.runQuery(
      internal.weeklyReview.getReviewForUser,
      { userId, weekStart: args.weekStart }
    );
    if (existing && Date.now() - existing.generatedAt < REGENERATE_AFTER_MS) {
      return existing;
    }

    const { stats, highlights }: WeekStatsResult = await ctx.runQuery(
      internal.weeklyReview.getWeekStatsForUser,
      { userId, weekStart: args.weekStart }
    );

    const isPro: boolean = await ctx.runQuery(
      internal.subscriptions.checkSubscription,
      { userId }
    );

    let narrative: string | undefined;
    let recommendation: Recommendation | undefined;
    let llmUsed = false;

    if (isPro) {
      try {
        const health: HealthContext = await ctx.runQuery(
          internal.healthData.getHealthContextForUser,
          { userId }
        );

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: OPENAI_CHAT_MODEL,
          messages: [
            { role: "system", content: REVIEW_SYSTEM_PROMPT },
            {
              role: "user",
              content: buildReviewUserPrompt(
                args.weekStart,
                stats,
                highlights,
                health
              ),
            },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 700,
        });

        const raw = response.choices[0]?.message?.content;
        const parsed = raw ? parseReviewJson(raw) : null;
        if (parsed) {
          narrative = parsed.narrative;
          recommendation = parsed.recommendation;
          llmUsed = true;
        }
      } catch {
        // Fall through to the rule-based recommendation below.
      }
    }

    if (!recommendation) {
      recommendation = ruleBasedRecommendation(stats, highlights);
    }

    return await ctx.runMutation(internal.weeklyReview.upsertReview, {
      userId,
      weekStart: args.weekStart,
      stats,
      ...(narrative !== undefined && { narrative }),
      recommendation,
      llmUsed,
    });
  },
});

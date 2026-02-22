import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Gathers all user context needed to build the AI system prompt.
 * Called from the chat action before sending to OpenAI.
 */
export const getUserContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // 1. User settings
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // 2. Exercise library (names + types only)
    const exercises = await ctx.db
      .query("exercises")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // 3. Templates with exercises
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const exerciseMap = new Map(exercises.map((e) => [e.clientId, e]));

    const templatesWithExercises = [];
    for (const template of templates.slice(-10)) {
      const templateExercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) =>
          q.eq("userId", args.userId).eq("templateClientId", template.clientId)
        )
        .collect();

      templateExercises.sort((a, b) => a.order - b.order);

      templatesWithExercises.push({
        clientId: template.clientId,
        name: template.name,
        exercises: templateExercises.map((te) => {
          const exercise = exerciseMap.get(te.exerciseClientId);
          return {
            name: exercise?.name ?? "Unknown",
            type: exercise?.type ?? "reps_weight",
            defaultSetsCount: te.defaultSetsCount,
            restTimeSeconds: te.restTimeSeconds,
          };
        }),
      });
    }

    // 4. Recent workout logs (last 14 days, summarized)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const allLogs = await ctx.db
      .query("workoutLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const recentLogs = allLogs
      .filter((l) => new Date(l.completedAt) >= twoWeeksAgo)
      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() -
          new Date(a.completedAt).getTime()
      )
      .slice(0, 20)
      .map((l) => ({
        date: l.completedAt.split("T")[0],
        templateName: l.templateName,
        durationMinutes: Math.round(l.durationSeconds / 60),
      }));

    // 5. Stats summary
    const totalWorkouts = allLogs.length;
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const workoutsLast30 = allLogs.filter(
      (l) => new Date(l.completedAt) >= thirtyDaysAgo
    ).length;

    const workoutsPerWeek =
      workoutsLast30 > 0
        ? Math.round((workoutsLast30 / 30) * 7 * 10) / 10
        : 0;

    // Current streak (consecutive days with workouts)
    const logDates = new Set(
      allLogs.map((l) => l.completedAt.split("T")[0])
    );
    let streak = 0;
    const checkDate = new Date(now);
    while (true) {
      const dateStr = checkDate.toISOString().split("T")[0];
      if (logDates.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // 6. Exercise performance history (per-exercise recent sets)
    const exerciseHistory: {
      name: string;
      type: string;
      lastUsed: string;
      recentSets: { reps?: number; weight?: number; time?: number; distance?: number }[];
    }[] = [];

    // Get recent workout log exercises for each exercise (capped at 20 most-used)
    for (const exercise of exercises.slice(0, 20)) {
      const logExercises = await ctx.db
        .query("workoutLogExercises")
        .withIndex("by_exercise", (q) =>
          q.eq("userId", args.userId).eq("exerciseClientId", exercise.clientId)
        )
        .collect();

      if (logExercises.length === 0) continue;

      // Find the most recent log exercise by looking up its parent workout log
      let mostRecentLogEx = logExercises[logExercises.length - 1];
      let mostRecentDate = "";

      for (const le of logExercises.slice(-5)) {
        const parentLog = allLogs.find(
          (l) => l.clientId === le.workoutLogClientId
        );
        if (parentLog && parentLog.completedAt > mostRecentDate) {
          mostRecentDate = parentLog.completedAt;
          mostRecentLogEx = le;
        }
      }

      // Get completed sets for the most recent session
      const sets = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q
            .eq("userId", args.userId)
            .eq("workoutLogExerciseClientId", mostRecentLogEx.clientId)
        )
        .collect();

      const completedSets = sets
        .filter((s) => s.completed)
        .slice(0, 5)
        .map((s) => ({
          ...(s.reps !== undefined && { reps: s.reps }),
          ...(s.weight !== undefined && { weight: s.weight }),
          ...(s.time !== undefined && { time: s.time }),
          ...(s.distance !== undefined && { distance: s.distance }),
        }));

      if (completedSets.length > 0) {
        exerciseHistory.push({
          name: exercise.name,
          type: exercise.type,
          lastUsed: mostRecentDate.split("T")[0],
          recentSets: completedSets,
        });
      }
    }

    // 7. Active plan
    const plans = await ctx.db
      .query("workoutPlans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const activePlan = plans.find((p) => p.status === "active");
    let activePlanContext = null;

    if (activePlan) {
      const planDays = await ctx.db
        .query("planDays")
        .withIndex("by_plan", (q) =>
          q
            .eq("userId", args.userId)
            .eq("planClientId", activePlan.clientId)
        )
        .collect();

      const completedDays = planDays.filter(
        (d) => d.status === "completed"
      ).length;
      const totalDays = planDays.filter(
        (d) => d.status !== "rest"
      ).length;

      // Estimate current week based on start date
      const startDate = new Date(activePlan.startDate);
      const daysSinceStart = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentWeek = Math.min(
        Math.max(1, Math.ceil(daysSinceStart / 7)),
        activePlan.durationWeeks
      );

      // Build template name map for plan day resolution
      const templateNameMap = new Map(
        templates.map((t) => [t.clientId, t.name])
      );

      activePlanContext = {
        clientId: activePlan.clientId,
        name: activePlan.name,
        goal: activePlan.goal,
        durationWeeks: activePlan.durationWeeks,
        startDate: activePlan.startDate,
        currentWeek,
        completedDays,
        totalDays,
        days: planDays
          .filter((d) => d.status !== "rest")
          .map((d) => ({
            week: d.week,
            dayOfWeek: d.dayOfWeek,
            templateName: d.templateClientId
              ? templateNameMap.get(d.templateClientId) ?? "Unknown"
              : undefined,
            label: d.label,
            status: d.status as string,
          })),
      };
    }

    return {
      settings: settings
        ? {
            weightUnit: settings.weightUnit,
            distanceUnit: settings.distanceUnit,
            defaultRestTime: settings.defaultRestTime,
          }
        : { weightUnit: "kg", distanceUnit: "km", defaultRestTime: 90 },
      exercises: exercises.map((e) => ({ name: e.name, type: e.type })),
      templates: templatesWithExercises,
      recentLogs,
      exerciseHistory,
      stats: {
        totalWorkouts,
        workoutsPerWeek,
        currentStreak: streak,
      },
      activePlan: activePlanContext,
    };
  },
});

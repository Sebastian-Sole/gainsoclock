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

    // Batch-fetch ALL templateExercises for this user at once (avoids N+1)
    const allTemplateExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("userId", args.userId))
      .collect();

    // Group templateExercises by templateClientId in memory
    const templateExercisesByTemplate = new Map<string, typeof allTemplateExercises>();
    for (const te of allTemplateExercises) {
      const group = templateExercisesByTemplate.get(te.templateClientId);
      if (group) {
        group.push(te);
      } else {
        templateExercisesByTemplate.set(te.templateClientId, [te]);
      }
    }

    const templatesWithExercises = templates.slice(-10).map((template) => {
      const templateExercises = templateExercisesByTemplate.get(template.clientId) ?? [];
      templateExercises.sort((a, b) => a.order - b.order);

      return {
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
      };
    });

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
    // Batch-fetch ALL workoutLogExercises and workoutSets for this user (avoids N+1)
    const allLogExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_exercise", (q) => q.eq("userId", args.userId))
      .collect();

    const allSets = await ctx.db
      .query("workoutSets")
      .withIndex("by_workout_exercise", (q) => q.eq("userId", args.userId))
      .collect();

    // Group logExercises by exerciseClientId in memory
    const logExercisesByExercise = new Map<string, typeof allLogExercises>();
    for (const le of allLogExercises) {
      const group = logExercisesByExercise.get(le.exerciseClientId);
      if (group) {
        group.push(le);
      } else {
        logExercisesByExercise.set(le.exerciseClientId, [le]);
      }
    }

    // Group sets by workoutLogExerciseClientId in memory
    const setsByLogExercise = new Map<string, typeof allSets>();
    for (const s of allSets) {
      const group = setsByLogExercise.get(s.workoutLogExerciseClientId);
      if (group) {
        group.push(s);
      } else {
        setsByLogExercise.set(s.workoutLogExerciseClientId, [s]);
      }
    }

    // Build a map from workoutLog clientId -> completedAt for quick lookup
    const logDateMap = new Map(allLogs.map((l) => [l.clientId, l.completedAt]));

    const exerciseHistory: {
      name: string;
      type: string;
      lastUsed: string;
      recentSets: { reps?: number; weight?: number; time?: number; distance?: number }[];
    }[] = [];

    for (const exercise of exercises.slice(0, 20)) {
      const logExercises = logExercisesByExercise.get(exercise.clientId);
      if (!logExercises || logExercises.length === 0) continue;

      // Find the most recent log exercise by looking up its parent workout log date
      let mostRecentLogEx = logExercises[logExercises.length - 1];
      let mostRecentDate = "";

      for (const le of logExercises.slice(-5)) {
        const completedAt = logDateMap.get(le.workoutLogClientId);
        if (completedAt && completedAt > mostRecentDate) {
          mostRecentDate = completedAt;
          mostRecentLogEx = le;
        }
      }

      // Get completed sets for the most recent session from in-memory map
      const sets = setsByLogExercise.get(mostRecentLogEx.clientId) ?? [];

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

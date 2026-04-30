import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  goalValidator,
  experienceValidator,
  consentPurposeValidator,
  dataSourceValidator,
  biologicalSexValidator,
} from "./validators";

const GOAL_SET = new Set(["stronger", "leaner", "healthier", "routine"]);

function assertBounds(args: {
  goals: Array<string>;
  primaryGoal: string;
  trainingDaysOfWeek: Array<number>;
  ageYears?: number;
  weightKg?: number;
  heightCm?: number;
  bodyFatPercent?: number;
}) {
  if (args.goals.length < 1 || args.goals.length > 4) {
    throw new Error("onboarding/goals_out_of_range");
  }
  if (!GOAL_SET.has(args.primaryGoal)) {
    throw new Error("onboarding/primary_goal_invalid");
  }
  if (!args.goals.includes(args.primaryGoal)) {
    throw new Error("onboarding/primary_goal_not_in_goals");
  }
  if (
    args.trainingDaysOfWeek.length < 1 ||
    args.trainingDaysOfWeek.length > 7
  ) {
    throw new Error("onboarding/training_days_out_of_range");
  }
  for (const d of args.trainingDaysOfWeek) {
    if (!Number.isInteger(d) || d < 0 || d > 6) {
      throw new Error("onboarding/training_day_invalid");
    }
  }
  if (args.ageYears !== undefined) {
    if (!Number.isFinite(args.ageYears) || args.ageYears < 16 || args.ageYears > 100) {
      // AI-Safety #4 + #7: 16+ gate enforced server-side.
      throw new Error("onboarding/age_gate");
    }
  }
  if (args.weightKg !== undefined) {
    if (!Number.isFinite(args.weightKg) || args.weightKg < 30 || args.weightKg > 250) {
      throw new Error("onboarding/weight_out_of_range");
    }
  }
  if (args.heightCm !== undefined) {
    if (!Number.isFinite(args.heightCm) || args.heightCm < 120 || args.heightCm > 230) {
      throw new Error("onboarding/height_out_of_range");
    }
  }
  if (args.bodyFatPercent !== undefined) {
    if (
      !Number.isFinite(args.bodyFatPercent) ||
      args.bodyFatPercent < 3 ||
      args.bodyFatPercent > 60
    ) {
      throw new Error("onboarding/bodyfat_out_of_range");
    }
  }
}

export const completeOnboardingV2 = mutation({
  args: {
    clientIntakeId: v.string(),
    goals: v.array(goalValidator),
    primaryGoal: goalValidator,
    experience: experienceValidator,
    trainingDaysOfWeek: v.array(v.number()),
    ageYears: v.optional(v.number()),
    biologicalSex: v.optional(biologicalSexValidator),
    weightKg: v.optional(v.number()),
    heightCm: v.optional(v.number()),
    bodyFatPercent: v.optional(v.number()),
    dataSource: dataSourceValidator,
    consents: v.object({
      health_data_personalization: v.boolean(),
      ai_coach_inference: v.boolean(),
      analytics: v.boolean(),
    }),
    consentVersionHash: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    assertBounds({
      goals: args.goals,
      primaryGoal: args.primaryGoal,
      trainingDaysOfWeek: args.trainingDaysOfWeek,
      ageYears: args.ageYears,
      weightKg: args.weightKg,
      heightCm: args.heightCm,
      bodyFatPercent: args.bodyFatPercent,
    });

    const now = new Date().toISOString();

    const existingProfile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // Replay dedupe: same clientIntakeId as the row on file → no-op return.
    if (
      existingProfile &&
      args.clientIntakeId &&
      existingProfile.clientIntakeId === args.clientIntakeId
    ) {
      return { profileId: existingProfile._id, consentsWritten: 0 };
    }

    let profileId;
    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        clientIntakeId: args.clientIntakeId,
        goals: args.goals,
        primaryGoal: args.primaryGoal,
        experience: args.experience,
        trainingDaysOfWeek: args.trainingDaysOfWeek,
        ageYears: args.ageYears,
        biologicalSex: args.biologicalSex,
        weightKg: args.weightKg,
        heightCm: args.heightCm,
        bodyFatPercent: args.bodyFatPercent,
        dataSource: args.dataSource,
        updatedAt: now,
      });
      profileId = existingProfile._id;
    } else {
      profileId = await ctx.db.insert("userProfile", {
        userId,
        clientIntakeId: args.clientIntakeId,
        goals: args.goals,
        primaryGoal: args.primaryGoal,
        experience: args.experience,
        trainingDaysOfWeek: args.trainingDaysOfWeek,
        ageYears: args.ageYears,
        biologicalSex: args.biologicalSex,
        weightKg: args.weightKg,
        heightCm: args.heightCm,
        bodyFatPercent: args.bodyFatPercent,
        dataSource: args.dataSource,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Security CR4: consent rows are append-only. Record all three purposes.
    const purposes = [
      "health_data_personalization",
      "ai_coach_inference",
      "analytics",
    ] as const;
    for (const purpose of purposes) {
      await ctx.db.insert("userConsents", {
        userId,
        purpose,
        granted: args.consents[purpose],
        version: args.consentVersionHash,
        grantedAt: now,
        clientIntakeId: args.clientIntakeId,
      });
    }

    const onboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (onboarding) {
      await ctx.db.patch(onboarding._id, {
        hasCompletedOnboarding: true,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOnboarding", {
        userId,
        hasCompletedOnboarding: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { profileId, consentsWritten: purposes.length };
  },
});

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

type ConsentSnapshot = {
  granted: boolean;
  grantedAt: string;
  version: string;
} | null;

export const getConsents = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    health_data_personalization: ConsentSnapshot;
    ai_coach_inference: ConsentSnapshot;
    analytics: ConsentSnapshot;
  } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const purposes = [
      "health_data_personalization",
      "ai_coach_inference",
      "analytics",
    ] as const;

    const result: {
      health_data_personalization: ConsentSnapshot;
      ai_coach_inference: ConsentSnapshot;
      analytics: ConsentSnapshot;
    } = {
      health_data_personalization: null,
      ai_coach_inference: null,
      analytics: null,
    };

    for (const purpose of purposes) {
      const latest = await ctx.db
        .query("userConsents")
        .withIndex("by_user_purpose_grantedAt", (q) =>
          q.eq("userId", userId).eq("purpose", purpose)
        )
        .order("desc")
        .first();
      if (latest) {
        result[purpose] = {
          granted: latest.granted,
          grantedAt: latest.grantedAt,
          version: latest.version,
        };
      }
    }
    return result;
  },
});

export const withdrawConsent = mutation({
  args: { purpose: consentPurposeValidator },
  handler: async (ctx, { purpose }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const latest = await ctx.db
      .query("userConsents")
      .withIndex("by_user_purpose_grantedAt", (q) =>
        q.eq("userId", userId).eq("purpose", purpose)
      )
      .order("desc")
      .first();

    const now = new Date().toISOString();
    // Append-only log (Security CR4): even a withdrawal is a new row.
    await ctx.db.insert("userConsents", {
      userId,
      purpose,
      granted: false,
      version: latest?.version ?? "0",
      grantedAt: now,
      revokedAt: now,
    });

    if (purpose === "ai_coach_inference") {
      const ahaRows = await ctx.db
        .query("onboardingAha")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const row of ahaRows) {
        if (row.status !== "failed") {
          await ctx.db.patch(row._id, {
            status: "failed",
            error: "consent_revoked",
            updatedAt: now,
          });
        }
      }
    }

    if (purpose === "health_data_personalization") {
      await ctx.scheduler.runAfter(
        0,
        internal.onboardingInternal.scheduleProfileErasure,
        { userId }
      );
    }

    if (purpose === "analytics") {
      // Fire-and-forget PostHog erasure so network failures don't block the
      // mutation (HealthKit-Privacy C4). The client also calls `optOut()`.
      await ctx.scheduler.runAfter(
        0,
        internal.posthogServer.deletePostHogUser,
        { distinctId: userId }
      );
    }
  },
});

// Patches the current userProfile with stats collected from HealthKit or a
// manual follow-up. Used by the day-3 re-ask card (plan-09 mounts it) and by
// the Settings HealthKit toggle (plan-08). Sanity-bounded server-side.
export const updateHealthStats = mutation({
  args: {
    weightKg: v.optional(v.number()),
    heightCm: v.optional(v.number()),
    bodyFatPercent: v.optional(v.number()),
    dataSource: dataSourceValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.weightKg !== undefined) {
      if (
        !Number.isFinite(args.weightKg) ||
        args.weightKg < 30 ||
        args.weightKg > 250
      ) {
        throw new Error("onboarding/weight_out_of_range");
      }
    }
    if (args.heightCm !== undefined) {
      if (
        !Number.isFinite(args.heightCm) ||
        args.heightCm < 120 ||
        args.heightCm > 230
      ) {
        throw new Error("onboarding/height_out_of_range");
      }
    }
    if (args.bodyFatPercent !== undefined) {
      if (
        !Number.isFinite(args.bodyFatPercent) ||
        args.bodyFatPercent < 3 ||
        args.bodyFatPercent > 60
      ) {
        throw new Error("onboarding/bodyfat_out_of_range");
      }
    }

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("onboarding/profile_missing");

    const now = new Date().toISOString();
    await ctx.db.patch(profile._id, {
      ...(args.weightKg !== undefined ? { weightKg: args.weightKg } : {}),
      ...(args.heightCm !== undefined ? { heightCm: args.heightCm } : {}),
      ...(args.bodyFatPercent !== undefined
        ? { bodyFatPercent: args.bodyFatPercent }
        : {}),
      dataSource: args.dataSource,
      updatedAt: now,
    });

    return { profileId: profile._id };
  },
});

export const getAha = query({
  args: { generationId: v.string() },
  handler: async (ctx, { generationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("onboardingAha")
      .withIndex("by_user_generationId", (q) =>
        q.eq("userId", userId).eq("generationId", generationId)
      )
      .unique();
  },
});

// Foreground recovery entry point: client calls this when S7's p99 hard-kill
// fires or the user taps Retry. Schedules the internal aha action which
// re-runs idempotently by `generationId`.
export const rekickAha = mutation({
  args: { generationId: v.string() },
  handler: async (ctx, { generationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.scheduler.runAfter(
      0,
      internal.onboardingActions.runAhaGeneration,
      { userId, generationId }
    );
  },
});

// Apple 5.1.1(v) + GDPR Art. 17 cascade. Deletes every table a user owns.
// Paginates on Convex limits; the client's delete-account screen also
// performs the HealthKit externalUUID cleanup when `clientCleanupHint.healthkit`
// is returned.
// Public entry point — kicks off an async cascade that paginates through
// every owned row. Returns immediately so the client can sign out without
// waiting on possibly-thousands of rows, and without the single-mutation
// 4096-read limit biting users with lots of history.
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.scheduler.runAfter(
      0,
      internal.onboarding.deleteAccountCascade,
      { userId }
    );

    return { clientCleanupHint: { healthkit: true } };
  },
});

// Internal cascade — deletes up to DELETE_BATCH rows from each heavy table
// per invocation, then either reschedules (more work) or finishes by
// deleting the light `by_user` tables + user row + PostHog erasure.
const DELETE_BATCH = 300;

export const deleteAccountCascade = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    let moreWork = false;

    // Heavy tables — nested under parents. Use first-field indexes to page.
    const sets = await ctx.db
      .query("workoutSets")
      .withIndex("by_exercise", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const s of sets) await ctx.db.delete(s._id);
    if (sets.length === DELETE_BATCH) moreWork = true;

    const logExs = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_workout", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const le of logExs) await ctx.db.delete(le._id);
    if (logExs.length === DELETE_BATCH) moreWork = true;

    const tplExs = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const t of tplExs) await ctx.db.delete(t._id);
    if (tplExs.length === DELETE_BATCH) moreWork = true;

    const planDays = await ctx.db
      .query("planDays")
      .withIndex("by_plan", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const d of planDays) await ctx.db.delete(d._id);
    if (planDays.length === DELETE_BATCH) moreWork = true;

    const msgs = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const m of msgs) await ctx.db.delete(m._id);
    if (msgs.length === DELETE_BATCH) moreWork = true;

    if (moreWork) {
      await ctx.scheduler.runAfter(
        0,
        internal.onboarding.deleteAccountCascade,
        { userId }
      );
      return;
    }

    // All heavy tables drained. Clean up the light `by_user` tables.
    const byUserTables = [
      "workoutLogs",
      "templates",
      "exercises",
      "userSettings",
      "recipes",
      "mealLogs",
      "nutritionGoals",
      "userOnboarding",
      "userProfile",
      "userSubscriptions",
      "workoutPlans",
      "chatConversations",
      "onboardingAha",
    ] as const;
    for (const table of byUserTables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH);
      for (const r of rows) await ctx.db.delete(r._id);
    }

    const consents = await ctx.db
      .query("userConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const c of consents) await ctx.db.delete(c._id);

    const incidents = await ctx.db
      .query("aiSafetyIncidents")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const i of incidents) await ctx.db.delete(i._id);

    // @convex-dev/auth housekeeping — must delete before the users row so the
    // Password + SIWA providers don't fail with "Cannot read _id of null"
    // when the same email signs up again against an orphaned authAccount.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const session of sessions) {
      const refreshes = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .take(DELETE_BATCH);
      for (const r of refreshes) await ctx.db.delete(r._id);
      await ctx.db.delete(session._id);
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(DELETE_BATCH);
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .take(DELETE_BATCH);
      for (const c of codes) await ctx.db.delete(c._id);
      await ctx.db.delete(account._id);
    }

    // User row last — idempotent. A replay of the cascade (e.g. after a
    // client retry) may find the row already gone; that's fine.
    const userRow = await ctx.db.get(userId);
    if (userRow !== null) {
      await ctx.db.delete(userId);
    }

    // Best-effort PostHog erasure (scheduled so network failures don't
    // orphan the deletion).
    await ctx.scheduler.runAfter(
      0,
      internal.posthogServer.deletePostHogUser,
      { distinctId: userId }
    );
  },
});

// One-shot orphan cleanup — call via `npx convex run onboarding:cleanupOrphanAuthForEmail '{"email":"foo@bar.com"}'`
// to remove stuck authAccounts/authSessions/authRefreshTokens/authVerificationCodes
// for an email whose user row is already gone. Fixes the post-delete-signup
// crash from `@convex-dev/auth/src/providers/Password.ts` when a previous
// delete didn't cascade the auth tables.
export const cleanupOrphanAuthForEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email)
      )
      .collect();

    let removedAccounts = 0;
    let removedSessions = 0;
    for (const account of accounts) {
      const userRow = await ctx.db.get(account.userId);
      if (userRow !== null) continue; // real account — leave alone

      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const c of codes) await ctx.db.delete(c._id);

      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", account.userId))
        .collect();
      for (const session of sessions) {
        const refreshes = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        for (const r of refreshes) await ctx.db.delete(r._id);
        await ctx.db.delete(session._id);
        removedSessions += 1;
      }

      await ctx.db.delete(account._id);
      removedAccounts += 1;
    }

    return { email, removedAccounts, removedSessions };
  },
});

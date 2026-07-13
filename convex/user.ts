import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { APPLE_RELAY_DOMAIN } from "./auth";

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const onboarding = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const nowMs = Date.now();
    const userDoc = await ctx.db.get(userId);
    const userCreationMs = userDoc?._creationTime ?? nowMs;
    const isLikelyNewUser = nowMs - userCreationMs < 5 * 60 * 1000;

    const hasCompletedOnboarding = onboarding
      ? onboarding.hasCompletedOnboarding
      : !isLikelyNewUser;

    const profile = await ctx.db
      .query("userProfile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const purposes = [
      "health_data_personalization",
      "ai_coach_inference",
      "analytics",
    ] as const;

    type ConsentSnapshot = {
      granted: boolean;
      grantedAt: string;
      version: string;
    } | null;

    const consents: {
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
        consents[purpose] = {
          granted: latest.granted,
          grantedAt: latest.grantedAt,
          version: latest.version,
        };
      }
    }

    return {
      hasCompletedOnboarding,
      profile: profile ?? null,
      consents,
    };
  },
});

// Marks the current user's onboarding as complete. Called from the demo-
// only onboarding flow's paywall exit (regardless of purchase outcome —
// soft paywall). Idempotent: re-calling on an already-complete user is a
// no-op other than bumping `updatedAt`.
export const markOnboardingComplete = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = new Date().toISOString();
    if (existing) {
      if (!existing.hasCompletedOnboarding) {
        await ctx.db.patch(existing._id, {
          hasCompletedOnboarding: true,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("userOnboarding", {
        userId,
        hasCompletedOnboarding: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Dev/QA helper — flips `hasCompletedOnboarding` back to false so the
// next route guard cycle re-enters the onboarding flow without needing
// to delete and recreate the account. Safe in production (only callable
// while authenticated); the Settings button that drives it is `__DEV__`-
// gated client-side.
export const resetOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        hasCompletedOnboarding: false,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userOnboarding", {
        userId,
        hasCompletedOnboarding: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const markOnboardingPendingIfUnset = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) return;

    const userDoc = await ctx.db.get(userId);
    const nowMs = Date.now();
    const userCreationMs = userDoc?._creationTime ?? nowMs;
    // If this account was created very recently, treat it as a new signup.
    const isLikelyNewUser = nowMs - userCreationMs < 5 * 60 * 1000;

    const now = new Date(nowMs).toISOString();
    await ctx.db.insert("userOnboarding", {
      userId,
      hasCompletedOnboarding: !isLikelyNewUser,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Internal mutation that deletes a batch of documents from a table.
// Returns true if there are more documents to delete.
export const deleteUserDataBatch = internalMutation({
  args: {
    userId: v.id("users"),
    table: v.string(),
    indexName: v.string(),
  },
  handler: async (ctx, { userId, table, indexName }) => {
    const BATCH_SIZE = 500;
    const docs = await (ctx.db as any)
      .query(table)
      .withIndex(indexName, (q: any) => q.eq("userId", userId))
      .take(BATCH_SIZE);
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return docs.length === BATCH_SIZE;
  },
});

// Internal mutation to delete workout sets for a batch of exercises.
export const deleteWorkoutSetsBatch = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const BATCH_SIZE = 200;
    const logExercises = await ctx.db
      .query("workoutLogExercises")
      .withIndex("by_workout", (q) => q.eq("userId", userId))
      .take(BATCH_SIZE);

    for (const le of logExercises) {
      const sets = await ctx.db
        .query("workoutSets")
        .withIndex("by_workout_exercise", (q) =>
          q.eq("userId", userId).eq("workoutLogExerciseClientId", le.clientId)
        )
        .collect();
      for (const s of sets) {
        await ctx.db.delete(s._id);
      }
      await ctx.db.delete(le._id);
    }
    return logExercises.length === BATCH_SIZE;
  },
});

export const getAuthUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

// Public action that orchestrates batched deletion across all tables.
export const deleteAllData = action({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("Not authenticated");

    // Delete workout sets + exercises first (nested relationship)
    let hasMore = true;
    while (hasMore) {
      hasMore = await ctx.runMutation(internal.user.deleteWorkoutSetsBatch, {
        userId,
      });
    }

    // Tables to delete with their index names
    const tables: { table: string; indexName: string }[] = [
      { table: "workoutLogs", indexName: "by_user" },
      { table: "templateExercises", indexName: "by_template" },
      { table: "templates", indexName: "by_user" },
      { table: "exercises", indexName: "by_user" },
      { table: "userSettings", indexName: "by_user" },
      { table: "recipes", indexName: "by_user" },
      { table: "mealLogs", indexName: "by_user" },
      { table: "nutritionGoals", indexName: "by_user" },
      { table: "userOnboarding", indexName: "by_user" },
      { table: "userSubscriptions", indexName: "by_user" },
      { table: "chatMessages", indexName: "by_conversation" },
      { table: "chatConversations", indexName: "by_user" },
      { table: "workoutPlans", indexName: "by_user" },
      { table: "planDays", indexName: "by_plan" },
    ];

    for (const { table, indexName } of tables) {
      let hasMore = true;
      while (hasMore) {
        hasMore = await ctx.runMutation(internal.user.deleteUserDataBatch, {
          userId,
          table,
          indexName,
        });
      }
    }
  },
});

// --- Account management (issue #106): display name + password changes ------
//
// Email change lives in `convex/emailChange.ts`, NOT here. In
// `@convex-dev/auth@0.0.90` the email address IS the password authAccount's
// `providerAccountId` (its primary lookup key) — the library exposes
// `modifyAccountCredentials` for the secret only, and no supported API to
// re-key an account. Naively swapping `authAccounts.providerAccountId` +
// `users.email` would activate an unverified address — an account-takeover
// vector. `emailChange.ts` therefore re-keys only AFTER a verify-before-
// activate flow: re-auth with the current password, email a one-time link to
// the NEW address (`convex/email.ts`), and swap on confirmation via the route
// in `convex/http.ts`. Re-check on any auth-package upgrade (docs/auth-upgrade.md).

const MAX_NAME_LENGTH = 80;

// Matches the Password provider's default `validatePasswordRequirements`
// (non-empty, >= 8 chars) and the sign-up screen's client-side rule
// (app/(auth)/sign-up.tsx). Keep the three in sync.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Account info for the Settings → Account screen: profile fields plus which
 * auth methods this user actually has, so the UI can hide the password
 * section for OAuth-only accounts and never render a broken form.
 */
export const getAccountInfo = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      /** True when a `password` authAccount exists — gates the password UI. */
      hasPassword: v.boolean(),
      /** Hide-My-Email relay address — the email row is hidden for these. */
      isAppleRelay: v.boolean(),
      /** Provider ids: "password" | "google" | "apple-native". */
      providers: v.array(v.string()),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const providers = accounts.map((a) => a.provider);

    return {
      ...(user.name !== undefined ? { name: user.name } : {}),
      ...(user.email !== undefined ? { email: user.email } : {}),
      hasPassword: providers.includes("password"),
      isAppleRelay: user.email?.endsWith(APPLE_RELAY_DOMAIN) ?? false,
      providers,
    };
  },
});

/**
 * Update the signed-in user's display name on the `users` doc.
 * Returns a status literal instead of throwing: plain `Error` messages are
 * scrubbed to "Server Error" in production (see convex/accountLinking.ts).
 */
export const updateName = mutation({
  args: { name: v.string() },
  returns: v.union(v.literal("ok"), v.literal("invalid_name")),
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("not_authenticated");

    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      return "invalid_name";
    }

    await ctx.db.patch(userId, { name: trimmed });
    return "ok";
  },
});

/**
 * The `providerAccountId` (email) of the caller's password authAccount, or
 * null when the user has no password credential. `retrieveAccount` /
 * `modifyAccountCredentials` are keyed by (provider, account id), so the
 * change-password action needs this lookup — the account id is the email the
 * user signed up with, which can differ in case from `users.email`.
 */
export const getPasswordAccountEmail = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password")
      )
      .first();
    return account?.providerAccountId ?? null;
  },
});

/**
 * Change the signed-in user's password.
 *
 * Runs in an action because `retrieveAccount` / `modifyAccountCredentials` /
 * `invalidateSessions` are action-ctx helpers (they call through the
 * `auth:store` mutation and the Password provider's Scrypt crypto).
 *
 * Flow: verify the CURRENT password via `retrieveAccount` (rate-limited by
 * the library — repeated wrong guesses return `too_many_attempts`), then
 * store the new secret via `modifyAccountCredentials`, then invalidate every
 * OTHER session so a stolen device can't keep riding the old credential.
 *
 * Returns a status literal instead of throwing: plain `Error` messages are
 * scrubbed to "Server Error" in production, which would break inline error
 * copy on the client (same rationale as `checkEmailExists` in
 * convex/accountLinking.ts).
 */
export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  returns: v.union(
    v.literal("ok"),
    v.literal("wrong_password"),
    v.literal("invalid_new_password"),
    v.literal("no_password_account"),
    v.literal("too_many_attempts")
  ),
  // Explicit return type: this handler calls `internal.user.*` from its own
  // module — without the annotation TS can hit the circular-inference
  // bail-out that poisons the generated `api` type (see accountLinking.ts).
  handler: async (
    ctx,
    { currentPassword, newPassword }
  ): Promise<
    | "ok"
    | "wrong_password"
    | "invalid_new_password"
    | "no_password_account"
    | "too_many_attempts"
  > => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("not_authenticated");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return "invalid_new_password";
    }

    // The account id for the Password provider is the email the user signed
    // up with (the authAccounts row's providerAccountId), not users.email.
    const accountEmail: string | null = await ctx.runQuery(
      internal.user.getPasswordAccountEmail,
      { userId }
    );
    if (accountEmail === null) {
      // OAuth-only account — the UI hides this section, but never trust it.
      return "no_password_account";
    }

    try {
      const retrieved = await retrieveAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: accountEmail, secret: currentPassword },
      });
      // Defense in depth: the email came from the caller's own authAccounts
      // row, so this can only mismatch if something is deeply wrong.
      if (retrieved.user._id !== userId) {
        return "no_password_account";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("InvalidSecret")) return "wrong_password";
      if (message.includes("TooManyFailedAttempts")) {
        return "too_many_attempts";
      }
      if (message.includes("InvalidAccountId")) return "no_password_account";
      throw err;
    }

    await modifyAccountCredentials<DataModel>(ctx, {
      provider: "password",
      account: { id: accountEmail, secret: newPassword },
    });

    // Sign out every other session; keep the one that just proved it knows
    // the (old) password. `getAuthSessionId` is null only in exotic states —
    // then we invalidate everything and the client re-authenticates.
    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions<DataModel>(ctx, {
      userId,
      except: sessionId ? [sessionId] : [],
    });

    return "ok";
  },
});

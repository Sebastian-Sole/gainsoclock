import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
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

// --- Account management (issues #106/#123): name, password, email ----------
//
// In `@convex-dev/auth@0.0.90` the email address IS the password
// authAccount's `providerAccountId` (its primary lookup key) — the library
// exposes `modifyAccountCredentials` for the secret only, and no supported
// API to re-key an account. The only sanctioned email flows are the Password
// provider's `reset`/`verify` OTP sub-providers, which this app doesn't
// configure. Hand-editing `authAccounts.providerAccountId` + `users.email`
// without verification would activate an unverified address — an
// account-takeover vector.
//
// Email change (issue #123) therefore ships as verify-before-activate: the
// user re-authenticates with their current password, we store a pending
// `emailChangeRequests` row (hashed code, 15 min TTL, attempt- and
// send-rate-limited) and email a code to the NEW address via
// `convex/email.ts`. Only on a correct code does `consumeEmailChangeRequest`
// re-key the password authAccount + patch `users.email`, atomically in one
// mutation. Pending requests are invalidated on password change.
// Re-check on any auth-package upgrade (see docs/auth-upgrade.md).

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

    // A pending email change was authorized by the OLD password — kill it so
    // a code already in flight can't finalize after the credential rotates.
    await ctx.runMutation(internal.user.clearEmailChangeRequests, { userId });

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

// --- Email change (issue #123): verify-before-activate ----------------------

/** Verification codes die after 15 minutes. */
const EMAIL_CHANGE_CODE_TTL_MS = 15 * 60 * 1000;
/** Wrong-code guesses allowed before the pending request is destroyed. */
const EMAIL_CHANGE_MAX_ATTEMPTS = 5;
/** Codes emailed per rate window (initiations + resends combined). */
const EMAIL_CHANGE_MAX_SENDS = 3;
/** Send-rate window; also the max age at which a request can be resent. */
const EMAIL_CHANGE_SEND_WINDOW_MS = 60 * 60 * 1000;
// Mirrors the sign-up screen's client-side rule (app/(auth)/sign-up.tsx).
const EMAIL_CHANGE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Six crypto-random digits, rejection-sampled so each digit is uniform. */
function generateEmailChangeCode(): string {
  const digits: number[] = [];
  const buf = new Uint8Array(16);
  while (digits.length < 6) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      // 250 = largest multiple of 10 that fits in a byte — reject the rest.
      if (byte < 250 && digits.length < 6) digits.push(byte % 10);
    }
  }
  return digits.join("");
}

/** 16 crypto-random bytes, hex-encoded. */
function generateEmailChangeSalt(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256(`${salt}:${code}`), hex. The plaintext code lives only in the
 * action that generated it and in the verification email — never in the DB
 * or logs. (A 6-digit space is trivially brute-forceable offline regardless
 * of hashing; the real guards are the 15 min TTL, the 5-attempt cap, and
 * single-use consumption. Hashing keeps a casual DB read from being enough.)
 */
async function hashEmailChangeCode(
  salt: string,
  code: string
): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Is `email` already claimed by a DIFFERENT user? Checks both the password
 * authAccounts keyspace (lookup key for sign-in) and `users.email` (which
 * OAuth providers also populate). Runs inside `consumeEmailChangeRequest`'s
 * transaction too: Convex records the scanned index ranges in the read set,
 * so two users finalizing the same email concurrently conflict and retry —
 * the second sees the first's row and bails (same argument as
 * `attachAppleAccount` in convex/accountLinking.ts).
 */
async function emailTakenByOther(
  ctx: { db: MutationCtx["db"] | QueryCtx["db"] },
  email: string,
  userId: Id<"users">
): Promise<boolean> {
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", email)
    )
    .unique();
  if (account && account.userId !== userId) return true;

  const holders = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .collect();
  return holders.some((u) => u._id !== userId);
}

export const emailTakenByOtherUser = internalQuery({
  args: { email: v.string(), userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { email, userId }) =>
    emailTakenByOther(ctx, email, userId),
});

/**
 * Create-or-replace the caller's single pending email change. The send-rate
 * window (max 3 codes/hour) is carried across replacements so re-initiating
 * can't be used to spam arbitrary inboxes.
 */
export const upsertEmailChangeRequest = internalMutation({
  args: {
    userId: v.id("users"),
    newEmail: v.string(),
    codeHash: v.string(),
    salt: v.string(),
  },
  returns: v.union(v.literal("ok"), v.literal("rate_limited")),
  handler: async (ctx, { userId, newEmail, codeHash, salt }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    let sendCount = 1;
    let windowStartedAt = now;
    if (existing && now - existing.windowStartedAt < EMAIL_CHANGE_SEND_WINDOW_MS) {
      if (existing.sendCount >= EMAIL_CHANGE_MAX_SENDS) return "rate_limited";
      sendCount = existing.sendCount + 1;
      windowStartedAt = existing.windowStartedAt;
    }

    const fields = {
      userId,
      newEmail,
      codeHash,
      salt,
      createdAt: now,
      expiresAt: now + EMAIL_CHANGE_CODE_TTL_MS,
      attempts: 0,
      sendCount,
      windowStartedAt,
    };
    if (existing) {
      await ctx.db.replace(existing._id, fields);
    } else {
      await ctx.db.insert("emailChangeRequests", fields);
    }
    return "ok";
  },
});

/**
 * Re-arm the caller's pending request with a fresh code (Resend button).
 * No password re-auth here: the pending row itself proves a recent re-auth,
 * and rows older than the send window are deleted instead — forcing a fresh
 * `initiateEmailChange` (and therefore a fresh password check).
 */
export const refreshEmailChangeCode = internalMutation({
  args: {
    userId: v.id("users"),
    codeHash: v.string(),
    salt: v.string(),
  },
  returns: v.union(
    v.literal("no_pending"),
    v.literal("rate_limited"),
    v.object({ newEmail: v.string() })
  ),
  handler: async (ctx, { userId, codeHash, salt }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing) return "no_pending";
    if (now - existing.createdAt > EMAIL_CHANGE_SEND_WINDOW_MS) {
      await ctx.db.delete(existing._id);
      return "no_pending";
    }

    let sendCount = 1;
    let windowStartedAt = now;
    if (now - existing.windowStartedAt < EMAIL_CHANGE_SEND_WINDOW_MS) {
      if (existing.sendCount >= EMAIL_CHANGE_MAX_SENDS) return "rate_limited";
      sendCount = existing.sendCount + 1;
      windowStartedAt = existing.windowStartedAt;
    }

    await ctx.db.patch(existing._id, {
      codeHash,
      salt,
      expiresAt: now + EMAIL_CHANGE_CODE_TTL_MS,
      attempts: 0,
      sendCount,
      windowStartedAt,
    });
    return { newEmail: existing.newEmail };
  },
});

/** Salt for hashing the user-supplied code; null when nothing is pending. */
export const getPendingEmailChange = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.object({ salt: v.string() })),
  handler: async (ctx, { userId }) => {
    const request = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return request ? { salt: request.salt } : null;
  },
});

/**
 * The atomic core of the flow: attempt counting, code comparison, and — on a
 * match — the authAccount re-key + `users.email` swap all commit in ONE
 * transaction, so a request can never be consumed twice and the two email
 * fields can never diverge.
 */
export const consumeEmailChangeRequest = internalMutation({
  args: { userId: v.id("users"), codeHash: v.string() },
  returns: v.union(
    v.literal("ok"),
    v.literal("invalid_code"),
    v.literal("expired"),
    v.literal("too_many_attempts"),
    v.literal("no_pending"),
    v.literal("email_in_use"),
    v.literal("no_password_account")
  ),
  handler: async (ctx, { userId, codeHash }) => {
    const now = Date.now();
    const request = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // Keyed by the authenticated caller's own userId, so a request can only
    // ever be consumed by the user it belongs to.
    if (!request) return "no_pending";

    if (now > request.expiresAt) {
      await ctx.db.delete(request._id);
      return "expired";
    }
    if (request.attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) {
      await ctx.db.delete(request._id);
      return "too_many_attempts";
    }
    if (request.codeHash !== codeHash) {
      const attempts = request.attempts + 1;
      if (attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) {
        await ctx.db.delete(request._id);
        return "too_many_attempts";
      }
      await ctx.db.patch(request._id, { attempts });
      return "invalid_code";
    }

    // Code verified — re-check uniqueness inside this transaction (someone
    // may have claimed the address since initiation).
    if (await emailTakenByOther(ctx, request.newEmail, userId)) {
      await ctx.db.delete(request._id);
      return "email_in_use";
    }

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "password")
      )
      .first();
    if (!account) {
      // Password account vanished since initiation (e.g. account deletion
      // race) — nothing to re-key.
      await ctx.db.delete(request._id);
      return "no_password_account";
    }

    // The swap: re-key the sign-in lookup, mark the address verified (the
    // library stores the verified email string on the account — see
    // `verifyCodeAndSignIn`), and mirror onto the users doc.
    await ctx.db.patch(account._id, {
      providerAccountId: request.newEmail,
      emailVerified: request.newEmail,
    });
    await ctx.db.patch(userId, {
      email: request.newEmail,
      emailVerificationTime: now,
    });
    await ctx.db.delete(request._id);
    return "ok";
  },
});

/** Drop every pending request for `userId` (cancel / password change). */
export const clearEmailChangeRequests = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const requests = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const request of requests) {
      await ctx.db.delete(request._id);
    }
    return null;
  },
});

/**
 * Drives the Settings → Account email section: non-null while a code is
 * outstanding, so the UI can resume the "enter code" state across app
 * restarts. Never exposes the code hash or salt.
 */
export const getEmailChangeStatus = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ newEmail: v.string(), expiresAt: v.number() })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const request = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!request || Date.now() > request.expiresAt) return null;
    return { newEmail: request.newEmail, expiresAt: request.expiresAt };
  },
});

/** Abandon the pending email change. Idempotent. */
export const cancelEmailChange = mutation({
  args: {},
  returns: v.literal("ok"),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("not_authenticated");
    const requests = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const request of requests) {
      await ctx.db.delete(request._id);
    }
    return "ok" as const;
  },
});

/**
 * Step 1 of the email change: re-authenticate with the current password
 * (same `retrieveAccount` guard — and library rate limit — as
 * `changePassword`), then store a pending request and email a 6-digit code
 * to the NEW address. Nothing about the account changes yet.
 *
 * Returns status literals instead of throwing — plain `Error` messages are
 * scrubbed to "Server Error" in production (see `changePassword`).
 */
export const initiateEmailChange = action({
  args: {
    currentPassword: v.string(),
    newEmail: v.string(),
  },
  returns: v.union(
    v.literal("ok"),
    v.literal("invalid_email"),
    v.literal("email_in_use"),
    v.literal("wrong_password"),
    v.literal("too_many_attempts"),
    v.literal("no_password_account"),
    v.literal("rate_limited")
  ),
  // Explicit return type: same-module `internal.user.*` calls — see the
  // circular-inference note on `changePassword`.
  handler: async (
    ctx,
    { currentPassword, newEmail }
  ): Promise<
    | "ok"
    | "invalid_email"
    | "email_in_use"
    | "wrong_password"
    | "too_many_attempts"
    | "no_password_account"
    | "rate_limited"
  > => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("not_authenticated");

    const email = newEmail.trim();
    // Relay addresses are Apple-internal — never allow one as a target
    // (the UI hides the section for relay accounts, but never trust it).
    if (
      !EMAIL_CHANGE_EMAIL_REGEX.test(email) ||
      email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN)
    ) {
      return "invalid_email";
    }

    const accountEmail: string | null = await ctx.runQuery(
      internal.user.getPasswordAccountEmail,
      { userId }
    );
    if (accountEmail === null) return "no_password_account";

    // "Change" to the current address is a no-op; surface it as in-use.
    if (email.toLowerCase() === accountEmail.toLowerCase()) {
      return "email_in_use";
    }
    const taken: boolean = await ctx.runQuery(
      internal.user.emailTakenByOtherUser,
      { email, userId }
    );
    if (taken) return "email_in_use";

    try {
      const retrieved = await retrieveAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: accountEmail, secret: currentPassword },
      });
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

    const code = generateEmailChangeCode();
    const salt = generateEmailChangeSalt();
    const codeHash = await hashEmailChangeCode(salt, code);

    const status: "ok" | "rate_limited" = await ctx.runMutation(
      internal.user.upsertEmailChangeRequest,
      { userId, newEmail: email, codeHash, salt }
    );
    if (status === "rate_limited") return "rate_limited";

    // Fire-and-forget: a Resend failure is reported server-side
    // (convex/email.ts) and the user can hit Resend. With no
    // EMAIL_SERVICE_API_KEY (dev) the send no-ops gracefully.
    await ctx.scheduler.runAfter(0, internal.email.sendEmailChangeVerification, {
      email,
      code,
    });
    return "ok";
  },
});

/**
 * Step 2: swap the account to the new address if the code matches. All
 * mutation-side checks (ownership, expiry, attempts, uniqueness) live in
 * `consumeEmailChangeRequest` so they commit atomically with the swap.
 */
export const verifyEmailChange = action({
  args: { code: v.string() },
  returns: v.union(
    v.literal("ok"),
    v.literal("invalid_code"),
    v.literal("expired"),
    v.literal("too_many_attempts"),
    v.literal("no_pending"),
    v.literal("email_in_use"),
    v.literal("no_password_account")
  ),
  handler: async (
    ctx,
    { code }
  ): Promise<
    | "ok"
    | "invalid_code"
    | "expired"
    | "too_many_attempts"
    | "no_pending"
    | "email_in_use"
    | "no_password_account"
  > => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("not_authenticated");

    const pending: { salt: string } | null = await ctx.runQuery(
      internal.user.getPendingEmailChange,
      { userId }
    );
    if (!pending) return "no_pending";

    const codeHash = await hashEmailChangeCode(pending.salt, code.trim());
    return await ctx.runMutation(internal.user.consumeEmailChangeRequest, {
      userId,
      codeHash,
    });
  },
});

/** Email a fresh code for the existing pending change (Resend button). */
export const resendEmailChangeCode = action({
  args: {},
  returns: v.union(
    v.literal("ok"),
    v.literal("no_pending"),
    v.literal("rate_limited")
  ),
  handler: async (
    ctx
  ): Promise<"ok" | "no_pending" | "rate_limited"> => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("not_authenticated");

    const code = generateEmailChangeCode();
    const salt = generateEmailChangeSalt();
    const codeHash = await hashEmailChangeCode(salt, code);

    const result: "no_pending" | "rate_limited" | { newEmail: string } =
      await ctx.runMutation(internal.user.refreshEmailChangeCode, {
        userId,
        codeHash,
        salt,
      });
    if (result === "no_pending" || result === "rate_limited") return result;

    await ctx.scheduler.runAfter(0, internal.email.sendEmailChangeVerification, {
      email: result.newEmail,
      code,
    });
    return "ok";
  },
});

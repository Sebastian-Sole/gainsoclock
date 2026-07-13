import { retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import {
  EMAIL_CHANGE_TTL_MS,
  generateEmailChangeToken,
  hashEmailChangeToken,
  validateNewEmail,
} from "../lib/email-change";

// Verify-before-activate email change (issue #106).
//
// Background (see the long note next to `changePassword` in convex/user.ts):
// in `@convex-dev/auth@0.0.90` the email IS the password authAccount's
// `providerAccountId` (its lookup key), and the library exposes no re-key API.
// Hand-editing `authAccounts` + `users.email` would activate an unverified
// address — an account-takeover vector — so we only ever swap the address
// AFTER the new inbox proves ownership by clicking a one-time link.
//
// Flow:
//   1. `requestEmailChange` (action): re-auth with the current password
//      (mirrors changePassword), validate the new address, store a pending row
//      keyed by the SHA-256 of a random token, email the NEW address the link.
//   2. The user clicks the link → `/webhooks/email/confirm-email-change` in
//      convex/http.ts → `applyPendingChange` re-keys the authAccount and
//      updates `users.email`, then notifies the OLD address.
//
// Nothing here touches the password secret, so existing sessions stay valid.

/**
 * Is this address already claimed — by a password account (its lookup key) or
 * any `users` row? Both matter: the re-key must not collide with an existing
 * password account, and a duplicate `users.email` would break the SIWA
 * collision logic (convex/authInternal.ts). Case-sensitive to match the
 * Password provider, which stores the address verbatim.
 */
export const emailInUse = internalQuery({
  args: { email: v.string(), excludeUserId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { email, excludeUserId }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email)
      )
      .unique();
    if (account && account.userId !== excludeUserId) return true;
    // Guard against a stray duplicate `users.email` too (would break the SIWA
    // collision logic). Exclude the caller's own row — the account id can
    // differ in case from users.email, so their own address isn't "in use".
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();
    return users.some((u) => u._id !== excludeUserId);
  },
});

/**
 * Replace any prior pending change for this user with a fresh one. Requesting a
 * new change supersedes an old (unconfirmed) link — only the latest is valid.
 */
export const storePendingChange = internalMutation({
  args: {
    userId: v.id("users"),
    currentAccountId: v.string(),
    newEmail: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pendingEmailChanges")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("pendingEmailChanges", args);
    return null;
  },
});

/**
 * Apply a confirmed email change. Called from the HTTP confirmation route after
 * it hashes the presented token. Re-validates everything at apply time (the
 * request may be hours old): the pending row must exist and be unexpired, the
 * password account must still be keyed to the same address, and the new address
 * must still be free. On success re-keys the authAccount, marks it verified,
 * and updates `users.email`. Returns the old/new addresses so the caller can
 * notify the previous inbox.
 */
export const applyPendingChange = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.object({
      status: v.literal("ok"),
      oldEmail: v.string(),
      newEmail: v.string(),
    }),
    v.object({ status: v.literal("expired") }),
    v.object({ status: v.literal("taken") }),
    v.object({ status: v.literal("invalid") })
  ),
  handler: async (ctx, { tokenHash }) => {
    const pending = await ctx.db
      .query("pendingEmailChanges")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!pending) return { status: "invalid" as const };

    if (pending.expiresAt <= Date.now()) {
      await ctx.db.delete(pending._id);
      return { status: "expired" as const };
    }

    // The password authAccount must still exist and still be keyed to the same
    // address we captured at request time. If it changed underneath us (a
    // parallel change, or the account was removed), this link is stale.
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", pending.userId).eq("provider", "password")
      )
      .first();
    if (!account || account.providerAccountId !== pending.currentAccountId) {
      await ctx.db.delete(pending._id);
      return { status: "invalid" as const };
    }

    // Someone else may have taken the address since the request. Re-check both
    // the password account key and `users.email` (ignoring this same user).
    const collidingAccount = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", pending.newEmail)
      )
      .unique();
    const collidingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", pending.newEmail))
      .first();
    if (
      (collidingAccount && collidingAccount._id !== account._id) ||
      (collidingUser && collidingUser._id !== pending.userId)
    ) {
      await ctx.db.delete(pending._id);
      return { status: "taken" as const };
    }

    const oldEmail = account.providerAccountId;
    await ctx.db.patch(account._id, {
      providerAccountId: pending.newEmail,
      emailVerified: new Date().toISOString(),
    });
    await ctx.db.patch(pending.userId, { email: pending.newEmail });
    await ctx.db.delete(pending._id);

    return {
      status: "ok" as const,
      oldEmail,
      newEmail: pending.newEmail,
    };
  },
});

/**
 * Start an email change for the signed-in user.
 *
 * Runs in an action because `retrieveAccount` (current-password re-auth) is an
 * action-ctx helper. Returns a status literal rather than throwing: plain
 * `Error` messages are scrubbed to "Server Error" in production, which would
 * break inline error copy (same rationale as `changePassword`).
 */
export const requestEmailChange = action({
  args: {
    currentPassword: v.string(),
    newEmail: v.string(),
  },
  returns: v.union(
    v.literal("ok"),
    v.literal("wrong_password"),
    v.literal("invalid_email"),
    v.literal("same_email"),
    v.literal("email_in_use"),
    v.literal("no_password_account"),
    v.literal("too_many_attempts")
  ),
  // Explicit return type: this handler calls `internal.emailChange.*` from its
  // own module — without the annotation TS can hit the circular-inference
  // bail-out that poisons the generated `api` type (see convex/user.ts).
  handler: async (
    ctx,
    { currentPassword, newEmail }
  ): Promise<
    | "ok"
    | "wrong_password"
    | "invalid_email"
    | "same_email"
    | "email_in_use"
    | "no_password_account"
    | "too_many_attempts"
  > => {
    const userId = await ctx.runQuery(internal.user.getAuthUser);
    if (!userId) throw new Error("not_authenticated");

    // The password account id is the email the user signed up with (the
    // authAccounts row's providerAccountId), not necessarily users.email.
    const accountEmail: string | null = await ctx.runQuery(
      internal.user.getPasswordAccountEmail,
      { userId }
    );
    if (accountEmail === null) {
      // OAuth-only account — no password to re-auth and nothing to re-key. The
      // UI hides the form, but never trust it.
      return "no_password_account";
    }

    const validated = validateNewEmail(newEmail, accountEmail);
    if (!validated.ok) return validated.reason;

    // Re-auth with the current password. Rate-limited by the library (repeated
    // wrong guesses surface as TooManyFailedAttempts).
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
      if (message.includes("TooManyFailedAttempts")) return "too_many_attempts";
      if (message.includes("InvalidAccountId")) return "no_password_account";
      throw err;
    }

    // Reject addresses already claimed by another account. Checked after
    // re-auth so this isn't an unauthenticated existence oracle.
    const inUse: boolean = await ctx.runQuery(internal.emailChange.emailInUse, {
      email: validated.email,
      excludeUserId: userId,
    });
    if (inUse) return "email_in_use";

    const token = generateEmailChangeToken();
    const tokenHash = await hashEmailChangeToken(token);
    const now = Date.now();
    await ctx.runMutation(internal.emailChange.storePendingChange, {
      userId,
      currentAccountId: accountEmail,
      newEmail: validated.email,
      tokenHash,
      expiresAt: now + EMAIL_CHANGE_TTL_MS,
      createdAt: now,
    });

    // Send the confirmation link to the NEW address. Scheduled (not awaited)
    // so a slow/failed Resend call doesn't block the request; the Node action
    // reports its own send failures.
    await ctx.scheduler.runAfter(
      0,
      internal.email.sendEmailChangeVerification,
      { newEmail: validated.email, token }
    );

    return "ok";
  },
});

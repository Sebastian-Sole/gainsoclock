import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { verifyAppleIdentityToken } from "./auth";

// Account linking for native Sign in with Apple.
//
// `@convex-dev/auth@0.0.90` has no first-class "link another provider to the
// current user" primitive, so we attach the `apple-native` authAccount row
// ourselves. This is the documented escape hatch from `docs/auth-upgrade.md`
// (plan 020) — re-check on any auth-package upgrade.
//
// Security model (see plans/033-siwa-account-linking.md): linking is only safe
// when the actor proves ownership of BOTH the existing account (they are
// already authenticated — `getAuthUserId`) AND the Apple identity (a verified
// identity token). We additionally refuse to attach an Apple `sub` that is
// already linked to a *different* user (anti-hijack). We deliberately do NOT
// link on email match — emails are unverified in this app.
//
// This file stays in the default Convex runtime (NOT "use node"): `jose`'s
// JWKS verification runs there, and a "use node" module cannot also export the
// `attachAppleAccount` mutation below.

/**
 * Link the calling (already-authenticated) user to an Apple identity.
 *
 * Returns `"linked"` on a fresh attach, or `"already_linked"` if this exact
 * (user, Apple sub) pair already exists (idempotent — safe to call twice).
 * Throws:
 *   - `"not_authenticated"`             — no signed-in user.
 *   - `"InvalidAccountId"`              — token failed verification.
 *   - `"apple_already_linked_elsewhere"`— the sub belongs to another user.
 */
export const linkApple = action({
  args: { idToken: v.string() },
  returns: v.union(v.literal("linked"), v.literal("already_linked")),
  // Explicit return type: this handler calls `internal.accountLinking.*`, which
  // references this module's own inferred types — without the annotation TS hits
  // a circular-inference bail-out (TS7022/7023) that poisons the whole generated
  // `api` type. See the Convex docs note on actions that call same-module fns.
  handler: async (
    ctx,
    { idToken }
  ): Promise<"linked" | "already_linked"> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("not_authenticated");

    const { sub } = await verifyAppleIdentityToken(idToken);

    return await ctx.runMutation(internal.accountLinking.attachAppleAccount, {
      userId,
      sub,
    });
  },
});

/**
 * Insert the apple-native authAccount row for `userId`, enforcing the
 * anti-hijack rule. Internal — only reachable via `linkApple`, which has
 * already verified the identity token and the caller's session.
 */
export const attachAppleAccount = internalMutation({
  args: { userId: v.id("users"), sub: v.string() },
  returns: v.union(v.literal("linked"), v.literal("already_linked")),
  handler: async (ctx, { userId, sub }) => {
    // This read-then-insert is safe under concurrency. Convex mutations are
    // serializable and a query's read set records the *index range* scanned,
    // not just the rows that existed — so a concurrent transaction inserting an
    // apple-native row for the same `sub` writes into this scanned range, the
    // second commit conflicts, and Convex retries it. On retry it observes the
    // now-existing row and takes the already_linked / anti-hijack branch below.
    // No duplicate row and no cross-linked `sub` can result.
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "apple-native").eq("providerAccountId", sub)
      )
      .unique();

    if (existing) {
      if (existing.userId === userId) return "already_linked";
      // The Apple identity is already someone else's — never reassign it.
      throw new Error("apple_already_linked_elsewhere");
    }

    await ctx.db.insert("authAccounts", {
      userId,
      provider: "apple-native",
      providerAccountId: sub,
    });
    return "linked";
  },
});

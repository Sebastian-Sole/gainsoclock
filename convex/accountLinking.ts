import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { APPLE_RELAY_DOMAIN, verifyAppleIdentityToken } from "./auth";

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
 * Pre-flight check the client runs BEFORE `signIn("apple-native")`, so a
 * collision is handled as normal control flow instead of a thrown error.
 *
 * Why this exists: the Convex client unconditionally `console.error`s every
 * server-function error (`request_manager` logs it regardless of whether the
 * promise is caught), which surfaces as a red dev LogBox. And plain `Error`
 * messages are scrubbed to "Server Error" in production, which would break the
 * client's collision detection in a release build. Returning a status here
 * avoids both: no throw on the collision path.
 *
 * Returns:
 *   - `"sign_in"`   — safe to proceed with `signIn("apple-native")` (returning
 *                     linked user, brand-new Apple user, or a relay email).
 *   - `"needs_link"`— the Apple email collides with an existing password/Google
 *                     account; show the password→link sheet instead.
 *
 * The `authorize` collision check stays as a server-side safety net for clients
 * that skip this pre-flight.
 */
export const checkAppleSignIn = action({
  args: { idToken: v.string() },
  returns: v.union(v.literal("sign_in"), v.literal("needs_link")),
  handler: async (ctx, { idToken }): Promise<"sign_in" | "needs_link"> => {
    const { sub, email, emailVerified } = await verifyAppleIdentityToken(
      idToken
    );

    // Already-linked sub (a returning user, or one linked via the flow) → just
    // sign in; never a collision.
    const linkedUserId = await ctx.runQuery(
      internal.authInternal.findAppleAccountUserId,
      { sub }
    );
    if (linkedUserId) return "sign_in";

    // Unlinked sub with a verified, non-relay email that already belongs to a
    // non-apple-native account → the explicit link flow is required.
    if (email && emailVerified && !email.endsWith(APPLE_RELAY_DOMAIN)) {
      const collision = await ctx.runQuery(
        internal.authInternal.checkSiwaEmailCollision,
        { email }
      );
      if (collision === "collision") return "needs_link";
    } else if (!email) {
      // Apple omits `email` after the first authorization. An UNLINKED sub with
      // no email can only be a prior collision that wasn't linked (a genuine
      // new user's first token always carries the email; relay/pure-Apple users
      // get linked on it). We can't check the collision, so route to the link
      // sheet rather than let `signIn` create a split account. Mirrors the
      // server-side guard in `auth.ts`. (See PR #78 review.)
      return "needs_link";
    }

    // New pure-Apple user (verified email, no collision; or a relay email) →
    // safe to create on sign in.
    return "sign_in";
  },
});

/**
 * Pre-flight the client runs BEFORE `signIn("password", { flow: "signUp" })`,
 * so a duplicate-email signup is handled as normal control flow instead of a
 * thrown error. The email/password analog of `checkAppleSignIn` above.
 *
 * Why this exists: `@convex-dev/auth`'s `createAccount` throws a plain
 * `Error("Account <email> already exists")` on a duplicate, and Convex scrubs
 * non-`ConvexError` messages to "Server Error" in production — so the sign-up
 * screen's substring match ("already exists") silently fails in release builds
 * and every collision falls back to the generic "Could not create account"
 * copy. Returning a boolean here is redaction-immune. The `createAccount` throw
 * stays as a server-side safety net for clients that skip this pre-flight.
 *
 * Note: like the sign-in "no account found with this email" message, this is an
 * email-existence oracle. That exposure already exists in this app and is
 * accepted as a deliberate tradeoff for usable auth errors.
 */
export const checkEmailExists = action({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }): Promise<boolean> =>
    ctx.runQuery(internal.authInternal.passwordAccountExists, {
      email: email.trim(),
    }),
});

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

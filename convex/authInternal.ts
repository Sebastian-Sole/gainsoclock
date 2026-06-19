import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Resolve the user a given Apple `sub` is already linked to, if any.
 *
 * Used by the `apple-native` sign-in provider to decide whether a SIWA
 * sign-in is a *returning* user (sub already attached to a user — skip the
 * collision check, let `createAccount` resolve them) versus a brand-new Apple
 * identity (run the collision guard). Also the anti-hijack lookup behind
 * `convex/accountLinking.ts`'s `attachAppleAccount`.
 *
 * Returns the `users` id, or `null` when no apple-native account exists for
 * this `sub`.
 */
export const findAppleAccountUserId = internalQuery({
  args: { sub: v.string() },
  returns: v.union(v.null(), v.id("users")),
  handler: async (ctx, { sub }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "apple-native").eq("providerAccountId", sub)
      )
      .unique();
    return account ? account.userId : null;
  },
});

/**
 * SIWA collision check (Security CR5).
 *
 * Called from the `apple-native` ConvexCredentials provider in `auth.ts`
 * before we let `createAccount` insert a fresh user. If the verified Apple
 * email already belongs to a user that authenticates via any non-apple-native
 * provider (e.g. email + password, Google), refuse to silently merge — the
 * caller throws `siwa_email_collision` and the UI tells the user to sign in
 * via their original method first.
 *
 * Returns:
 *   - `null`             — no existing user with this email; safe to create.
 *   - `"link-by-email"`  — existing user has only apple-native accounts (or
 *                          no accounts) under this email; safe to proceed
 *                          (createAccount won't actually link without
 *                          shouldLinkViaEmail, but this signals the caller
 *                          may pass that flag if desired).
 *   - `"collision"`      — existing user has at least one non-apple-native
 *                          account; refuse the sign-in.
 */
export const checkSiwaEmailCollision = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.literal("link-by-email"),
    v.literal("collision")
  ),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();
    if (!existingUser) return null;
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", existingUser._id)
      )
      .collect();
    const hasNonAppleNative = accounts.some(
      (a) => a.provider !== "apple-native"
    );
    return hasNonAppleNative ? "collision" : "link-by-email";
  },
});

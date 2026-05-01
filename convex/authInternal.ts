import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

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

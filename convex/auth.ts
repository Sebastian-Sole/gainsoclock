import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";

const APPLE_RELAY_DOMAIN = "@privaterelay.appleid.com";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password,
    Google,
    Apple({
      profile: (appleInfo) => {
        const name = appleInfo.user
          ? `${appleInfo.user.name.firstName} ${appleInfo.user.name.lastName}`
          : undefined;
        return {
          id: appleInfo.sub,
          name: name,
          email: appleInfo.email,
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      return redirectTo;
    },
    // Security CR5 / Obs #5: on SIWA sign-in with no existing linked user,
    // refuse to silently auto-merge into an email-password account that shares
    // the address. Hide-My-Email relay addresses are authoritative identities
    // for their Apple users, so we skip the collision check there.
    async createOrUpdateUser(ctxRaw, args) {
      // `createOrUpdateUser` is typed against `AnyDataModel`; narrow it to
      // this project's DataModel so table indexes resolve.
      const ctx = ctxRaw as unknown as MutationCtx;
      if (
        args.type === "oauth" &&
        args.provider.id === "apple" &&
        args.existingUserId === null &&
        typeof args.profile.email === "string" &&
        !args.profile.email.endsWith(APPLE_RELAY_DOMAIN)
      ) {
        const email = args.profile.email.toLowerCase();
        const existingUser = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .first();
        if (existingUser) {
          const existingAccounts = await ctx.db
            .query("authAccounts")
            .withIndex("userIdAndProvider", (q) =>
              q.eq("userId", existingUser._id)
            )
            .collect();
          const hasNonAppleAccount = existingAccounts.some(
            (a) => a.provider !== "apple"
          );
          if (hasNonAppleAccount) {
            throw new Error("siwa_email_collision");
          }
        }
      }
      // Reproduce the minimal default: return the linked user if any;
      // otherwise match on email; otherwise insert a fresh user document.
      if (args.existingUserId) return args.existingUserId;
      const emailRaw = args.profile.email;
      const email =
        typeof emailRaw === "string" ? emailRaw.toLowerCase() : undefined;
      if (email) {
        const existingUser = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .first();
        if (existingUser) return existingUser._id;
      }
      const nameVal = args.profile.name;
      return await ctx.db.insert("users", {
        email,
        name: typeof nameVal === "string" ? nameVal : undefined,
      });
    },
  },
});

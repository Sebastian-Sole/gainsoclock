import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

const APPLE_RELAY_DOMAIN = "@privaterelay.appleid.com";

// Apple's JWKS — module-scoped so we don't refetch on every sign-in. `jose`'s
// remote JWKS function caches the keyset and applies a cooldown internally;
// reusing the same function instance shares that cache across invocations.
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

// Native Sign in with Apple. The iOS client gets an `identityToken` from
// `expo-apple-authentication` and posts it here as `id_token`. We verify the
// JWT against Apple's JWKS, then find-or-create the user.
//
// We deliberately do NOT use `@auth/core/providers/apple` (OAuth) for this
// path because `@convex-dev/auth`'s `handleOAuthProvider` only knows two
// flows:
//   - `params.code` set       → verify the callback code
//   - otherwise               → return a redirect URL for the client
// Passing `id_token` directly falls into the second branch, and the RN
// client intentionally doesn't navigate (see
// `node_modules/@convex-dev/auth/src/react/client.tsx` line 245), so the
// sign-in promise resolves to `{ signingIn: false }` and the user never
// gets authenticated.
const AppleNative = ConvexCredentials<DataModel>({
  id: "apple-native",
  authorize: async (params, ctx) => {
    const idToken = params.id_token;
    if (typeof idToken !== "string" || idToken.length === 0) {
      throw new Error("InvalidAccountId");
    }
    const nameParam = params.name;
    const name =
      typeof nameParam === "string" && nameParam.length > 0
        ? nameParam
        : undefined;

    const audience = process.env.AUTH_APPLE_ID;
    if (!audience) {
      throw new Error(
        "AUTH_APPLE_ID env var is not set on the Convex deployment"
      );
    }

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(idToken, APPLE_JWKS, {
        issuer: "https://appleid.apple.com",
        audience,
      });
      payload = result.payload as Record<string, unknown>;
    } catch {
      throw new Error("InvalidAccountId");
    }

    const sub = payload.sub;
    if (typeof sub !== "string" || sub.length === 0) {
      throw new Error("InvalidAccountId");
    }

    // Apple only sends `email`/`email_verified` on the FIRST sign-in for a
    // given (Apple ID, app) pair. Subsequent JWTs may carry only `sub`. The
    // find-by-sub path inside `createAccount` handles those cases; the
    // collision check below only runs when an email is present and verified.
    const emailRaw = payload.email;
    const email =
      typeof emailRaw === "string" ? emailRaw.toLowerCase() : undefined;

    // Apple sometimes serializes booleans as the string "true" / "false".
    const emailVerifiedRaw = payload.email_verified;
    const emailVerified =
      emailVerifiedRaw === true || emailVerifiedRaw === "true";

    // Security CR5: refuse to silently auto-merge a SIWA sign-in into an
    // existing email-password (or other-provider) account that happens to
    // share the address. Hide-My-Email relay addresses are authoritative
    // identities for the Apple user, so we skip the check there.
    if (email && emailVerified && !email.endsWith(APPLE_RELAY_DOMAIN)) {
      const collision = await ctx.runQuery(
        internal.authInternal.checkSiwaEmailCollision,
        { email }
      );
      if (collision === "collision") {
        throw new Error("siwa_email_collision");
      }
    }

    // Find-or-create. `createAccount` is idempotent: if an authAccount with
    // the same (provider, providerAccountId) already exists, it returns the
    // existing user without inserting a duplicate. On first sign-in it
    // inserts a new `users` row using the `profile` we pass.
    // Build profile with only the fields we actually have. The Convex
    // `users` table treats `email` and `name` as optional, but the action
    // params type for createAccount rejects literal `undefined`.
    const profile: { email?: string; name?: string } = {};
    if (email) profile.email = email;
    if (name) profile.name = name;

    const { user } = await createAccount(ctx, {
      provider: "apple-native",
      account: { id: sub },
      profile,
      shouldLinkViaEmail: false,
    });

    return { userId: user._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google, AppleNative],
  callbacks: {
    async redirect({ redirectTo }) {
      return redirectTo;
    },
  },
});

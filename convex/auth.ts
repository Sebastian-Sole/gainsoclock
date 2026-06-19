import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

const APPLE_RELAY_DOMAIN = "@privaterelay.appleid.com";

// Native iOS SIWA puts the iOS bundle identifier in the JWT's `aud` claim —
// NOT a Service ID. Service IDs (e.g. `com.foo.bar.auth`) are only used for the
// web OAuth flow we don't ship. Hardcoded because this must match
// `app.json#expo.ios.bundleIdentifier` exactly; an env var is one typo away
// from breaking auth.
const APPLE_AUDIENCE = "com.soleinnovations.fitbull";

// Apple's JWKS — module-scoped so we don't refetch on every sign-in. `jose`'s
// remote JWKS function caches the keyset and applies a cooldown internally;
// reusing the same function instance shares that cache across invocations.
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

/**
 * Verify a native Sign-in-with-Apple identity token against Apple's JWKS and
 * extract the stable subject plus (first-sign-in-only) email claims.
 *
 * Shared by the `apple-native` sign-in provider (`authorize`) and the
 * account-linking action (`convex/accountLinking.ts`) so both verify with the
 * exact same issuer/audience. Throws `InvalidAccountId` on any failure — the
 * same opaque error the provider surfaces today, so callers never leak why a
 * token was rejected.
 *
 * The JWKS fetch means this can only run in an action context (the auth sign-in
 * action, or a Convex action). `jose` runs in the default Convex V8 runtime, so
 * callers do NOT need `"use node"`.
 */
export async function verifyAppleIdentityToken(idToken: string): Promise<{
  sub: string;
  email?: string;
  emailVerified: boolean;
}> {
  if (typeof idToken !== "string" || idToken.length === 0) {
    throw new Error("InvalidAccountId");
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience: APPLE_AUDIENCE,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    // Log the underlying jose error (audience mismatch, expired token,
    // signature failure, etc.) so prod debugging doesn't have to guess.
    // The error payload from jose is safe to log — it doesn't echo the
    // raw token, just the failure reason and the offending claim values.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[apple-native] JWT verification failed: ${reason} (audience=${APPLE_AUDIENCE})`
    );
    throw new Error("InvalidAccountId");
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("InvalidAccountId");
  }

  // Apple only sends `email`/`email_verified` on the FIRST sign-in for a
  // given (Apple ID, app) pair. Subsequent JWTs may carry only `sub`.
  const emailRaw = payload.email;
  const email =
    typeof emailRaw === "string" ? emailRaw.toLowerCase() : undefined;

  // Apple sometimes serializes booleans as the string "true" / "false".
  const emailVerifiedRaw = payload.email_verified;
  const emailVerified =
    emailVerifiedRaw === true || emailVerifiedRaw === "true";

  return { sub, email, emailVerified };
}

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
    const nameParam = params.name;
    const name =
      typeof nameParam === "string" && nameParam.length > 0
        ? nameParam
        : undefined;

    // Verify the Apple identity token (JWKS-backed; throws InvalidAccountId on
    // any failure) and pull out the stable `sub` plus the first-sign-in-only
    // email claims.
    const { sub, email, emailVerified } = await verifyAppleIdentityToken(
      typeof idToken === "string" ? idToken : ""
    );

    // If this Apple `sub` is already linked to a user (a normal returning
    // sign-in, OR an account explicitly linked via the linking flow), skip the
    // collision check entirely — `createAccount` will resolve to that user and
    // we must NOT dead-end them on `siwa_email_collision`.
    const linkedUserId = await ctx.runQuery(
      internal.authInternal.findAppleAccountUserId,
      { sub }
    );

    // Security CR5: when the `sub` is NOT yet linked, refuse to silently
    // auto-merge a SIWA sign-in into an existing email-password (or
    // other-provider) account that happens to share the address. Hide-My-Email
    // relay addresses are authoritative identities for the Apple user, so we
    // skip the check there. The recourse is the explicit link flow (password
    // re-auth proves account ownership) — see `convex/accountLinking.ts`.
    if (
      !linkedUserId &&
      email &&
      emailVerified &&
      !email.endsWith(APPLE_RELAY_DOMAIN)
    ) {
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

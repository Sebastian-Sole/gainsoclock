# White Hat — Auth & Data Spine

**Perspective:** White Hat (facts only, no opinions)
**Scope:** `@convex-dev/auth` capabilities + current Convex profile schema
**Date:** 2026-04-21

Confidence tags: 🟢 primary (code read in-repo or official doc page), 🟡 secondary (third-party summary / search snippet), 🔴 unverified.

---

## 1. `@convex-dev/auth` anonymous/guest support

🟢 The library ships an `Anonymous` provider. Import path: `@convex-dev/auth/providers/Anonymous`. Configured by adding to the `providers` array passed to `convexAuth({...})`. Source: `https://labs.convex.dev/auth/config/anonymous` and `https://raw.githubusercontent.com/get-convex/convex-auth/main/docs/pages/config/anonymous.mdx` (fetched 2026-04-21).

Exact documented config:

```ts
// convex/auth.ts
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous],
});
```

🟢 Client-side call (same source):

```ts
import { useAuthActions } from "@convex-dev/auth/react";
const { signIn } = useAuthActions();
void signIn("anonymous").then(() => /* write data */);
```

🟢 `AnonymousConfig` accepts two optional fields: `id?: string` (disambiguate multiple anonymous providers) and `profile?(params, ctx)` (validation hook returning stored profile; default returns `{ isAnonymous: true }`). Source: `https://labs.convex.dev/auth/api_reference/providers/Anonymous`.

🟢 The anonymous provider inserts a real row in the `users` table and a row in `authAccounts`. Account id is generated via `crypto.randomUUID()` at sign-in time. The returned `userId` is a standard `Id<"users">`. Source: provider source at `raw.githubusercontent.com/.../src/providers/Anonymous.ts` (inspected via WebFetch 2026-04-21).

🟢 The official docs carry an explicit abuse-prevention note recommending CAPTCHA (hCaptcha or Cloudflare Turnstile). Token validation goes inside the provider's `profile({ token })` callback. The docs label anonymous auth as "an advanced feature ... we don't recommend it to newcomers."

## 2. Upgrading an anonymous session to email/password or OAuth

🟢 Conversion is **supported but not automatic**. From the anonymous config page verbatim:

> "If the client is currently authenticated as an anonymous user, and then signs in with an[other] authentication method, the anonymous user can be converted to a normal user. To support this flow, you must provide a custom [account linking] implementation."

🟢 The library's default behavior on calling `signIn` while already authenticated: "Using any authentication method while the user is logged-in will invalidate their existing session and create a new one." Source: `https://labs.convex.dev/auth/advanced` (account linking section).

🟢 The documented hook for custom linking is the `createOrUpdateUser` callback on `convexAuth({ callbacks: { ... } })`. When this callback is provided the library stops creating/updating users itself — the implementer owns the full logic. Documented shape:

```ts
callbacks: {
  async createOrUpdateUser(ctx, args) {
    if (args.existingUserId) {
      // optionally merge fields into existing user
      return args.existingUserId;
    }
    // custom lookup / insert logic
    const existing = await findUserByEmail(ctx, args.profile.email);
    if (existing) return existing._id;
    return ctx.db.insert("users", { /* ... */ });
  },
}
```

🟡 Preserving the `userId` across the anonymous→authenticated transition is not shown as a single built-in helper. The documented mechanism is: read the current authenticated user inside `createOrUpdateUser` via `ctx`, and return that same `_id` instead of inserting a new user. Rows already owned by that `userId` stay owned — no data migration is needed because foreign-key `v.id("users")` fields do not change. Source: `https://labs.convex.dev/auth/advanced` + the account-linking behavior described in the WebSearch summary (`site:labs.convex.dev/auth`). No separate "linkAccounts" mutation surface is documented in the pages fetched today.

🟢 Trust model for auto-linking (no callback override needed): if the new sign-in method is "trusted" (OAuth providers flagged `allowDangerousEmailAccountLinking`, or any email/phone-verifying provider) **and** there is exactly one existing user with that verified email/phone, the new `authAccounts` row is attached to the existing user. The Password provider with `verify:` configured qualifies. Source: `labs.convex.dev/auth/advanced` → "Account linking".

🟢 Schema support for the transition already exists in this repo: `convex/schema.ts` spreads `...authTables`, which includes `users`, `authSessions`, `authAccounts`, `authVerificationCodes`, `authRateLimits`, `authRefreshTokens` (shape confirmed from `src/server/implementation/users.ts` in the convex-auth repo). An anonymous user's `authAccounts` row keeps the same `userId` after a second provider is linked; only a new row is appended.

## 3. Installed vs. latest version of `@convex-dev/auth`

🟢 Pinned in `package.json` line 18: `"@convex-dev/auth": "^0.0.90"`. `pnpm-lock.yaml` resolves the concrete installed version to `0.0.90` (integrity `sha512-aqw88EB042HvnaF4wcf/f/wTocmT2Bus2VDQRuV79cM0+8kORM0ICK/ByZ6XsHgQ9qr6TmidNbXm6QAgndrdpQ==`), against `@auth/core@0.37.4`, `convex@1.31.7`, React 19.1.0.

🟢 Registry `dist-tags` for `@convex-dev/auth` as of 2026-04-21:
- `latest: 0.0.91` published 2026-02-26
- `alpha: 0.0.90-alpha.0` published 2025-09-24
- `0.0.90` (installed) published 2025-09-24

Publish timeline retrieved from `https://registry.npmjs.org/@convex-dev/auth` (parsed `time` map).

🟢 Deltas between 0.0.90 (installed) and 0.0.91 (latest), per `CHANGELOG.md` on `main`:
- New `jwt.customClaims` hook
- New `beforeSessionCreation` callback
- Password-reset validation fixes
- URL code sign-in fix

🟡 The changelog between 0.0.80–0.0.91 does **not** mention the `Anonymous` provider — so that capability predates 0.0.80. RN-specific fixes: `0.0.85`/`0.0.86` addressed Expo 53+ environment detection; `0.0.79` (outside range inspected) fixed RN auth-refresh silent failure per search result. No changelog entry between 0.0.80 and 0.0.91 changes `createOrUpdateUser` semantics.

## 4. Current user-facing fields in `users`

🟢 `convex/schema.ts` line 17–18 uses `...authTables` from `@convex-dev/auth/server`. The project does **not** override or extend the `users` table. From `src/server/implementation/users.ts` (convex-auth repo) the `users` table shape under `authTables` is:

| Field | Validator | Notes |
|---|---|---|
| `email` | `v.optional(v.string())` | indexed as `email` |
| `phone` | `v.optional(v.string())` | indexed as `phone` |
| `emailVerificationTime` | `v.optional(v.number())` | ms timestamp |
| `phoneVerificationTime` | `v.optional(v.number())` | ms timestamp |
| `name` | `v.optional(v.string())` | set by OAuth provider profile callbacks |
| `image` | `v.optional(v.string())` | set by OAuth provider profile callbacks |
| `isAnonymous` | `v.optional(v.boolean())` | written by Anonymous provider's default profile |

🟢 All other user-shaped data lives in **sibling tables keyed by `userId: v.id("users")`**, not on the user row:

- `userSettings` — `weightUnit`, `distanceUnit`, `defaultRestTime`, `hapticsEnabled`, plus ~10 optional notification/preference fields (`convex/schema.ts` L121-138)
- `userOnboarding` — `hasCompletedOnboarding: v.boolean()`, `createdAt`, `updatedAt` (L141-146)
- `userSubscriptions` — `revenuecatAppUserId`, `entitlement`, `isActive`, `productId?`, `store?`, `expiresAt?`, `updatedAt`, `lastEventId?`, `lastEventTimestampMs?` (L105-118)
- `nutritionGoals` — `calories`, `protein`, `carbs`, `fat` (L243-249)

🟢 No intake/profile fields exist today: no `age`, `sex`, `heightCm`, `weightKg`, `goal`, `trainingExperience`, `daysPerWeek`, `equipment`, `activityLevel` — none of these appear in `convex/schema.ts` or `convex/validators.ts`.

## 5. Indexes on `users` and related tables

🟢 `users` indexes come from `authTables`: `email` (on `email`) and `phone` (on `phone`). Not redeclared in `convex/schema.ts`.

🟢 No `by_onboardingStatus` index exists. Onboarding lookups go through `userOnboarding.by_user` (`["userId"]`), which is the only index on that table (`convex/schema.ts` L146). Consequently `getOnboardingStatus` always has a specific `userId` in hand before it queries (`convex/user.ts` L25-28) — a listing query like "all users who haven't onboarded" would require a full table scan against today's schema.

🟢 Every other app-owned table declares at minimum a `by_user` index on `[userId]` (exercises, templates, workoutLogs, recipes, mealLogs, workoutPlans, etc. — verified by grepping `convex/schema.ts`).

## 6. `getAuthUserId` coverage across queries/mutations

🟢 `import { getAuthUserId } from "@convex-dev/auth/server"` appears in 14 Convex modules (grep across `convex/**`): `user.ts`, `aiTools.ts`, `nutritionGoals.ts`, `workoutLogs.ts`, `subscriptions.ts`, `mealLogs.ts`, `plans.ts`, `exercises.ts`, `chatActions.ts`, `recipes.ts`, `settings.ts`, `templates.ts`, `chat.ts`. Every handler inspected opens with the pattern:

```ts
const userId = await getAuthUserId(ctx);
if (!userId) throw new Error("Not authenticated"); // or `return null` for reads
```

🟢 Quantitative coverage (line-count from grep): `plans.ts` 11 call sites, `templates.ts` 5, `recipes.ts` 7, `workoutLogs.ts` 6, `user.ts` 4, `mealLogs.ts` 5, `subscriptions.ts` 3, `exercises.ts` 3, `settings.ts` 2, `chat.ts` 2, `nutritionGoals.ts` 2, `aiTools.ts` 1, `chatActions.ts` 1. Handlers that `return null` on unauth: the read queries (`me`, `getOnboardingStatus`). Handlers that throw: every mutation and action (e.g. `completeOnboarding`, `markOnboardingPendingIfUnset`, `deleteAllData`).

🟡 No Convex function was found that skips the auth check. The one exception is internal mutations called from actions (`deleteUserDataBatch`, `deleteWorkoutSetsBatch` in `user.ts`) — they accept `userId` as an arg but are marked `internalMutation` and can only be invoked by an action that itself already called `getAuthUserId`. Grep did not surface any public mutation accepting `userId` as a client-provided arg.

## 7. Client-side session persistence

🟢 `app/_layout.tsx` L128 wraps the app in `<ConvexAuthProvider client={convex} storage={secureStorage}>`. The custom `storage` prop is `lib/secure-storage.ts`, which wraps `expo-secure-store`:

```ts
// lib/secure-storage.ts (paraphrased)
import * as SecureStore from "expo-secure-store";
const secureStorage = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};
```

🟢 On web the wrapper falls back to `localStorage` (comment at L5). The provider serializes its JWT + refresh token through this interface; there is no direct `AsyncStorage` use for auth tokens in-repo.

🟢 Auxiliary client-side auth cache: `stores/auth-cache-store.ts` persists `wasAuthenticated: boolean` and `hasCompletedOnboarding: boolean` into `AsyncStorage` (via `zustandStorage`) under key `auth-cache-storage`. This is **not** the session token — it is a UX bridge used by `hooks/use-auth-guard.ts` to choose between the login screen, the onboarding screen, and `(tabs)` while offline or while `useConvexAuth()` is still loading (`use-auth-guard.ts` L19-38).

🟢 `stores/onboarding-store.ts` persists its own `hasCompletedOnboarding` flag into `AsyncStorage` via `partialize` (L62-68). This store is a holdover from the spotlight-tour implementation; it duplicates state that also lives in `userOnboarding` (Convex) and in `auth-cache-store`.

## 8. What `completeOnboarding` does today

🟢 `convex/user.ts` L74-101, exact body:

```ts
export const completeOnboarding = mutation({
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
        hasCompletedOnboarding: true,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.insert("userOnboarding", {
      userId,
      hasCompletedOnboarding: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

Observations: (a) accepts no args — cannot persist any intake payload; (b) idempotent; (c) writes only the boolean flag + timestamps; (d) returns `void`.

🟢 Companion `markOnboardingPendingIfUnset` (L45-72): on first mutation call, inserts a `userOnboarding` row with `hasCompletedOnboarding: !isLikelyNewUser`, where `isLikelyNewUser = (Date.now() - user._creationTime) < 5 * 60_000`. Legacy users whose `userOnboarding` row is missing are treated as already onboarded (L37-39 in `getOnboardingStatus`).

## 9. Readers of `hasCompletedOnboarding` across the codebase

🟢 Server-side (2 modules):
- `convex/user.ts` — the schema column (L143), all three read/write sites inside `getOnboardingStatus` / `markOnboardingPendingIfUnset` / `completeOnboarding`.
- `convex/schema.ts` L143 — table column declaration.

🟢 Client-side reads (3 modules):
- `hooks/use-auth-guard.ts` — L20 (read from cache store), L29-31 (server vs cache selection), L36 (cache write), L60 / L65 (routing decision: unfinished onboarding routes to `/onboarding`; completed onboarding routes out of `(auth)`/`onboarding` groups), L69 (effect dep).
- `providers/onboarding-provider.tsx` — L77 (local store), L83 (server query), L106-109 (starts the spotlight tour when server says onboarding is done but local hasn't seen it yet).
- `stores/auth-cache-store.ts` — L7, L17, L20, L24 (field + default + setter + clear).
- `stores/onboarding-store.ts` — L8, L26, L51, L55, L59, L66 (field + defaults + completeOnboarding / skipOnboarding / resetOnboarding mutators + persist partialize).

🟢 Route/render consequences (traced from `use-auth-guard.ts` L48-67): three mutually exclusive destinations — `/(auth)/sign-up`, `/onboarding`, `/(tabs)` — all gated on the pair `(effectiveAuthenticated, hasCompletedOnboarding)`. The guard depends on `useSegments()` to detect whether the user is already inside `(auth)` or `onboarding` and avoids redirect loops.

---

## Source index

- 🟢 In-repo code: `convex/schema.ts`, `convex/user.ts`, `convex/auth.ts`, `convex/auth.config.ts`, `convex/validators.ts`, `app/_layout.tsx`, `app/(auth)/sign-up.tsx`, `app/(auth)/sign-in.tsx`, `hooks/use-auth-guard.ts`, `lib/secure-storage.ts`, `stores/auth-cache-store.ts`, `stores/onboarding-store.ts`, `providers/convex-sync-provider.tsx`, `providers/onboarding-provider.tsx`, `package.json`, `pnpm-lock.yaml`.
- 🟢 Official docs (fetched 2026-04-21): `labs.convex.dev/auth`, `/auth/config/anonymous`, `/auth/api_reference/providers/Anonymous`, `/auth/advanced`, `/auth/authz`, `/auth/config/passwords`, `raw.githubusercontent.com/get-convex/convex-auth/main/docs/pages/config/anonymous.mdx`, `.../src/providers/Anonymous.ts`, `.../src/server/implementation/users.ts`, `.../CHANGELOG.md`.
- 🟢 Registry: `registry.npmjs.org/@convex-dev/auth` (dist-tags + time map).
- 🟡 Web search snippets used to triangulate account-linking trust model (labs.convex.dev/auth/advanced excerpt).

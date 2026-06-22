# Plan 033: Apple ↔ password account linking (resolve siwa_email_collision)

> Feature build (the V1.1 deferred in `docs/siwa-email-collision.md`). Security-
> sensitive — the security model below is the point; do not weaken it.
>
> **Branch**: `feat/siwa-account-linking` off `develop` (@ `0890ed1`).

## Status

- **Priority**: P1 (user is blocked signing in with Apple on a 2nd device)
- **Effort**: M
- **Risk**: MED-HIGH — auth/account-linking. Wrong design = account hijack.
- **Category**: feature / security
- **Planned at**: branch `develop` @ `0890ed1`, 2026-06-17

## Why this matters

`convex/auth.ts` throws `siwa_email_collision` whenever a Sign-in-with-Apple
identity carries a verified, non-relay email that matches an existing user who
has a **non-apple-native** account (email+password or Google). The V1 recourse
was "sign in with email first / contact support"; account linking was deferred
to V1.1 because `@convex-dev/auth@0.0.90` has no first-class link primitive.
Result: a user who created a password account on device A cannot use Sign in
with Apple on device B — it dead-ends on the collision error. This plan turns
that dead-end into a "link your Apple ID" flow.

## Security model (the non-negotiable core)

Linking attaches an `apple-native` auth identity to an existing user. It is only
safe when the actor proves ownership of **both**:

1. **The existing account** — proven by signing in to it (password, or being
   already authenticated), NOT by an email match. Emails are **not verified** in
   this app (the `Password` provider is configured bare — `convex/auth.ts:126`),
   so an email match proves nothing.
2. **The Apple identity** — proven by a verified Apple identity token (the
   existing jose JWKS verification).

Plus an **anti-hijack** rule: refuse to link an Apple `sub` that is already
attached to a *different* user (you can't steal someone else's Apple identity).

This rules out "auto-link on verified-email match" (insecure here) and mandates
explicit linking with proof-of-both: at the collision (password re-auth) or from
Settings (already authenticated).

## Current state (on develop)

- `convex/auth.ts`:
  - `AppleNative = ConvexCredentials({ id: "apple-native", authorize })` (lines 32-123). `authorize` verifies the Apple JWT via `jwtVerify(idToken, APPLE_JWKS, { issuer, audience: "com.soleinnovations.fitbull" })`, extracts `sub`, runs the collision check (lines 93-101), then `createAccount(ctx, { provider: "apple-native", account: { id: sub }, profile, shouldLinkViaEmail: false })` (114-119).
  - The collision check runs **before** createAccount and throws on `"collision"`.
  - `convexAuth({ providers: [Password, Google, AppleNative], ... })` (125-132).
- `convex/authInternal.ts`: `checkSiwaEmailCollision({ email })` → `null` | `"link-by-email"` | `"collision"` (by `users.email` index, then `authAccounts` by `userIdAndProvider`, `hasNonAppleNative`).
- `authAccounts` indexes available (authTables): `providerAndAccountId` (on `["provider","providerAccountId"]` — used at `convex/onboarding.ts:642`) and `userIdAndProvider`.
- Client:
  - `components/auth/apple-sign-in-button.tsx` — presentational; `onSuccess(credential)`, `onError`, `onCollision`. The `credential.identityToken` is available in the owning screen's `handleAppleSuccess`.
  - `app/(auth)/sign-in.tsx:118-180` & `app/(auth)/sign-up.tsx` (mirror) — `handleAppleSuccess` calls `signIn("apple-native", { id_token, name? })`; on `siwa_email_collision` shows `SIWA_COLLISION_COPY`. They also use `signIn("password", { ... })` for email auth.
  - `lib/privacy-notice.ts:10` — `SIWA_COLLISION_COPY` (the dead-end copy).
  - `app/settings/index.tsx` — Settings list; no auth-provider rows yet.
- JWKS network fetch in `jwtVerify` ⇒ token verification must run in an **action** (not query/mutation).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (convex) | `npx tsc --noEmit -p convex` | exit 0 |
| Typecheck (app) | `npx expo customize tsconfig.json && git checkout -- tsconfig.json && npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Deploy (operator) | `pnpm convex:dev` | functions deployed to the dev deployment the app uses |

## Scope

**In scope**
- `convex/auth.ts` — extract `verifyAppleIdentityToken` helper; reorder `authorize` to skip the collision check when the `sub` is already linked.
- `convex/authInternal.ts` — `findAppleAccountUserId({ sub })` query.
- `convex/accountLinking.ts` (new) — `linkApple` action + `attachAppleAccount` internal mutation.
- `components/auth/link-apple-sheet.tsx` (new) — collision-time password→link UI, shared by sign-in/sign-up.
- `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx` — capture `identityToken` on collision, show the link sheet.
- `app/settings/index.tsx` — iOS-only "Connect Apple" row → SIWA → `linkApple`.
- `lib/privacy-notice.ts` — collision copy → linking-oriented.
- `docs/siwa-email-collision.md` — document the shipped V1.1 linking.

**Out of scope**
- Adding email verification to the Password provider (would enable auto-link; separate decision).
- Google account linking (same pattern, later).
- Unlinking / multi-provider management UI.

## Steps

### Step 1 — Server: shared token verify + authorize reorder (`convex/auth.ts`)

Extract the JWT verification (lines ~52-74) into:
```ts
async function verifyAppleIdentityToken(idToken: string): Promise<{ sub: string; email?: string; emailVerified: boolean; }>
```
(throws `InvalidAccountId` on failure, same as today; audience stays the hardcoded bundle id).

In `authorize`, after computing `sub`, BEFORE the collision check, look up an
existing apple-native account:
```ts
const linkedUserId = await ctx.runQuery(internal.authInternal.findAppleAccountUserId, { sub });
if (!linkedUserId && email && emailVerified && !email.endsWith(APPLE_RELAY_DOMAIN)) {
  const collision = await ctx.runQuery(internal.authInternal.checkSiwaEmailCollision, { email });
  if (collision === "collision") throw new Error("siwa_email_collision");
}
```
`createAccount` stays — when the sub is linked it returns the existing user; otherwise it creates. (Behavior unchanged for new/returning pure-Apple users; only adds the "already-linked sub never collides" path.)

**Verify**: `npx tsc --noEmit -p convex` → 0.

### Step 2 — Server: `findAppleAccountUserId` (`convex/authInternal.ts`)

```ts
export const findAppleAccountUserId = internalQuery({
  args: { sub: v.string() },
  returns: v.union(v.null(), v.id("users")),
  handler: async (ctx, { sub }) => {
    const acct = await ctx.db.query("authAccounts")
      .withIndex("providerAndAccountId", q => q.eq("provider", "apple-native").eq("providerAccountId", sub))
      .unique();
    return acct ? acct.userId : null;
  },
});
```

### Step 3 — Server: `linkApple` action + `attachAppleAccount` mutation (`convex/accountLinking.ts`, new)

```ts
"use node"; // jwtVerify fetches the JWKS — must run in a node action
```
- `linkApple` (public action): `userId = await getAuthUserId(ctx)`; throw `"not_authenticated"` if null. `verifyAppleIdentityToken(idToken)` → `sub`. `await ctx.runMutation(internal.accountLinking.attachAppleAccount, { userId, sub })`. Returns `{ status: "linked" | "already_linked" }`.
- `attachAppleAccount` (internal mutation): find apple-native account by sub (`providerAndAccountId`):
  - exists & `userId === args.userId` → return `"already_linked"`.
  - exists & different user → `throw new Error("apple_already_linked_elsewhere")`.
  - none → `ctx.db.insert("authAccounts", { userId, provider: "apple-native", providerAccountId: sub })`; return `"linked"`.

(Reuse `verifyAppleIdentityToken` — either export it from auth.ts or duplicate the small jose block here; prefer importing to keep one audience constant.)

**Verify**: `npx tsc --noEmit -p convex` → 0.

### Step 4 — Client: link sheet (`components/auth/link-apple-sheet.tsx`, new)

Props: `{ email: string; identityToken: string; onLinked: () => void; onCancel: () => void }`. Renders a labeled password input + "Link Apple" button + Cancel. On submit:
```ts
await signIn("password", { email, password, flow: "signIn" });   // proves account ownership
await linkApple({ idToken: identityToken });                      // useAction(api.accountLinking.linkApple)
onLinked();
```
Map errors: wrong password → "Incorrect password"; `apple_already_linked_elsewhere` → support copy. Every input gets `accessibilityLabel`+`accessibilityRole`; testIDs `link-apple-password`, `link-apple-submit`. Use the existing `Input`/`Button`/`Label` primitives.

### Step 5 — Client: wire collision → link sheet (`sign-in.tsx`, `sign-up.tsx`)

In `handleAppleSuccess`, on `siwa_email_collision`: stash `identityToken` + the Apple `credential.email` (fallback to the typed email field) in state and render `<LinkAppleSheet>`. On `onLinked`, proceed exactly like a successful sign-in (`capture("auth_succeeded")`, `focusHeading()`/navigate). Keep `SIWA_COLLISION_COPY` only as the fallback when no email is available to pre-fill.

### Step 6 — Client: Settings "Connect Apple" (`app/settings/index.tsx`)

iOS-only row (`Platform.OS === "ios"`, like the SIWA button gating): runs `AppleAuthentication.signInAsync` → `linkApple({ idToken })` while already authenticated. Success/`already_linked` → toast/inline "Apple connected". testID `settings-connect-apple`.

### Step 7 — Copy + docs

- `lib/privacy-notice.ts`: `SIWA_COLLISION_COPY` → "This email already has a password account. Enter your password to link Apple to it." (the sheet handles the action; copy is the explainer/fallback).
- `docs/siwa-email-collision.md`: replace the "V1.1 may add linking" note with the shipped design (this plan).

## Done criteria
- [ ] `npx tsc --noEmit -p convex` and `npx tsc --noEmit` exit 0; `pnpm lint` 0 errors
- [ ] `grep -c "linkApple" convex/accountLinking.ts components/auth/link-apple-sheet.tsx` → present
- [ ] `authorize` skips the collision check when `findAppleAccountUserId(sub)` is non-null
- [ ] `attachAppleAccount` refuses a sub linked to another user
- [ ] Collision UX shows the password→link sheet; Settings has a Connect Apple row
- [ ] `plans/README.md` row added

## STOP conditions
- `createAccount`/authAccounts insert shape differs from the excerpt (the manual `authAccounts` insert is the documented route, but verify the table's required fields via `convex/_generated/dataModel` before inserting; if it needs fields beyond `userId/provider/providerAccountId`, report).
- `getAuthUserId` is unavailable in a node action in this `@convex-dev/auth` version (verify; if so, do the auth check in the mutation via an authenticated `ctx.runMutation` path and report).
- Any change would weaken the security model (email-only linking, skipping the anti-hijack check) — STOP.

## Deploy + verify (operator)
Convex changes only take effect once deployed to the deployment the app uses:
`pnpm convex:dev` (dev) or `npx convex deploy`. Then on a device: SIWA with the
colliding email → password→link sheet → signed in; repeat SIWA → signs straight
in (sub now linked). Full e2e needs a real Apple ID, so it's an operator step.

## Maintenance notes
- The manual `authAccounts` insert bypasses `@convex-dev/auth`'s account helpers (no public link primitive in 0.0.90) — re-check on any auth-package upgrade (see `docs/auth-upgrade.md`, plan 020).
- If email verification is later added, "auto-link on verified email" becomes a safe additional path.

# Sign-in-with-Apple ↔ Email-password Collision Handling (V1.1)

## Background

Security CR5 and Observability #5 flagged a risk where a user who had already
signed up with an email + password could then sign in with Apple using the
same email address. Without intervention, `@convex-dev/auth` would happily
create a second `authAccounts` row tied to the same email but a fresh `users`
row, splitting the user's data across two identities.

## Collision guard (the safety net)

The native `apple-native` `ConvexCredentials` provider in `convex/auth.ts`
(`authorize`) does, after verifying the Apple identity token:

1. Looks up an existing `apple-native` account for the token's `sub` via
   `internal.authInternal.findAppleAccountUserId`. If the `sub` is already
   linked to a user (a returning sign-in, OR an account linked through the
   flow below), it is a normal sign-in — the collision check is **skipped**
   and `createAccount` resolves to that user.
2. Otherwise, if the token carries a verified, non-relay email, it calls
   `internal.authInternal.checkSiwaEmailCollision`. If that email belongs to a
   user with at least one **non-apple-native** account (email+password or
   Google), it throws `siwa_email_collision`.
3. If an **unlinked** sub arrives with **no email at all**, it also throws
   `siwa_email_collision`. Apple omits the email on authorizations after the
   first, so an unlinked + email-less token can only be a sub that previously
   surfaced an email and never finished linking (a genuine new user's first
   token always carries the email; relay/pure-Apple users are linked by
   `createAccount` on that first token). We can't run the collision check
   without an email, so we refuse rather than create a split account — the
   client routes this to the link sheet, which collects the email + password.

Relay addresses (`@privaterelay.appleid.com`) are authoritative identities for
their Apple users, so the collision check skips them on purpose.

The same logic runs ahead of sign-in in `checkAppleSignIn` (returns
`"needs_link"` for both the collision and the unlinked-no-email cases), so the
client shows the link sheet without a thrown-error round-trip.

No silent double-account is ever created.

## V1.1: account linking (the recourse)

The collision is no longer a dead-end. The client turns `siwa_email_collision`
into a **password → link** flow that attaches the Apple identity to the
existing account.

### Security model (non-negotiable)

Linking attaches an `apple-native` identity to an existing user. It is only
safe with proof of **both**:

1. **The existing account** — proven by signing in to it (password re-auth at
   the collision, or being already authenticated in Settings). **Not** by an
   email match: emails are unverified in this app (the `Password` provider is
   configured bare), so an email match proves nothing.
2. **The Apple identity** — proven by a verified Apple identity token (the
   existing jose JWKS verification, shared via `verifyAppleIdentityToken`).

Plus an **anti-hijack** rule: `attachAppleAccount` refuses to attach an Apple
`sub` already linked to a *different* user.

We deliberately do **not** auto-link on verified-email match — that would be
insecure here. If email verification is added later, auto-link on a verified
email becomes a safe additional path.

### Flows

- **At the collision** (`app/(auth)/sign-in.tsx`, `sign-up.tsx`): the verified
  identity token + colliding email are captured and `LinkAppleSheet`
  (`components/auth/link-apple-sheet.tsx`) opens. The user enters their
  password → `signIn("password", …)` proves ownership → `linkApple({ idToken })`
  attaches Apple → the session is signed in.
- **From Settings** (`app/settings/index.tsx`, iOS-only "Connect Apple" row):
  the user is already authenticated, runs SIWA, and `linkApple({ idToken })`
  attaches the Apple identity to the current account.

### Server pieces

- `convex/auth.ts` — `verifyAppleIdentityToken` (shared token verify) and the
  `authorize` reorder (skip collision when `sub` already linked).
- `convex/authInternal.ts` — `findAppleAccountUserId({ sub })`.
- `convex/accountLinking.ts` — `linkApple` action (`getAuthUserId` →
  verify token → mutation) + `attachAppleAccount` internal mutation (inserts
  the `authAccounts` row; enforces anti-hijack). Stays in the default Convex
  runtime, **not** `"use node"` — `jose` runs there, and a node module cannot
  also export the mutation.

The manual `authAccounts` insert bypasses `@convex-dev/auth`'s account helpers
because 0.0.90 has no public link primitive — re-check on any auth-package
upgrade (see `docs/auth-upgrade.md`, plan 020).

## Where the knobs live

- Server: `convex/auth.ts` (`APPLE_RELAY_DOMAIN`, `APPLE_AUDIENCE`,
  `verifyAppleIdentityToken`, the `authorize` reorder), `convex/authInternal.ts`
  (`checkSiwaEmailCollision`, `findAppleAccountUserId`),
  `convex/accountLinking.ts` (`linkApple`, `attachAppleAccount`).
- Client copy: `lib/privacy-notice.ts` (`SIWA_COLLISION_COPY` — now only the
  fallback when no email is available to pre-fill the sheet).
- Client UI: `components/auth/link-apple-sheet.tsx`, `app/(auth)/sign-up.tsx`,
  `app/(auth)/sign-in.tsx`, `app/settings/index.tsx`, and
  `components/auth/apple-sign-in-button.tsx`.

## Operational notes

- Convex changes only take effect once deployed (`pnpm convex:dev` for dev, or
  `npx convex deploy`). Full SIWA e2e needs a real Apple ID, so verifying the
  link round-trip on device is an operator step.
- If Apple changes the relay TLD (beyond `@privaterelay.appleid.com`), update
  the suffix check in `convex/auth.ts`.
- If inbound support mail reports "I can't sign in with Apple anymore," the
  first candidate is a legitimate collision — the user should sign in with
  their original email + password (or use the link sheet) to connect Apple. A
  report of "Apple ID already linked to a different account" is the anti-hijack
  rule firing.

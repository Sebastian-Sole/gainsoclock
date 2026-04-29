# Sign-in-with-Apple ↔ Email-password Collision Handling (V1)

## Background

Security CR5 and Observability #5 flagged a risk where a user who had already
signed up with an email + password could then sign in with Apple using the
same email address. Without intervention, `@convex-dev/auth` would happily
create a second `authAccounts` row tied to the same email but a fresh `users`
row, splitting the user's data across two identities.

## V1 behaviour

`convex/auth.ts` installs a `callbacks.createOrUpdateUser` override that, on
every OAuth sign-in via the Apple provider with no linked user yet:

1. Looks up `users` by the email returned from Apple.
2. If a matching user exists, collects their `authAccounts` and checks
   whether any of them belong to a provider other than `"apple"`.
3. If the email is NOT an Apple-relay address
   (`@privaterelay.appleid.com`) **and** the existing user has a non-Apple
   account, it throws a typed error with message `siwa_email_collision`.

Relay addresses are authoritative identities for their Apple users, so the
collision check skips them on purpose — Apple deliberately routes those to
Hide-My-Email relays and the underlying email never collides with a
password account.

The client (`components/auth/apple-sign-in-button.tsx` +
`app/(auth)/sign-up.tsx` / `sign-in.tsx`) catches the error, maps it to
`SIWA_COLLISION_COPY` (see `lib/privacy-notice.ts`), and surfaces the
message: *"This email is already used for sign-in with a password. Please
sign in with email first, or contact support@fitbull.app to link Apple."*

No silent double-account is created.

## Account linking in later versions

`@convex-dev/auth@0.0.90` does not expose a first-class "link this Apple
account to an existing user" primitive via the public SDK. V1 documents the
collision behaviour; V1.1+ may add an explicit linking flow (e.g. from
Settings) once the SDK surfaces a primitive.

## Where the knobs live

- Server check: `convex/auth.ts` (`APPLE_RELAY_DOMAIN` + `createOrUpdateUser`
  override)
- Client copy: `lib/privacy-notice.ts` (`SIWA_COLLISION_COPY`)
- Client mapping: `app/(auth)/sign-up.tsx`, `app/(auth)/sign-in.tsx`, and
  `components/auth/apple-sign-in-button.tsx`

## Operational notes

- If Apple changes the relay TLD (e.g. adds a new domain beyond
  `@privaterelay.appleid.com`), update the suffix list in `convex/auth.ts`.
- If inbound support mail reports "I can't sign in with Apple anymore," the
  first candidate is a legitimate collision — ask the user to sign in with
  their original email + password and contact support to link Apple.

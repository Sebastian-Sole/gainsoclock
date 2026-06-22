# Upgrading @convex-dev/auth

The version is pinned exactly: pre-1.0, no semver promise, and the SIWA
collision handling in `convex/auth.ts` is coupled to 0.0.90 behavior
(see docs/siwa-email-collision.md — V1 exists because 0.0.90 has no
account-linking primitive).

## Procedure (in order; abort on any failure)

1. Read the package's changelog/release notes between the pinned and target
   versions; list every change touching: createOrUpdateUser callbacks,
   ConvexCredentials, Password provider, token storage, authTables schema.
2. If the target version adds an account-linking primitive: STOP — the SIWA
   V1.1 plan in docs/siwa-email-collision.md ("Account linking in later
   versions") supersedes a plain bump; design that first.
3. Bump in a branch; run `npx tsc --noEmit`, `npx tsc --noEmit -p convex`,
   `pnpm lint`.
4. Deploy to the dev Convex deployment (`pnpm convex:dev`) and exercise, on
   a device/simulator: email sign-up, email sign-in, native SIWA sign-in,
   the SIWA collision path (Apple sign-in with an email that has a password
   account → expect the `siwa_email_collision` error copy), and sign-out.
5. Run the auth-related Maestro flows (`.maestro/` — see the suite README)
   if the simulator environment is available.
6. Only then merge; watch Sentry for auth errors after release.

## Owner

Sebastian. Auth changes never ride along in unrelated dependency-bump PRs.

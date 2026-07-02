# Plan 045: Bind a server-issued nonce into Sign-in-with-Apple verification (investigate, then implement)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- convex/auth.ts convex/accountLinking.ts convex/schema.ts "app/(auth)/sign-in.tsx" "app/(auth)/sign-up.tsx" components/auth/link-apple-sheet.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (plus an investigation step that can end the plan early)
- **Risk**: MED — this is the sign-in path; a wrong nonce check locks users out
- **Depends on**: none
- **Category**: security (hardening; residual risk is code-acknowledged and bounded)
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

Apple identity-token verification checks issuer, audience, signature, and
expiry, plus a `maxTokenAge: "10m"` bound — but no nonce. The code's own
comment says it: the age bound "BOUNDS the replay window but does not
eliminate it — full elimination needs a server-issued nonce bound into the
request (a challenge round-trip; future hardening)." Concretely: a captured,
still-fresh token for an *unlinked* Apple `sub` could be replayed by an
authenticated actor to `linkApple` (binding the victim's Apple identity to
the actor's account) or to the sign-in path. The anti-hijack rule already
prevents re-pointing an already-linked `sub`, so this is scheduled hardening
for a bounded residual, not an open hole. This plan does the round-trip.

## Current state

- `convex/auth.ts:39-79` — `verifyAppleIdentityToken(idToken)`:

  ```ts
  const result = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: APPLE_AUDIENCE,
    // ... comment explaining maxTokenAge bounds-but-not-eliminates replay,
    //     nonce round-trip named as future hardening ...
    maxTokenAge: "10m",
  });
  ```

  Callers of `verifyAppleIdentityToken`: (1) the `authorize` path of the
  `apple-native` credentials provider in `convex/auth.ts` (sign-in/up),
  (2) `convex/accountLinking.ts:49` (`checkAppleSignIn` pre-flight) and
  `:109` (`linkApple`).
- `convex/accountLinking.ts` — `checkAppleSignIn` (action, pre-flight,
  lines 45-83), `linkApple` (action, lines 95-116), `attachAppleAccount`
  (internalMutation with anti-hijack, lines 123-154).
- Client call sites of the Apple flow:
  - `app/(auth)/sign-in.tsx` — `credential.identityToken` obtained around
    line 140 (from `expo-apple-authentication`), pre-flight
    `checkAppleSignIn({ idToken })` at line 146, `signIn` with
    `id_token` at line 170, and the link-sheet handoff (lines 147-152, 394+).
  - `app/(auth)/sign-up.tsx` — the mirrored flow.
  - `components/auth/link-apple-sheet.tsx:92` — `linkApple({ idToken })`.
- `expo-crypto` is already a dependency (`package.json`) —
  `Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s)` and
  `Crypto.randomUUID()` are available client-side.
- `convex/schema.ts` — where a nonce table would go; index conventions per
  `.claude/rules/coding-conventions.md` (declare indexes in schema).
- Apple's contract: the app sets a `nonce` on the SIWA request; the issued
  identity token carries a `nonce` claim. Per Apple's docs the request
  should carry the **SHA-256 hash** of the raw nonce, and the token's claim
  equals the request value.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck app | `npx tsc --noEmit` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `convex/schema.ts` (nonce table + index)
- `convex/auth.ts` (`verifyAppleIdentityToken` signature + `authorize` plumbing)
- `convex/accountLinking.ts` (mint action; nonce checks in the two verifiers)
- `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`,
  `components/auth/link-apple-sheet.tsx` (request the nonce, pass it through)

**Out of scope** (do NOT touch):
- `convex/authInternal.ts`, the collision logic, `attachAppleAccount`'s
  anti-hijack rule.
- `@convex-dev/auth` upgrade or configuration beyond passing params
  (`docs/auth-upgrade.md` governs upgrades).
- Google/password providers.

## Steps

### Step 1 — INVESTIGATE (may end the plan): pin down the two unknowns

1. **Does `expo-apple-authentication` hash the nonce for you?** Read the
   installed package's docs/types
   (`node_modules/expo-apple-authentication/build/*.d.ts`, the
   `AppleAuthenticationSignInOptions.nonce` docstring). Determine whether
   the token's `nonce` claim will equal the string you pass (you pre-hash
   yourself) or its SHA-256 (the lib hashes). Record the answer with the
   docstring quoted.
2. **Can `signIn("apple-native", params)` carry extra params to
   `authorize`?** Read how `app/(auth)/sign-in.tsx:170` passes `id_token`
   today and where `authorize` receives it in `convex/auth.ts` — confirm an
   additional `rawNonce` param flows the same way.

**If either answer is "no/can't"**: STOP, write the findings into the plan's
status row (BLOCKED with reason), and report. Do not build a partial scheme
(e.g. client-generated nonce without server issuance) — a client-only nonce
does not stop replay by the token holder.

### Step 2: Server — nonce table + mint action

- `convex/schema.ts`: add

  ```ts
  siwaNonces: defineTable({
    hash: v.string(),          // SHA-256 hex of the raw nonce
    createdAt: v.number(),     // Date.now()
    consumedAt: v.optional(v.number()),
  }).index("by_hash", ["hash"]),
  ```

- `convex/accountLinking.ts` (or a new `convex/siwaNonce.ts` if you prefer
  one-topic files — match `convex/<domain>.ts` convention): a public
  `mintSiwaNonce` action/mutation that generates 32 random bytes (hex),
  stores the SHA-256 hash with `createdAt`, and returns the raw nonce. No
  auth required (pre-sign-in), but rate exposure is bounded: add a TTL
  sweep (delete rows older than 15 min) inline on mint.
- Internal helpers: `consumeSiwaNonce(hash)` — mutation that loads by
  `by_hash`, rejects when missing/consumed/older than 10 min, else stamps
  `consumedAt`. `peekSiwaNonce(hash)` — query for the non-consuming
  pre-flight check.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 3: Server — thread the nonce through verification

- Extend `verifyAppleIdentityToken(idToken, rawNonce?)`: after `jwtVerify`,
  when `rawNonce` is provided, compare the token's `nonce` claim against
  the Step-1-determined encoding of `rawNonce` (plain or SHA-256); mismatch
  or missing claim → `throw new Error("InvalidAccountId")`. When `rawNonce`
  is absent, behave as today (needed during rollout; see Step 5).
- `linkApple`: accept `rawNonce: v.optional(v.string())`; when present,
  verify claim match AND `consumeSiwaNonce`.
- `authorize` (sign-in path in `convex/auth.ts`): same — read `rawNonce`
  from params, verify + consume when present.
- `checkAppleSignIn`: verify claim match + `peekSiwaNonce` (do NOT consume —
  the same token proceeds to `signIn` right after).

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 4: Client — request with the nonce, pass it through

In each of the three flows (sign-in, sign-up, link sheet): call
`mintSiwaNonce` → get raw nonce → compute the request value per Step 1's
answer (pre-hash with `expo-crypto` if the lib doesn't) → include it in
`AppleAuthentication.signInAsync({ ..., nonce })` → pass `rawNonce`
alongside the token to `checkAppleSignIn` / `signIn("apple-native", ...)` /
`linkApple`. The link sheet receives its token from the sign-in screen —
thread the rawNonce through the same props/state
(`app/(auth)/sign-in.tsx:147-152` stores `identityToken` for the sheet;
store the nonce next to it).

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm lint` → exit 0.

### Step 5: Rollout note (report, no code)

Old clients in the field send no nonce; the optional-param design keeps
them working. In your report, state explicitly: enforcement (rejecting
nonce-less tokens) is a LATER operator step, once store uptake is
sufficient — mirroring how the meal-photo grace window (plan 041) is being
closed. Recommend a target: "enforce after the next release + 60 days".

## Test plan

- Convex has no unit runner (settled decision). The verifiable pieces:
  typechecks, plus — if a dev deployment and simulator are available
  (operator-assisted) — one full SIWA sign-in and one link-sheet flow on
  device, confirming (a) happy path works with nonce, (b) reusing a
  consumed nonce fails with `InvalidAccountId`.
- If you cannot run on device, say so; the plan then ships as
  code-complete-pending-operator-verification (status row: note it).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "siwaNonces" convex/schema.ts` → 1
- [ ] `grep -c "rawNonce" convex/auth.ts convex/accountLinking.ts` → ≥4 combined
- [ ] All three client flows mint + pass a nonce (`grep -rn "mintSiwaNonce" app components` → 3 call sites)
- [ ] `npx tsc --noEmit`, `npx tsc --noEmit -p convex`, `pnpm lint` all exit 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated (note: Convex deploy + on-device verify are operator steps)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds either unknown answers "no" (BLOCKED, with the evidence).
- `authorize` cannot access extra sign-in params without patching
  `@convex-dev/auth` (pinned at 0.0.90 — patching it is out of scope,
  `docs/auth-upgrade.md` governs).
- Apple's token `nonce` claim doesn't match either encoding in a real
  device test — report the raw claim shape; do not loosen the comparison
  to "accept both".

## Maintenance notes

- The optional-`rawNonce` phase is deliberately permissive — the follow-up
  enforcement flip (reject nonce-less verifications) is a one-line change
  per verifier plus a client-version check; track it in the index when this
  lands.
- Reviewer: the nonce comparison must be exact string equality on the
  verified payload's claim (post-`jwtVerify`, never pre-verification), and
  `consumeSiwaNonce` must be transactional (Convex mutation — it is, if
  implemented as one mutation, per the serializability note in
  `convex/accountLinking.ts:127-133`).
- Any future auth-package upgrade must re-test this plumbing
  (`docs/auth-upgrade.md` already requires an e2e pass of the SIWA flows).

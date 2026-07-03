# Plan 047: Surface linkApple failures that happen after the password sign-in succeeds

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- components/auth/link-apple-sheet.tsx "app/(auth)/sign-in.tsx" "app/(auth)/sign-up.tsx"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M (starts with a required trace step)
- **Risk**: MED (auth-flow UX; no server changes)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

The Apple↔password link sheet does two awaited operations in sequence:
`signIn("password", ...)` (proves ownership of the existing account) and
then `linkApple({ idToken })` (attaches the Apple identity). The first call
flips the app's auth state — which typically triggers the auth-group
redirect and unmounts the sign-in screen *and the sheet rendered inside
it*. If `linkApple` then fails (its documented error path:
`apple_already_linked_elsewhere`, or a transient failure), the
`setError(...)` in the catch runs on an unmounted component: the user ends
up signed in, Apple silently NOT linked, no error shown — and hits the same
collision again next time they try Apple sign-in. The fix: make the failure
surfacing survive unmount, and log it.

## Current state

- `components/auth/link-apple-sheet.tsx:83-99` — the sequence:

  ```ts
  try {
    // 1. Prove ownership of the existing account.
    await signIn("password", { email: trimmedEmail, password, flow: "signIn" });
    // 2. Attach the verified Apple identity to it (server re-verifies the
    //    token and enforces the anti-hijack rule).
    await linkApple({ idToken: identityToken });
    onLinked();
  } catch (err) {
    setError(getLinkErrorMessage(err));
  } finally {
    setIsLoading(false);
  }
  ```

  `getLinkErrorMessage` maps known server errors (find it in the same file)
  — including `apple_already_linked_elsewhere` thrown by
  `convex/accountLinking.ts:144`.
- Host wiring: `app/(auth)/sign-in.tsx` renders `<LinkAppleSheet ...>` at
  line ~394 with `identityToken` captured from the collision pre-flight
  (lines 146-152); `app/(auth)/sign-up.tsx` mirrors it. `onLinked` and the
  sheet's visibility are controlled by the host screen's state.
- What actually happens on auth flip is THE open question: the `(auth)`
  group's layout / root layout redirect logic decides whether the sign-in
  screen unmounts between step 1 and step 2. This plan's Step 1 traces it.
- Conventions: user-facing alerts elsewhere in the app use
  `Alert.alert(...)` from react-native (e.g. the delete flow in
  `app/plan/[id].tsx:170-196`); `Alert` is imperative and survives any
  unmount. No `console.log` in committed code; `console.warn` for
  operator-visible anomalies is established (`lib/convex-sync.ts:152`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | exit 0 |

## Scope

**In scope**:
- `components/auth/link-apple-sheet.tsx`
- `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx` — ONLY if Step 1 shows
  the host must delay its redirect/unmount (see Step 3, option B).

**Out of scope** (do NOT touch):
- `convex/accountLinking.ts`, `convex/auth.ts` — the server contract is
  correct; this is client UX.
- The password sign-in itself, the collision pre-flight, the sheet's form
  validation.
- Navigation structure / `(auth)` layout redirects in general.

## Git workflow

- Branch: `advisor/047-link-sheet-errors`
- Commit style: `fix(auth): surface linkApple failures after password re-auth`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Trace the unmount (required, written into the report)

Read the navigation chain: `app/_layout.tsx` (how auth state gates the
route groups) and `app/(auth)/_layout.tsx` if present. Answer: when
`signIn("password")` resolves, does the sign-in screen (and the sheet)
unmount before `await linkApple(...)` settles? Note the exact
mechanism (e.g. a `<Redirect>` on `isAuthenticated`, an effect in the
root layout). If you can run the simulator, reproduce once: trigger the
sheet (needs two accounts — if no test accounts are available, the static
trace suffices; say which you did).

**Verify**: your report contains the mechanism with `file:line`.

### Step 2: Make failure surfacing unmount-proof

In `link-apple-sheet.tsx`, change the catch to an imperative alert plus an
operator-visible log, keeping `setError` for the still-mounted case:

```ts
} catch (err) {
  const message = getLinkErrorMessage(err);
  console.warn(`[link-apple] linking failed after password sign-in: ${message}`);
  setError(message);           // no-op if unmounted; correct if still mounted
  Alert.alert(
    "Apple ID not linked",
    `${message}\n\nYou are signed in, but Apple Sign-In was not connected. You can link it from Settings.`
  );
}
```

Notes: never log or alert the identity token; the copy must state the
user IS signed in (true — step 1 succeeded) and point at the Settings link
path (the Settings-initiated linking flow exists per `plans/033`; confirm
the exact settings route label by grepping `linkApple` under `app/settings/`
and name it accurately in the copy).

**Verify**: `npx tsc --noEmit` → 0; `pnpm lint` → 0.

### Step 3: Only if Step 1 showed a *guaranteed* immediate unmount that also
kills in-flight UI (e.g. the whole navigator swaps)

Option A (preferred, minimal): nothing more — `Alert` is presented at the
OS level and survives navigator swaps. Confirm that's true for this app's
setup (it is for stock RN `Alert` on iOS).

Option B (only if Alert provably cannot present): hold the redirect until
linking settles — e.g. the host screen sets a "linking in progress" flag
that the redirect effect respects for ≤10 s. This touches the two host
screens; keep the flag local, no store changes. Do NOT reach for option B
without evidence A fails.

**Verify**: whichever option, `pnpm test` → 0 and a manual/simulator pass
if available (report which).

## Test plan

- No component-test runner exists by decision (`docs/decisions/test-runner.md`
  — component testing is a separate stack decision; do NOT add one).
- `getLinkErrorMessage` is a pure function in the sheet file — if it isn't
  already exported, do not export it just for tests; leave unit coverage
  out and rely on the manual pass. (If it IS exported, add
  `lib/`-conventional tests only if it lives under `lib/`; it doesn't — skip.)
- The gate is: static checks + the Step 1 trace + (if available) one
  simulator reproduction showing the alert after a forced
  `apple_already_linked_elsewhere` (you can force it by attempting to link
  an Apple ID already linked to another test account — operator-assisted).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "Alert.alert" components/auth/link-apple-sheet.tsx` → ≥1 in the linkApple catch path
- [ ] `grep -c "console.warn" components/auth/link-apple-sheet.tsx` → 1
- [ ] `npx tsc --noEmit`, `pnpm lint`, `pnpm test` all exit 0
- [ ] Report contains the Step 1 unmount trace with file:line
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 reveals the sheet does NOT unmount (auth flip doesn't redirect
  until the sheet closes) — then the original `setError` already works, the
  bug doesn't exist as described; report and mark the plan REJECTED with
  the trace as evidence. (The `console.warn` from Step 2 is still worth
  keeping — say so.)
- The fix seems to require changing the `(auth)` redirect logic globally
  (option B beyond a local flag) — report; navigation architecture is not
  this plan's call.

## Maintenance notes

- Plan 045 (SIWA nonce) touches the same files — sequence them, don't run
  concurrently.
- Reviewer: check the alert copy against what actually happened (user IS
  signed in; Apple NOT linked) — miscopy here would tell users the opposite
  of the truth.
- Future: if a Settings-based "Link Apple" entry point doesn't exist yet
  (Step 2's grep will tell), the alert copy must not promise it — adjust to
  "try Apple sign-in again later" and note the gap in the report.

# Plan 034: CI runs the unit suite and fast tripwires on every PR

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- .github/workflows/checks.yml .github/workflows/react-compiler-healthcheck.yml docs/env.md scripts/check-maestro-ids.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

The repo has a Vitest characterization suite (`pnpm test`, 5 files under
`lib/`) that was created specifically to protect the "dangerous untested
core": offline-queue drop semantics, two-timezone streak math, comma-decimal
parsers, and calorie math. The decision doc `docs/decisions/test-runner.md`
lines 75-77 explicitly records that adding a `pnpm test` step to CI was an
owed follow-up — it never happened. Today a PR can break exactly the
regressions the suite exists to catch and CI stays green. Two smaller gaps
ride along: the 2-second Maestro flow-id tripwire only runs in the *weekly*
canary (deferring a broken e2e selector up to a week), and the React Compiler
healthcheck skips the render-hottest screens (`app/workout`,
`components/workout`). Finally, `docs/env.md` documents the wrong PostHog
default host — actively misleading for an EU-hosted app.

## Current state

- `.github/workflows/checks.yml` — the PR gate. Runs typecheck + lint only:

  ```yaml
  # .github/workflows/checks.yml:37-41
      - name: Typecheck
        run: npx tsc --noEmit

      - name: Lint
        run: pnpm lint
  ```

- `package.json:14` — `"test": "vitest run"`. Vitest is configured in
  `vitest.config.ts` (node environment, `lib/**/*.test.ts`, `@` alias).
- `scripts/check-maestro-ids.mjs` — zero-dependency Node script that fails
  when a `.maestro/` flow references a `testID` no component renders. Its
  only CI invocation is `.github/workflows/canary-walker.yml:43`
  (`run: node scripts/check-maestro-ids.mjs`), which runs on a Monday cron.
- `.github/workflows/react-compiler-healthcheck.yml:41-45` — scoped globs:

  ```yaml
          npx --yes react-compiler-healthcheck \
            --src "app/onboarding/**/*.{ts,tsx}" \
            --src "components/onboarding/**/*.{ts,tsx}" \
            --src "components/paywall/**/*.{ts,tsx}" \
            --src "components/home/**/*.{ts,tsx}" \
            --verbose
  ```

  `app/workout/**` and `components/workout/**` (the screens plan 012 hardened
  against per-keystroke re-renders) are not covered.
- `docs/env.md:45`:

  ```
  | `POSTHOG_HOST` | PostHog ingest host | `convex/analytics.ts` | Defaults to `https://app.posthog.com` if unset |
  ```

  The code defaults to EU in both server files:
  `convex/analytics.ts:71` and `convex/posthogServer.ts:28` are
  `process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (required first — local node_modules may predate vitest) | `pnpm install` | exit 0 |
| Tests | `pnpm test` | exit 0, all files pass |
| Maestro tripwire | `node scripts/check-maestro-ids.mjs` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/checks.yml`
- `.github/workflows/react-compiler-healthcheck.yml`
- `docs/env.md`

**Out of scope** (do NOT touch, even though they look related):
- `.github/workflows/canary-walker.yml` — keep its weekly tripwire run; it is
  the canary's own preflight.
- `scripts/check-maestro-ids.mjs` — no changes to the script itself.
- Adding new tests — plans 035/036/042/046/048 own that.
- `vitest.config.ts`, `package.json` — no config changes needed.

## Git workflow

- Branch: `advisor/034-ci-test-gate`
- Commit style: conventional commits, e.g. `ci: run vitest + maestro-id tripwire on every PR` (repo history example: `fix(templates): queue-aware last-write-wins hydration merge`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the local baseline is green

Run `pnpm install`, then `pnpm test`. All test files must pass. If any test
fails on an unmodified checkout, STOP (the baseline is broken; adding the CI
step would redline every PR).

**Verify**: `pnpm test` → exit 0.

### Step 2: Add the test and tripwire steps to checks.yml

In `.github/workflows/checks.yml`, after the `Lint` step, add:

```yaml
      - name: Unit tests
        run: pnpm test

      - name: Maestro flow-id tripwire
        run: node scripts/check-maestro-ids.mjs
```

Keep indentation identical to the existing steps (6 spaces before `- name:`).

**Verify**: `grep -A1 "Unit tests" .github/workflows/checks.yml` shows
`run: pnpm test`; `node scripts/check-maestro-ids.mjs` → exit 0 locally.

### Step 3: Extend the compiler healthcheck to the workout screens

First run the healthcheck locally on the new dirs only:

```bash
npx --yes react-compiler-healthcheck --src "app/workout/**/*.{ts,tsx}" --src "components/workout/**/*.{ts,tsx}" --verbose
```

- If it reports failures/bailouts: STOP and report the output — do not add
  the globs (the workflow would go permanently red; the bailouts need their
  own triage).
- If clean: add the two `--src` lines to
  `.github/workflows/react-compiler-healthcheck.yml` alongside the existing
  four, AND add the matching `"app/workout/**"` / `"components/workout/**"`
  entries to the `on.pull_request.paths` trigger filter at the top of the
  workflow — without the trigger paths, the new `--src` globs are unreachable
  on a workout-only PR. *(Amended 2026-07-02 during execution review; the
  original plan omitted the trigger filter and the executor correctly
  flagged it.)*

**Verify**: the local healthcheck run over all six globs exits 0.

### Step 4: Fix the PostHog default in docs/env.md

Change line 45's Notes cell from `Defaults to `https://app.posthog.com` if
unset` to `Defaults to `https://eu.i.posthog.com` if unset` (match the code).

**Verify**: `grep -n "eu.i.posthog.com" docs/env.md` → one match on the
`POSTHOG_HOST` row; `grep -n "app.posthog.com" docs/env.md` → no matches.

## Test plan

No new test files — this plan wires existing checks into CI. The
verification is the local dry-run of each command CI will run (steps 1-3).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 locally
- [ ] `grep -c "pnpm test" .github/workflows/checks.yml` → 1
- [ ] `grep -c "check-maestro-ids" .github/workflows/checks.yml` → 1
- [ ] `grep -c "workout" .github/workflows/react-compiler-healthcheck.yml` → 4 — two in the `paths:` trigger, two in `--src` (or 0 if Step 3 STOPped — say which in your report)
- [ ] `grep -c "app.posthog.com" docs/env.md` → 0
- [ ] `git status` shows only the three in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm test` fails on the unmodified checkout (baseline broken).
- The compiler healthcheck reports bailouts in `app/workout`/`components/workout`
  (report the exact output; that becomes its own finding).
- `checks.yml` no longer matches the excerpt (someone already added a test step).

## Maintenance notes

- Once `pnpm test` gates PRs, plans 035/036/042/046/048 (which add test
  files) automatically get CI protection — this plan should land first.
- Reviewer: check the workflow YAML indentation (a mis-indented step silently
  drops out of the job) and that no `continue-on-error` was added.
- Deferred: adding a coverage threshold — the suite is characterization-first
  and small; thresholds would be noise today.

---
description: "Run comprehensive verification -- types, lint, Convex typecheck, console.log audit"
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
argument-hint: "<quick|full|pre-commit|pre-pr>"
---

# Verification Command

Run verification on the current codebase state. Fitbull has no build or test script yet -- the chain is types + lint + Convex typecheck + audits.

## Instructions

Run in this order. Stop and report on the first hard failure (types or Convex types). Continue past lint warnings.

1. **Type Check (app)**
   - `npx --no-install tsc --noEmit`
   - Report errors with `file:line`. Root `tsconfig.json` excludes `convex/`.

2. **Type Check (Convex)** -- only if `convex/` was touched.
   - `pnpm exec convex codegen` then `pnpm exec convex dev --once` (or skip if Convex isn't configured locally; note it in the report).

3. **Lint**
   - `pnpm lint` (`expo lint` -- ESLint 9 + `eslint-config-expo`, includes jsx-a11y).
   - Report warnings and errors.

4. **Console.log Audit**
   - `grep -rnE 'console\.(log|debug|warn|error)\(' app components hooks lib providers stores | grep -v __DEV__`
   - Report locations.

5. **Dependency Audit** -- only on `pre-pr`.
   - `pnpm audit --audit-level=high`

6. **Git Status**
   - `git status --porcelain`
   - `git diff --stat HEAD`

## Output

```
VERIFICATION: [PASS | FAIL]

Types (app):    [OK | X errors]
Types (Convex): [OK | X errors | skipped]
Lint:           [OK | X issues]
Console.log:    [OK | X unguarded]
Audit:          [OK | X advisories | skipped]

Ready for PR: [YES | NO]
```

List critical failures with the exact fix.

## Arguments

`$ARGUMENTS` can be:

- `quick` -- types only (steps 1-2)
- `full` -- steps 1-4 (default)
- `pre-commit` -- steps 1, 3, 4
- `pre-pr` -- all six steps

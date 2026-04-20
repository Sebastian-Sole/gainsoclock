---
name: pre-commit-check
description: "Fires when completing work before a commit, or running a quality gate after code changes. Covers build, types, lint, tests, security, and diff review."
---

# Pre-Commit Check

Post-change quality gate. Run after completing work and before committing.

## When to Use

- After completing a feature or significant code change
- Before creating a PR
- After refactoring

## Verification Phases

Run each phase in order. If a phase fails, stop and fix before continuing.

### Phase 1: Build Verification

Check if the project builds. See CLAUDE.md Quick Reference for the build command.

If build fails, STOP and fix before continuing.

### Phase 2: Type Check

Run the project's TypeScript type check (see CLAUDE.md Quick Reference).

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check

Run the project's lint command. This project uses Biome for both linting and formatting in a single pass. See CLAUDE.md for the exact command.

### Phase 4: Test Suite

Run unit tests with coverage. Report:
- Total tests: X
- Passed: X
- Failed: X
- Coverage: X%

For new features, target 80% coverage on new code. For bug fixes, verify the regression test passes.

### Phase 5: Security Scan

Check for accidentally committed secrets or debug artifacts in the changed files:
- API keys, tokens, credentials
- `.env` values hardcoded in source
- `console.log` statements in committed code

Use `git diff --cached` to scope the check to staged changes only.

### Phase 6: Diff Review

Review each changed file for:
- Unintended changes (accidental whitespace, unrelated edits)
- Missing error handling on new code paths
- Accessibility issues (semantic HTML, ARIA, keyboard support)
- Potential edge cases

## Output Format

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for commit

Issues to Fix:
1. ...
2. ...
```

## This Skill IS / IS NOT

- **IS**: A quality gate to run after completing work, before committing
- **IS NOT**: The `/verify` command (which runs against the full codebase state, not just staged changes)
- **IS NOT**: A replacement for the review pipeline (`node .claude/scripts/run-review.js`)

## Gotchas

- **Phase order matters.** Build errors cause cascading type errors — always fix build first before interpreting type check results.
- **`git diff --cached` for security scan.** Scope the secrets check to staged changes only, not the entire codebase — otherwise you'll get noise from test fixtures and examples.
- **Biome handles both lint and format.** Running `biome check` is sufficient — don't run separate lint and format commands.

## Cross-References

- **Test commands**: See CLAUDE.md Quick Reference for exact commands
- **Lint config**: Biome — see `biome.json` for rules
- **A11y verification**: See `apps/web/CLAUDE.md` Accessibility Verification section for the three-layer approach

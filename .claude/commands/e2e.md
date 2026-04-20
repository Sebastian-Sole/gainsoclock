---
description: "Run Maestro end-to-end flows against a booted iOS simulator"
allowed-tools:
  - Bash
  - Read
  - Glob
argument-hint: "[flow-path | tag:<tag>]"
---

# E2E — Maestro

Run Maestro flows from `.maestro/`. Requires Maestro CLI on `$PATH` and a booted iOS Simulator running the Fitbull dev client.

## Preflight

1. Verify Maestro is installed:
   ```bash
   maestro --version
   ```
   If not installed: `curl -Ls "https://get.maestro.mobile.dev" | bash`

2. Verify a simulator is booted:
   ```bash
   xcrun simctl list devices | grep Booted
   ```
   If none: `xcrun simctl boot "iPhone 16 Pro"` (or run `pnpm ios` once to install the dev client).

## Instructions

Parse `$ARGUMENTS`:

- **Empty** → run smoke + critical-path tags:
  ```bash
  maestro test --include-tags smoke,critical-path .maestro/
  ```
- **A path** (e.g. `workout/log-workout.yaml`) → run that flow:
  ```bash
  maestro test .maestro/<path>
  ```
- **A folder** (e.g. `workout/`) → run all flows in the folder:
  ```bash
  maestro test .maestro/<folder>/
  ```
- **`tag:<name>`** → filter by tag:
  ```bash
  maestro test --include-tags <name> .maestro/
  ```

After the run:

1. Report pass/fail count and any failing flow names.
2. If any flow failed, attach the last screenshot from `~/.maestro/tests/<run-id>/` and the failing step.
3. Suggest the fix: missing testID, copy drift, unexpected modal, or a legitimate regression.

## Output

```
E2E: [PASS | FAIL]

Flows run:   <N>
Passed:      <N>
Failed:      <N> [list]

Duration:    <s>
Artifacts:   ~/.maestro/tests/<run-id>/
```

## Arguments

`$ARGUMENTS`:
- empty — smoke + critical-path
- `smoke` — smoke only
- `workout/log-workout.yaml` — single flow
- `onboarding/` — folder
- `tag:paywall` — by tag

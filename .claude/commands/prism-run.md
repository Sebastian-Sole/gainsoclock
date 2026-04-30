---
description: "Display the implementation plan and guide the user to run the bash script."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Glob
  - Grep
---

# Prism Implement

Display the sub-plan dependency graph and guide the user to execute implementation via the bash script.

## What to Do

1. **Read all sub-plans**: Glob `docs/prism/$1/plan/sub-plans/plan-*.md`
2. **Build the dependency graph**: Parse the Dependencies section of each sub-plan
3. **Present the execution plan** to the user:
   - Which sub-plans can run in parallel (no dependencies between them)
   - Which must run sequentially (dependency chain)
   - Scope of each sub-plan (files touched, objective summary)
4. **Show the implementation command**:

```bash
scripts/prism-implement.sh $1
```

Explain available flags and environment variables if the script supports them. If the user wants to run a single sub-plan, show: `scripts/prism-implement.sh $1 plan-NN`.

## This Is / This Is Not

- **IS**: A read-only briefing before implementation. Orientation and planning display.
- **IS NOT**: The implementation itself. No code changes, no agent spawning, no file writes.

## Stop Here

<important>After presenting the dependency graph and the command, stop. Do not run the script. Do not spawn implementation agents. Do not edit any files. The user runs `scripts/prism-implement.sh` themselves, then comes back for `/prism-review $1`.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-8 done, phase 9 current, rest pending. Header: 8 of 11.

Offer: "Run `scripts/prism-implement.sh $1` to start implementation. When it finishes, run `/prism-review $1` to review results."

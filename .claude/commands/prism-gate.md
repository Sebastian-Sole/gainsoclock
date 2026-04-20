---
description: "Decision gate — review synthesis and decide: plan, explore more, or adjust scope."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Glob
  - Grep
---

# Prism Gate

Interactive decision point. Review the synthesis with the user and decide next steps.

## What to Do

1. **Read** `docs/prism/$1/synthesis.md`
2. **Present the key findings** concisely:
   - What are the high-confidence conclusions we can act on?
   - What contradictions remain unresolved?
   - What gaps were identified?
3. **Ask the user to decide**:

### Option A: Proceed to Planning
The exploration has produced enough information to create a comprehensive plan. Unresolved items can be addressed as risks in the plan.

→ Next: `/prism-plan $1`

### Option B: Another Exploration Round
Specific gaps need investigation before planning. Identify the new topics and perspectives needed.

→ Next: `/prism-explore $1` (with refined topics)

### Option C: Adjust Scope
The exploration revealed the problem is different than initially framed. Revise the brief.

→ Next: Update `brief.md`, then `/prism-orient $1`

### Option D: Pause
The user needs time to think, discuss with stakeholders, or gather external input.

→ Save state and resume later.

## Stop Here

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-6 done, phase 7 current, rest pending. Header: 6 of 11.

<important>This is a human-in-the-loop checkpoint. Present the options clearly and wait for the user to decide. Do not choose an option for them. Do not invoke any other prism command. Do not proceed to `/prism-plan` or `/prism-explore` until the user explicitly tells you which option they want.</important>

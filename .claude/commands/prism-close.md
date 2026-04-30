---
description: "Close a Prism session — generate summary, commit changes, optionally create a PR."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
---

# Prism Close

Final phase. Generate a session summary, commit the work, and optionally create a PR.

## What to Do

1. **Read session artifacts**:
   - `docs/prism/$1/brief.md`
   - `docs/prism/$1/synthesis.md`
   - `docs/prism/$1/plan/master-plan.md`
   - `docs/prism/$1/plan/sub-plans/plan-*.md`
   - `docs/prism/$1/plan/review-fixes.md` (if exists — primary source for what happened in review)
   - `docs/prism/$1/parking-lot.md` (if exists)

2. **Generate `docs/prism/$1/session-summary.md`** using this template:

```markdown
# Session Summary: {session-name}

**Status**: Closed
**Started**: {date brief was created}
**Closed**: {today's date}

## What We Built
{2-3 sentences describing what this session produced}

## Key Decisions
- {Decision 1} — see [ADR-001](decisions/adr-001-{title}.md)
- {Decision 2} — see [review fixes](plan/review-fixes.md)

## Sub-Plans: Final Status

| # | Name | Status | Notes |
|---|------|--------|-------|
| 01 | {name} | Approved | — |
| 02 | {name} | Approved (with fixes) | {brief note} |

## Drift from Original Plan
{Brief summary of significant deviations, or "Minimal drift — implementation followed the plan closely."}

## What's Left / Parking Lot
- {Open parking lot items, or "All items resolved."}

## Files & Paths
- Session: `docs/prism/{session-name}/`
- Key files created/modified: {list the main deliverables}

## References
- [Brief](brief.md)
- [Synthesis](synthesis.md)
- [Master Plan](plan/master-plan.md)
- [Review Fixes](plan/review-fixes.md)
```

3. **Present the summary** to the user for review. Make edits if they want changes.

4. **Detect git state**: Check current branch, uncommitted changes via `git status` and `git branch`.

5. **Stage and commit**: Stage relevant files and commit with a message derived from the summary. Use conventional commit format:
   - Feature sessions: `feat: {what was built}`
   - Exploration-only sessions: `docs: prism session {name} — {what was explored}`

6. **Offer PR**: If on a feature branch (not main), offer to create a PR via `gh pr create` with the "What We Built" and "Key Decisions" sections as the body.

## This Is / This Is Not

- **IS**: The final phase. Summary generation, commit workflow, PR creation.
- **IS NOT**: Code changes. Test execution. Review decisions. Those belong in `/prism-review`.

## Stop Here

<important>When `session-summary.md` is written and the commit is made (or the user declines to commit), present the final status and stop. This is the terminal phase — do not offer a next step.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). All 11 phases done. Header: 11 of 11 ✨.

"Session closed."

---
description: "Create a comprehensive master plan from Prism synthesis, with dynamic domain review."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Task
  - WebSearch
  - WebFetch
  - ToolSearch
---

# Prism Plan

Create the master implementation plan and run domain-specific reviews.

## What to Do

### Step 1: Create Master Plan

Spawn a `prism-planner` agent with:
- Session directory: `docs/prism/$1/`
- Instructions to read synthesis.md, all ADRs, brief.md, and orient.md
- Output: `docs/prism/$1/plan/master-plan.md`

### Step 2: Analyze Plan for Review Domains

Read the master plan and identify which domains it touches. Consider:
- Does it involve authentication or data handling? → Security review
- Does it have user-facing UI? → A11y review + UX evaluation review
- Does it integrate with Bibliofil or library systems? → Library domain review
- Does it have performance-sensitive paths? → Performance review
- Does it touch content management? → CMS architecture review
- Does it involve Norwegian legal requirements? → Norwegian law review
- Does it involve search functionality? → Search systems review

Only spawn reviewers for domains the plan actually touches.

### Step 3: Spawn Domain Reviewers

Use the Task tool to spawn `prism-reviewer` agents in parallel. Each gets:
- The persona file content (from `.claude/skills/prism-methodology/references/personas/`)
- The master plan
- Output path: `docs/prism/$1/reviews/{domain}.md`

### Step 4: Track Token Usage

Note `total_tokens`, `tool_uses`, and `duration_ms` from each Task result (planner + all reviewers). Append a "Plan" section to `docs/prism/$1/metrics.md` with rows for the planner and each reviewer.

### Step 5: Process Reviews

Read all reviews. If any reviewer returns "CHANGES NEEDED":
1. Present the required changes to the user
2. Update the master plan to address them
3. Re-run only the affected domain reviews

If all reviewers return "APPROVED" or "CHANGES NEEDED" items are addressed:
- Tell the user the plan is ready
- Next: `/prism-split $1`

If any reviewer returns "NEEDS MORE EXPLORATION":
- Present what's missing
- User decides: address in planning or go back to `/prism-explore`

## Important

Use `model: "opus"` for ALL Task calls — planner and every reviewer. Plan quality is everything. The most important part is getting the best possible plan.

## Stop Here

<important>When the plan is created and all reviews are processed, present the plan summary and review verdicts to the user and stop. Do not invoke `/prism-split` or any other prism command. Do not start the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-7 done, phase 8 current, rest pending. Header: 7 of 11.

Offer: "Want me to run `/prism-split $1`? It breaks the plan into independent sub-plans for parallel implementation."

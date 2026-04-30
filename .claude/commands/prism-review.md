---
description: "Interactive review of implementation results. User gives feedback, you discuss solutions, fix or plan further work."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Prism Review

The user comes with feedback on what was implemented. You listen, discuss solutions together, fix minor things on the spot, and capture larger items as a follow-up plan. Everything — fixes and deferred work alike — goes into a single review plan document so the close step has a complete picture.

## What to Do

### Step 1: Load Context (silently)

Read all sub-plans and implementation logs so you understand what was planned and what happened. Do not write anything yet.

- Sub-plans: `docs/prism/$1/plan/sub-plans/plan-*.md`
- Implementation logs: `docs/prism/$1/implementation/plan-*-log.md`
- Master plan: `docs/prism/$1/plan/master-plan.md`

### Step 2: Present the Overview

Give the user a brief summary of what was implemented — one or two sentences per sub-plan, noting anything you already see that diverged. Then ask: "Where do you want to start? We can go in order, or jump to whatever's on your mind."

### Step 3: Interview

The user gives feedback. For each topic they raise:

1. **Listen** — understand what they want changed or improved
2. **Discuss the approach** — talk through options before touching code
3. **Decide together**: fix now, or plan for later?
   - **Fix now**: make the change (Edit/Bash), run relevant tests, note what was done
   - **Plan for later**: capture the problem, the agreed approach, and any exploration needed

Let the user drive the pace. They may cover multiple sub-plans at once, deep-dive one area, or jump around. Follow their lead. Keep a running mental list of everything discussed — both fixes made and work deferred.

### Step 4: Write the Review Plan

When the user is done giving feedback, write **`docs/prism/$1/plan/review-fixes.md`** — a plan document that captures everything from the review:

```markdown
# Review Fixes: {session-name}

## Overview
{One paragraph — overall quality assessment, themes from feedback}

## Fixes Applied During Review

| # | Area | What Changed | Sub-Plans Affected |
|---|------|-------------|-------------------|
| 1 | {topic} | {what was fixed} | plan-01, plan-03 |
| 2 | {topic} | {what was fixed} | plan-07 |

## Deferred Work

### D-1: {Title}
- **Problem**: {what the user flagged}
- **Agreed approach**: {what was discussed}
- **Scope**: {rough size — small fix, needs exploration, needs its own plan}
- **Sub-plans affected**: plan-XX

### D-2: {Title}
...

## Sub-Plan Verdicts

| Sub-Plan | Verdict | Notes |
|----------|---------|-------|
| plan-01  | Approved | — |
| plan-02  | Approved (with fixes) | {brief note} |
| plan-03  | Needs follow-up | See D-1 |
```

This document is the single source of truth for `/prism-close` — it shows what was done, what's left, and what each sub-plan's final status is.

## This Is / This Is Not

- **IS**: A conversation. The user talks, you listen, you find solutions together. Minor fixes happen on the spot. Larger work gets captured as a plan. Everything is recorded.
- **IS NOT**: An autonomous audit. Do not generate reports before talking to the user. Do not fix things without discussing them first. Do not decide what needs fixing — the user tells you.

## Stop Here

<important>When the review plan is written, present the summary and stop. Do not invoke `/prism-close` or any other prism command. Do not start the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-10 done, phase 11 current, rest pending. Header: 10 of 11.

Offer: "Want me to run `/prism-close $1`? It generates a session summary and commits the changes."

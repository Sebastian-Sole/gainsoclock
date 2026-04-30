---
description: "Start a new Prism exploration session. Define the problem, review background materials, and create a brief."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - WebSearch
  - WebFetch
---

# Prism Brief

Start a new exploration session. This is an interactive discussion to frame the problem before any analysis begins.

## What to Do

1. **Create the session directory**: `docs/prism/$1/`
2. **Discuss the problem with the user**: Understand what we're exploring and why. Review any background materials they reference. Ask clarifying questions.
3. **Write `brief.md`** in the session directory when the discussion converges.

## Brief Structure

The brief should answer:

- **Problem**: What are we building or solving? One paragraph.
- **Stakeholders**: Who is affected? Who evaluates the result?
- **Success Criteria**: What does "done well" look like?
- **Background Materials**: What documents, specs, or references exist? List paths.
- **Constraints**: What's non-negotiable? (deadlines, standards, technology, budget)
- **Scope**: What's in scope and what's explicitly out of scope for this session?
- **Initial Questions**: What do we already know we don't know?

## Important

This phase is a conversation, not a template fill. Discuss with the user. Challenge unclear requirements. Surface hidden assumptions. The brief is the foundation everything else builds on — invest the time to get it right.

## Stop Here

<important>When `brief.md` is written, present a summary and stop. Do not invoke `/prism-orient` or any other prism command. Do not spawn agents for the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phase 1 done, phase 2 current, rest pending. Header: 1 of 11.

Offer: "Want me to run `/prism-orient $1`? It maps what we need to understand — risks, domain, prior art, vision, and unknowns."

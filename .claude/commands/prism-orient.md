---
description: "Orient before exploring — map what we need to understand across risks, domain, prior art, vision, and unknowns."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# Prism Orient

Get your bearings before committing exploration tokens. Map everything we need to understand — not just what might go wrong, but what the problem space looks like, what others have done, what "great" would look like, and what we don't yet know to ask.

## What to Do

1. **Read** `docs/prism/$1/brief.md`
2. **Map inquiry areas** across five dimensions:

   - **Risks**: What could go wrong with our approach? Hidden assumptions, technical fragility, adoption risks, timeline threats.
   - **Domain**: What does research, theory, or established practice say about this problem space? What frameworks or models exist? What is evidence-backed?
   - **Prior art**: What have others built in this space? What worked, what failed, what can we learn from? Open source, commercial products, academic work.
   - **Vision**: What does the ideal look like? User stories, utopian scenarios, compound value — what would make stakeholders say "this is exactly what we needed"?
   - **Unknowns**: What don't we know that we don't know? Where are the blind spots? What questions haven't we thought to ask?

3. **Score each inquiry area**:
   - **Exploration value** (1-5): How much would understanding this improve our plan or outcome?
   - **Current understanding** (1-5): How well do we already understand this?

4. **Write `orient.md`** in the session directory

## Output Format

```markdown
# Orient: {session}

## Explore (High Value, Low Understanding)
These are worth spending tokens on. They become the exploration backlog.

| # | Inquiry | Value | Understanding | Dimension |
|---|---------|-------|---------------|-----------|
| 1 | ...     | 5     | 1             | Domain    |

## Deepen (High Value, High Understanding)
We know something here, but deeper research could improve the plan.
...

## Note (Low Value, Low Understanding)
Interesting but not worth exploration tokens right now.
...

## Skip (Low Value, High Understanding)
We know enough. Don't spend time here.
...
```

## Thinking About Each Dimension

**Risks** — The brief makes claims and assumptions. What could be wrong? Where is the approach fragile? This is the classic assumption-mapping lens.

**Domain** — Step back from the solution and look at the problem space itself. If we're building a communication tool, what does communication research say? If we're building search, what do search experts know? This grounds exploration in evidence rather than opinion.

**Prior art** — What exists? What has been tried? This isn't just competitive analysis — it includes academic work, open-source projects, adjacent domains. Learn from others' mistakes and successes.

**Vision** — Paint the picture of what "great" looks like. User stories from each stakeholder's perspective. Not "the system shall..." requirements, but "imagine if..." scenarios. This gives explorers something to aim for, not just pitfalls to avoid.

**Unknowns** — The hardest dimension. What haven't we considered? What could surprise us? These often emerge from the gaps between the other four dimensions.

## Important

Discuss the inquiry areas with the user before writing orient.md. They will have context that changes the scores — and more importantly, they decide what's worth spending exploration tokens on. The "Explore" quadrant becomes the backlog for `/prism-explore`, so pruning here is where token discipline happens.

## Stop Here

<important>When `orient.md` is written, present the summary and stop. Do not invoke `/prism-explore` or any other prism command. Do not spawn agents for the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-2 done, phase 3 current, rest pending. Header: 2 of 11.

Offer: "Want me to run `/prism-explore $1`? It researches the inquiry areas you've approved from multiple perspectives."

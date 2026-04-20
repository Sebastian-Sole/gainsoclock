---
description: "Run Charette rotation — exploration agents build on each other's findings."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Prism Rotate

Charette rotation phase. Each explorer reads a DIFFERENT explorer's findings and writes a response.

## What to Do

1. **Read all research**: Glob `docs/prism/$1/research/**/*.md` to see what explorations were completed.

2. **Create rotation assignments**: Pair each perspective with a different perspective's findings. The goal is maximum cross-pollination:
   - Black Hat reviews Yellow Hat's findings (critic challenges the optimist)
   - Yellow Hat reviews Black Hat's findings (optimist finds opportunities in the risks)
   - Naive reviews the most confident findings (beginner's mind challenges certainty)
   - Pre-mortem reviews the overall direction (failure narrative of the emerging consensus)

3. **Launch rotation agents in parallel**: Use the Task tool to spawn `prism-explorer` agents. Each gets:
   - Their original perspective (they maintain their hat)
   - The findings file they're reviewing
   - Instructions: "Read these findings from the {original-perspective} perspective. From your {your-perspective} viewpoint, what was missed? What should be challenged? What should be extended? What new questions does this raise?"
   - Output path: `docs/prism/$1/rotations/round-1/{reviewer}-reviews-{original}.md`

4. **Track token usage**: Note `total_tokens`, `tool_uses`, and `duration_ms` from each Task result. Append a "Rotate" section to `docs/prism/$1/metrics.md` (same format as Explore — agent type is "rotation", topic is the reviewed perspective).

5. **Present results**: When complete, summarize the key tensions and new insights from the rotation, and show the phase token total.

## Why This Matters

Simple parallel exploration often produces redundant results. Rotation forces engagement with perspectives you wouldn't generate yourself. The Black Hat reading the Yellow Hat's optimism will spot specific ways the benefits are overstated. The Naive explorer reading confident technical analysis will ask "but why?" at just the right moment.

## Stop Here

<important>When all rotation agents have completed, present a summary of new insights and stop. Do not invoke `/prism-synthesize` or any other prism command. Do not start the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-4 done, phase 5 current, rest pending. Header: 4 of 11.

Offer: "Want me to run `/prism-synthesize $1`? It unifies all findings and surfaces contradictions."

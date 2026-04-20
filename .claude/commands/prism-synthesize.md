---
description: "Synthesize all Prism findings into a unified analysis with contradictions and gaps."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Task
---

# Prism Synthesize

Combine all exploration findings and rotations into a unified synthesis.

## What to Do

1. **Spawn the synthesizer**: Use the Task tool to spawn a `prism-synthesizer` agent with:
   - The session directory path: `docs/prism/$1/`
   - Instructions to read ALL files in `research/` and `rotations/`
   - Output path: `docs/prism/$1/synthesis.md`

2. **Track token usage**: Note `total_tokens`, `tool_uses`, and `duration_ms` from the Task result. Append a "Synthesize" section to `docs/prism/$1/metrics.md`.

3. **Review the synthesis** with the user when complete. Highlight:
   - Key themes that emerged
   - Major contradictions between perspectives
   - Gaps that need more investigation
   - The synthesizer's recommendation (proceed to planning or explore more)

4. **Tell the user** they can proceed with `/prism-gate $1` to make the decision.

## Important

The synthesis should NOT flatten disagreements into false consensus. Preserve the productive tension between perspectives. The planner needs to see where the real debates are.

Use `model: "opus"` for the Task call. Synthesis requires the deepest reasoning.

## Stop Here

<important>When `synthesis.md` is written, present the highlights and stop. Do not invoke `/prism-gate` or any other prism command. Do not start the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-5 done, phase 6 current, rest pending. Header: 5 of 11.

Offer: "Want me to run `/prism-gate $1`? It's the decision point — you'll review everything and choose: plan, explore more, or adjust scope."

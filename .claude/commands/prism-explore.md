---
description: "Launch parallel Prism exploration agents with assigned perspectives and topics."
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

# Prism Explore

Launch parallel research into the inquiry areas identified during the orient phase.

## What to Do

1. **Read session context**:
   - `docs/prism/$1/brief.md`
   - `docs/prism/$1/orient.md`
   - `docs/prism/$1/loadout.md` (if it exists)

2. **Run loadout first** (if not already done): Use the Task tool to spawn a `prism-loadout` agent that analyzes the brief and recommends tools. Write results to `docs/prism/$1/loadout.md`.

3. **Identify exploration topics**: From the "Explore" quadrant in orient.md, group related inquiry areas into topics. Each topic is a focused question to investigate. Consider the dimension — domain and prior art inquiries may need different perspectives than risk inquiries.

4. **Assign perspectives**: For each topic, decide which perspectives will yield the most insight. Not every topic needs every hat. Consider:
   - Risk inquiries → White Hat (facts) + Black Hat (risks)
   - Domain inquiries → White Hat (facts) + Naive (beginner's mind)
   - Prior art inquiries → Scout (competitive research) + Yellow Hat (opportunities)
   - Vision inquiries → Stakeholder + Green Hat (creative) + Yellow Hat (opportunities)
   - Unknown inquiries → Naive explorer + Pre-mortem

5. **Optionally run a scout first**: If the topics would benefit from knowing what others have done, spawn a `prism-scout` agent before the main exploration.

6. **Launch explorers in parallel**: Use the Task tool to spawn multiple `prism-explorer` agents simultaneously. Each gets:
   - The perspective file content (read from `.claude/skills/prism-methodology/references/perspectives/`)
   - The specific topic and question
   - The output path: `docs/prism/$1/research/{topic}/{perspective}.md`
   - The brief context
   - Tool recommendations from loadout.md
   - Instruction to use source confidence tags (🟢🟡🔴)

7. **Track token usage**: After each Task call completes, note the `total_tokens`, `tool_uses`, and `duration_ms` from the result. When all agents are done, append a phase section to `docs/prism/$1/metrics.md` (create the file if it doesn't exist — see Token Tracking below).

8. **Present results**: When all explorers complete, summarize what was found and show the phase token total.

## File Structure Created

```
docs/prism/{session}/research/
  {topic-1}/
    white-hat.md
    black-hat.md
  {topic-2}/
    yellow-hat.md
    stakeholder.md
    pre-mortem.md
  ...
```

## Important

Each agent writes to its own file only. No shared writes. The filesystem is the communication channel.

Use `model: "opus"` for all Task calls. These exploration agents need maximum depth.

## Token Tracking

After all agents complete, append to `docs/prism/$1/metrics.md`:

```markdown
## Explore

| Agent | Topic | Perspective | Tokens | Tools | Duration |
|-------|-------|-------------|--------|-------|----------|
| explorer | {topic} | {perspective} | {tokens} | {tools} | {duration}s |
| ... | | | | | |
| **Phase total** | | | **{sum}** | **{sum}** | **{total}s** |
```

If this is the first phase writing metrics, start the file with `# Session Metrics: {session-name}` and a blank line.

## Stop Here

<important>When all exploration agents have completed and findings are written, present a summary of what was found and stop. Do not invoke `/prism-rotate`, `/prism-synthesize`, or any other prism command. Do not start the next phase. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-3 done, phase 4 current, rest pending. Header: 3 of 11.

Offer: "Want me to run `/prism-rotate $1`? It has perspectives cross-review each other's research. Or skip to `/prism-synthesize $1` to go straight to unifying research."

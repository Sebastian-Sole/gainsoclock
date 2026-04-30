---
name: prism-methodology
description: "Fires when planning complex features, running structured exploration, or analyzing problems from multiple perspectives. Also fires when asked about exploration methodology, structured analysis, or multi-perspective planning."
---

# Prism

Multi-perspective exploration and planning system. Split a problem into perspectives, explore in parallel, synthesize findings, create implementation plans.

Prism is a heavyweight tool for high-stakes, constraint-dense work — heavily specified projects, tight deadlines, complex integrations. For lightweight features, use `/plan-feature` or just start building. If the problem doesn't justify 11 phases of structured exploration, Prism is the wrong tool.

Prism is NOT an autonomous pipeline — the user controls the pace by running commands. Each phase produces files; the `/prism` guide command detects state from those files. Review the system when a new model ships — throw away what's no longer necessary.

## Workflow

```
/prism-brief → /prism-orient → /prism-explore → /prism-rotate → /prism-synthesize → /prism-gate → /prism-plan → /prism-split → /prism-run → /prism-review → /prism-close
                                      ↑                                                    |
                                      └──────────── not enough info ───────────────────────┘
```

| Phase | Command | What Happens |
|-------|---------|-------------|
| Brief | `/prism-brief` | Define the problem, review materials, create brief.md |
| Orient | `/prism-orient` | Map inquiry areas across risks, domain, prior art, vision, unknowns |
| Explore | `/prism-explore` | Parallel exploration agents with assigned perspectives |
| Rotate | `/prism-rotate` | Charette rotation — agents build on each other's findings |
| Synthesize | `/prism-synthesize` | Combine findings, detect contradictions, identify gaps |
| Gate | `/prism-gate` | Decision: enough info to plan, or another round? |
| Plan | `/prism-plan` | Create comprehensive master plan from synthesis |
| Split | `/prism-split` | Break master plan into self-contained sub-plans |
| Implement | `/prism-run` | Display implementation plan, run via bash script |
| Review | `/prism-review` | Human review, fix loop, drift report |
| Close | `/prism-close` | Session summary, commit, PR |

## Session Directory

Each session lives under `docs/prism/{session-name}/`. See `@${CLAUDE_SKILL_DIR}/references/workflow.md` for the full directory layout and phase details.

## Source Confidence

Every finding carries a confidence tag: 🟢 Verified, 🟡 Unverified, 🔴 Potentially Stale. See `@${CLAUDE_SKILL_DIR}/references/source-confidence.md`.

## Perspectives

Injected into explorer agents to force different viewpoints. Available in `@${CLAUDE_SKILL_DIR}/references/perspectives/`. Core set: White Hat (facts), Black Hat (risks), Yellow Hat (opportunities), Green Hat (creative), Naive (beginner's mind), Pre-mortem (failure narrative), Stakeholder (specific person).

## Personas

Injected into reviewer agents for domain expertise. Available in `@${CLAUDE_SKILL_DIR}/references/personas/`. Extensible — add new personas as markdown files.

## Decisions

When exploration surfaces a decision point, record it as an ADR. See `@${CLAUDE_SKILL_DIR}/references/adr-template.md`.

## Working with Opus 4.6

This system runs on Opus 4.6 exclusively. Key principles:

- Give direction, not procedures. Opus 4.6 naturally does deep exploration — trust it.
- Use calm, clear language. No CRITICAL, MUST, ALWAYS. Opus 4.6 overtriggers on aggressive instructions.
- Explicitly request file output — the model may skip writes if it thinks a summary suffices.
- One deep, specific insight beats ten shallow observations.
- Prefer general framing over prescriptive steps. "Think thoroughly" produces better reasoning than a hand-written step-by-step plan.

## Methodologies

- **Six Thinking Hats**: Forced perspective separation — look from HERE, not for THIS
- **Charette Procedure**: Independent parallel analysis with rotation builds on blind spots
- **Pre-mortem**: "It failed. Write the post-mortem." Surfaces 30% more risks than direct analysis
- **Inquiry Mapping**: Plot exploration value x current understanding. Research the high-value, low-understanding quadrant
- **Spikes**: Timeboxed exploration producing knowledge, not code
- **ADRs**: Structured decision records capturing why, not just what

## Gotchas

- **Frontmatter `model` doesn't propagate to Task calls.** Every Task call spawning an agent must explicitly set `model: "opus"`. Without this, sub-agents inherit the parent model which may not be opus.
- **Opus 4.6 auto-advances between phases.** All commands have `<important>` stop guards and `allowed-tools` restrictions. If a command invokes the next phase without user input, the guard failed — interrupt and report.
- **Perspectives are framing, not checklists.** Perspective files are 2-3 sentences. Longer perspectives produce worse output because they constrain Opus 4.6's natural exploration.
- **Each agent writes to its own file only.** Never design a step where multiple agents write to the same file. The filesystem is the communication channel; directories are the routing.
- **Source confidence tags are easy to forget.** Agents will skip 🟢🟡🔴 tags unless explicitly reminded in the Task call prompt.
- **Session names must be filesystem-safe.** Use lowercase, hyphens, no spaces: `user-test-1` not `User Test 1`.

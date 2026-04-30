---
name: create-agent
description: "Fires when creating, scaffolding, or writing any `.claude/agents/*.md` file. Also fires when building systems that include agents, designing multi-agent architectures, or when asked about agent structure and best practices."
---

# Create a Claude Code Agent

<important>Before finalizing any agent file, run the verification checklist below. Apply **prompt-engineering** skill patterns -- this is the shared foundation for all Claude Code artifacts.</important>

## Verification Checklist

- [ ] `model:` in frontmatter (explicit -- inheritance is unreliable)
- [ ] `color:` in frontmatter
- [ ] `tools:` scoped to minimum needed
- [ ] `## Personality` section with quoted inner monologue
- [ ] `<example>` blocks in `description:` for trigger matching
- [ ] `## Output Format` section

## YAML Frontmatter

```yaml
---
name: agent-name
description: |
  Short description of what this agent does.

  <example>
  Context: When this agent should be triggered
  user: "Example user message"
  assistant: "I'll use the agent-name agent to handle this."
  <commentary>Why this matches</commentary>
  </example>
model: sonnet
tools:
  - Read
  - Glob
  - Grep
  - Bash
color: blue
---
```

See `@${CLAUDE_SKILL_DIR}/references/frontmatter-reference.md` for all available fields.

## Model Selection

| Model | Use For |
|-------|---------|
| haiku | Exploration, search, simple lookups |
| sonnet | Implementation, testing, code review (default for most agents) |
| opus | Architecture, security review, complex multi-file reasoning |

## Tool Scoping

```yaml
# Read-only agent (search/analysis)
tools: [Read, Glob, Grep, WebSearch, WebFetch]

# Implementation agent
tools: [Read, Write, Edit, Glob, Grep, Bash]

# Full-access agent (rare -- justify why)
tools: [Read, Write, Edit, Glob, Grep, Bash, Task, WebSearch, WebFetch]
```

## Orchestration Patterns

### Command -> Agent -> Skill

```
User runs /deploy          (command)
  -> spawns deploy-agent   (agent with deploy knowledge)
    -> references skills   (deploy-checklist, prompt-engineering)
```

### Parallel Task calls

When spawning sub-agents, use parallel Task calls for independent operations. Merge results afterward.

## Gotchas

- **`model:` in frontmatter doesn't propagate to Task calls.** If the agent spawns sub-agents, each Task call needs explicit `model:`
- **`<example>` blocks are the primary trigger mechanism.** Without them, agents may not fire when expected
- **Full tool access is almost never right.** Default to read-only, add write tools only for implementation agents

## Process

1. Ask for the agent's purpose, trigger scenarios, and output format
2. Pick model and scope tools to minimum needed
3. Write the agent with frontmatter and body
4. Run the verification checklist

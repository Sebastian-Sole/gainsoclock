---
name: prompt-engineering
description: "Fires when writing prompts for skills, agents, commands, or any Claude Code artifact. Also fires when writing any file in `.claude/skills/`, `.claude/agents/`, or `.claude/commands/`. Also fires when asked about prompt engineering patterns, prompt best practices, or how to write effective instructions for Claude."
---

# Prompt Engineering for Claude Code Artifacts

Patterns for writing effective skills, agents, commands, and rules. This is the shared foundation -- all creator skills (create-skill, create-agent, create-command) depend on these patterns.

<important>This skill applies to every `.claude/` artifact you write. Whether creating one file or building a multi-agent system, verify these patterns before finalizing each file.</important>

## XML Tags

### `<example>` blocks
Use in agent descriptions for trigger matching:

```xml
<example>
Context: What situation triggers this agent
user: "What the user says"
assistant: "What the assistant does"
<commentary>Why this example matches</commentary>
</example>
```

### `<important>` tags

```xml
<important>Never delete production data without confirmation.</important>
<important if="modifying database schema">Run migrations in a transaction.</important>
```

Reserve XML for trigger matching and hard constraints. Markdown structure handles everything else.

## Patterns That Push Past Defaults

These are the things Claude won't do unless told:

- **Personality blocks**: Quoted inner monologue gives agents identity and focus
  ```markdown
  ## Personality
  > I am a careful reviewer who values correctness over speed.
  ```
- **IS/IS NOT bounding**: Explicitly state what the artifact does NOT handle to prevent scope creep
- **Front-load constraints**: Claude reads top-down -- the most important rules should come first, not be buried in a Process section at the bottom
- **Trigger descriptions**: Write `description:` as "Fires when..." with file path patterns (`.claude/agents/*.md`) to catch indirect creation

## Dynamic Context

| Syntax | What it does |
|--------|-------------|
| `$ARGUMENTS` | Full argument string passed to the command |
| `$1, $2, $3` | Positional arguments |
| `@path/to/file` | Include file contents as inline context |
| `` !`command` `` | Inject shell output into the prompt at load time |
| `${CLAUDE_SKILL_DIR}` | Resolve paths relative to the skill directory |

## Gotchas

- **Description field is a trigger mechanism**, not documentation. Write it as "Fires when..." and include file path patterns so it fires during indirect creation too
- **Don't railroad** -- give goals + constraints, not rigid step-by-step procedures
- **Don't state the obvious** -- if Claude would already do something, don't waste tokens saying it
- **Frontmatter `model` doesn't auto-propagate** to Task tool calls. Each Task call needs explicit `model:`
- **Verification checklists get skipped** when buried at the bottom. Put them near the top
- **Opus 4.6 overtriggers on aggressive language** -- dial back CRITICAL/MUST/ALWAYS/NEVER

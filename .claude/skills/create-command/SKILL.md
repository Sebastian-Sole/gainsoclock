---
name: create-command
description: "Fires when creating, scaffolding, or writing any `.claude/commands/*.md` file. Also fires when building systems that include slash commands, or when asked about command structure and best practices."
---

# Create a Claude Code Command

<important>Before finalizing any command file, run the verification checklist below. Apply **prompt-engineering** skill patterns -- this is the shared foundation for all Claude Code artifacts.</important>

## Verification Checklist

- [ ] `description:` one-line summary shown in command picker
- [ ] `allowed-tools:` scoped to minimum needed
- [ ] `argument-hint:` if the command takes arguments
- [ ] `## Stop Here` with `<important>` tag if part of a multi-phase workflow

## YAML Frontmatter

```yaml
---
description: "One-line description shown in command picker"
argument-hint: "<target>"
allowed-tools:
  - Bash
  - Read
  - Grep
---
```

See `@${CLAUDE_SKILL_DIR}/references/frontmatter-reference.md` for all available frontmatter fields.

## Scope with allowed-tools

```yaml
# Read-only command (analysis, reporting)
allowed-tools: [Read, Glob, Grep]

# Build/test command
allowed-tools: [Bash, Read, Glob, Grep]

# Full implementation command
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
```

## Arguments

Commands receive arguments via `$ARGUMENTS` and positional `$1`, `$2`, `$3`:

```markdown
---
description: "Run tests for a specific module"
argument-hint: "<module-name>"
---

Run tests for the `$1` module.
```

## When Command vs Skill

| | Command | Skill |
|---|---------|-------|
| **Invocation** | Explicit: user types `/command` | Automatic: Claude detects context |
| **Visibility** | Listed in command picker | Hidden from user |
| **Use case** | User-initiated workflows | Domain knowledge, patterns |

If the user would type it as a verb ("deploy this"), it's a command. If it's knowledge Claude should just *know*, it's a skill.

## Delegating to Agents

Commands can delegate to agents for complex work:

```yaml
---
description: "Full code review"
agent: code-review
---
```

## Gotchas

- **Omitting `allowed-tools` gives the command full tool access.** Always scope explicitly
- **Opus 4.6 auto-advances between commands.** If commands are part of a pipeline, add `## Stop Here` with `<important>` tags and exclude `Skill` from `allowed-tools`
- **`$1` is empty if user passes no arguments.** Handle the no-argument case gracefully

## Process

1. Ask for the command's purpose and expected arguments
2. Scope tools to the minimum needed
3. Write the command with frontmatter and body
4. Run the verification checklist

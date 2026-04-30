# Command Frontmatter Reference

All available YAML frontmatter fields for command files in `.claude/commands/`.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | One-line description shown in the command picker |
| `argument-hint` | string | No | Placeholder shown after `/command` (e.g., `<branch>`) |
| `allowed-tools` | string[] | No | Restrict tools available during command execution |
| `model` | string | No | Model override: "haiku", "sonnet", "opus" |
| `effort` | string | No | Reasoning effort: "low", "medium", "high" |
| `context` | string | No | Set to "fork" to run in a subagent |
| `agent` | string | No | Delegate to a named agent |

## Example: Simple Command

```yaml
---
description: "Check types across the monorepo"
allowed-tools:
  - Bash
  - Read
---
```

## Example: Command with Arguments

```yaml
---
description: "Run tests for a specific package"
argument-hint: "<package-name>"
allowed-tools:
  - Bash
  - Read
  - Grep
---
```

## Example: Command Delegating to Agent

```yaml
---
description: "Full code review of current changes"
agent: code-review
---
```

## Example: Forked Command (Subagent)

```yaml
---
description: "Explore codebase architecture"
context: fork
model: haiku
allowed-tools:
  - Read
  - Glob
  - Grep
---
```

## Notes

- `allowed-tools` is a whitelist. If omitted, all tools are available.
- `agent` runs the command body within the named agent's context and tool set.
- `context: fork` runs in a subagent, keeping the main context clean.
- `model` does NOT propagate to Task tool calls within the command.
- Arguments are available as `$ARGUMENTS` (full string) and `$1`, `$2`, `$3` (positional).

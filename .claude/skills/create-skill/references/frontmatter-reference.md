# Skill Frontmatter Reference

All available YAML frontmatter fields for `SKILL.md` files.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier (kebab-case) |
| `description` | string | Trigger description. Write as "Fires when..." |

## Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `origin` | string | - | Source of the skill (e.g., "ECC", "custom") |
| `context` | string | - | Fork context -- set to "fork" for skills that run in subagents |
| `allowed-tools` | string[] | all | Restrict which tools the skill can use |
| `model` | string | inherit | Model override: "haiku", "sonnet", "opus" |
| `effort` | string | inherit | Reasoning effort: "low", "medium", "high" |
| `hooks` | object | - | Shell commands that run on tool events |
| `shell` | string | inherit | Shell to use for Bash tool |
| `user-invocable` | boolean | false | If true, skill appears as a slash command |
| `disable-model-invocation` | boolean | false | If true, Claude will not auto-invoke this skill |

## Example: Minimal Skill

```yaml
---
name: my-skill
description: "Fires when asked about X or when doing Y"
---
```

## Example: Full Skill

```yaml
---
name: deploy-checker
description: "Fires when preparing a deployment, creating a release, or running pre-deploy checks"
origin: custom
model: sonnet
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
user-invocable: true
---
```

## Notes

- `model` does NOT propagate to Task tool calls. Specify model explicitly in each Task call.
- `allowed-tools` is a whitelist. If set, only listed tools are available.
- `user-invocable: true` makes the skill callable via `/skill-name` slash command.
- `disable-model-invocation: true` means Claude won't auto-activate -- only manual invocation works.

# Agent Frontmatter Reference

All available YAML frontmatter fields for agent files in `.claude/agents/`.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Agent identifier (kebab-case) |
| `description` | string | What the agent does + `<example>` blocks for trigger matching |

## Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | inherit | Model: "haiku", "sonnet", "opus" |
| `tools` | string[] | all | Tools this agent can use |
| `color` | string | - | Display color in UI: "blue", "green", "red", "yellow", "purple" |
| `max_turns` | number | - | Maximum agentic turns before stopping |

## Description with Examples

The `description` field should include `<example>` blocks for reliable trigger matching:

```yaml
description: |
  Reviews code changes for bugs, security issues, and pattern adherence.

  <example>
  Context: User wants a code review of recent changes
  user: "Review my changes before I commit"
  assistant: "I'll use the code-review agent to analyze your changes."
  <commentary>Direct request for code review</commentary>
  </example>

  <example>
  Context: User has finished implementing a feature
  user: "I'm done with the auth feature, anything look off?"
  assistant: "Let me use the code-review agent to check for issues."
  <commentary>Implicit request -- "anything look off" triggers review</commentary>
  </example>
```

## Tool Names

Available tools to scope in the `tools` field:

| Tool | Purpose |
|------|---------|
| `Read` | Read files |
| `Write` | Create new files |
| `Edit` | Modify existing files |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `Bash` | Run shell commands |
| `Task` | Spawn sub-agents |
| `WebSearch` | Search the web |
| `WebFetch` | Fetch URL content |
| `AskUserQuestion` | Ask the user a question |
| `NotebookEdit` | Edit Jupyter notebooks |

## Example: Read-Only Agent

```yaml
---
name: codebase-explorer
description: "Explores the codebase to answer questions about architecture and patterns."
model: haiku
tools:
  - Read
  - Glob
  - Grep
color: blue
---
```

## Example: Implementation Agent

```yaml
---
name: feature-builder
description: "Implements features based on specifications."
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
color: green
---
```

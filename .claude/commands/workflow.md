---
description: "Run a named workflow — sequential commands orchestrated via isolated agents"
argument-hint: "<workflow-name> <task description>"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Skill
  - Agent
---

# Workflow Orchestrator

You are a **workflow orchestrator**. Your only job is to execute workflow steps in sequence by delegating each step to an isolated agent. You do NOT implement anything yourself, or do ANY research.

## Instructions

1. **Parse arguments**: `$1` is the workflow name, everything after is the task description (`$ARGUMENTS` minus `$1`).

2. **Load the workflow definition** from `.claude/workflows/$1.json`. If it doesn't exist, list available workflows from `.claude/workflows/` and stop.

3. **Execute each step in sequence**:

   For each step in the `steps` array:

   a. **Announce** the step: `## Step N/Total: <step.description>` with the command being run.

   b. **Determine command type**:
      - If command starts with `/` — it's a slash command. The agent should invoke it via the Skill tool.
      - Otherwise — it's a shell command. The agent should run it via the Bash tool.

   c. **Spawn an agent** using the Agent tool with:
      - `prompt`: Include the full task description, the command to run (slash command via Skill, or shell command via Bash), and the summary from the previous step (if any). Tell the agent to run the command and return a structured summary of what it did and the outcome.
      - `subagent_type`: Use the step's `agent_type` if specified, otherwise `"general-purpose"`.
      - `mode`: `"auto"` so the agent can work autonomously.
      - `model`: Use the step's `model` if specified.

   d. **Capture the result** and create a concise summary for the next step.

   e. **Gate check**: If `"gate": true`, present the agent's output to the user and **wait for explicit approval** before proceeding. Use AskUserQuestion.

   f. **Failure check**: If the agent reports failure:
      - `"on_fail": "stop"` (default) — Stop the workflow and report which step failed.
      - `"on_fail": "continue"` — Log the failure and move to the next step.
      - `"on_fail": "retry"` — Retry the step once. If it fails again, stop.

4. **Final report** when all steps complete:

```
WORKFLOW: <name> — COMPLETE

Step 1: <description> — [PASS/FAIL/SKIPPED]
Step 2: <description> — [PASS/FAIL/SKIPPED]
...

Result: [SUCCESS / FAILED at step N]
```

## Workflow File Format

Workflow definitions live in `.claude/workflows/<name>.json`:

```json
{
  "name": "Display Name",
  "description": "What this workflow does",
  "steps": [
    {
      "command": "/plan-feature",
      "description": "Create implementation plan",
      "gate": true,
      "on_fail": "stop",
      "agent_type": "general-purpose",
      "model": "sonnet"
    }
  ]
}
```

### Step fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `command` | yes | — | Slash command (`/verify`), shell command (`node script.js`), or free-text instruction |
| `description` | yes | — | Human-readable step label |
| `gate` | no | `false` | Pause for user approval after this step |
| `on_fail` | no | `"stop"` | `"stop"`, `"continue"`, or `"retry"` |
| `agent_type` | no | `"general-purpose"` | Agent type for this step |
| `model` | no | inherited | Model override (`"sonnet"`, `"opus"`, `"haiku"`) |

## Rules

- You are the orchestrator, not the implementer. Do not implement work yourself.
- Pass task context to each agent so it knows what it's working on.
- Pass the previous step's summary so agents have continuity.
- Stop on unrecoverable failure unless `on_fail` says otherwise.
- If no workflow name is given, list available workflows and their descriptions.

---
name: create-hooks
description: "Fires when asked to create, scaffold, or add Claude Code hooks. Also fires when asked about hook events, hook patterns, how hooks work, or how to automate tool behavior."
---

# Create Claude Code Hooks

Scaffold hooks that fire at lifecycle events to automate, guard, or extend Claude Code behavior.

For prompt writing patterns, follow the **prompt-engineering** skill.

## What Hooks Are

Hooks are shell commands, HTTP calls, or LLM prompts that execute automatically at specific points in Claude's lifecycle. They provide deterministic control -- no AI judgment involved (unless using prompt/agent hook types).

## Where Hooks Live

Hooks are JSON objects inside a `"hooks"` key in settings files:

| File | Scope | Commit to git? |
|------|-------|----------------|
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | This project (shared) | Yes |
| `.claude/settings.local.json` | This project (personal) | No |

Can also be defined in skill/agent frontmatter under a `hooks:` key.

## Hook Structure

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex_pattern",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/script.sh",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

## Four Hook Types

| Type | What it does | Use for |
|------|-------------|---------|
| `command` | Runs a shell script | File ops, formatting, blocking, logging |
| `http` | POSTs to an endpoint | External services, audit logging |
| `prompt` | Single-turn LLM call | Judgment calls ("is this SQL valid?") |
| `agent` | Multi-turn subagent | Complex verification (run tests, check files) |

## Key Events

Pick the right event for the job:

| Event | When it fires | Can block? | Common use |
|-------|--------------|------------|------------|
| `PreToolUse` | Before tool executes | Yes (exit 2) | Guard rails, input validation |
| `PostToolUse` | After tool succeeds | No | Auto-format, audit, side effects |
| `Stop` | Claude finishes responding | Yes (exit 2) | Verify tests pass before stopping |
| `SessionStart` | Session begins | No | Inject context, set env vars |
| `UserPromptSubmit` | User submits prompt | No | Pre-process prompts |
| `Notification` | Claude waiting for input | No | Desktop notifications |

See `@${CLAUDE_SKILL_DIR}/references/hooks-reference.md` for all 24 events and their matchers.

## Communication Protocol

Hooks communicate via exit codes and stdio:

| Exit code | Effect |
|-----------|--------|
| `0` | Success -- action proceeds. Parse JSON from stdout if present |
| `2` | **Block** -- action stopped. stderr becomes feedback to Claude |
| Other | Non-blocking error -- logged but action proceeds |

### Blocking a tool (PreToolUse)

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
if echo "$COMMAND" | grep -qE "rm -rf|drop table"; then
  echo "Blocked: destructive command detected" >&2
  exit 2
fi
exit 0
```

### Injecting context (SessionStart)

```bash
#!/bin/bash
echo '{"hookSpecificOutput":{"additionalContext":"Today is Thursday. Sprint ends Friday."}}'
exit 0
```

### Auto-allowing a tool (PreToolUse)

```bash
#!/bin/bash
echo '{"hookSpecificOutput":{"permissionDecision":"allow","permissionDecisionReason":"Auto-approved by hook"}}'
exit 0
```

## Matchers

- Regex pattern filtering when the hook fires
- **Case-sensitive**: `Bash` matches, `bash` does not
- Empty/omitted = fires on all occurrences of that event
- Tool matchers: `Bash`, `Edit`, `Write`, `Edit|Write`, `mcp__github__.*`
- SessionStart matchers: `startup`, `resume`, `clear`, `compact`
- Stop matchers: none (always fires)

## Gotchas

- **Scripts must be executable**: `chmod +x .claude/hooks/script.sh`
- **Use absolute paths**: `"$CLAUDE_PROJECT_DIR/.claude/hooks/script.sh"` -- hooks run in non-interactive shells where relative paths may resolve wrong
- **Echo in shell profile breaks JSON parsing**: Wrap profile echo statements in `if [[ $- == *i* ]]; then ... fi`
- **Stop hook infinite loops**: Check `stop_hook_active` field -- if true, exit 0 immediately
- **Deny rules override hook allows**: A `permissionDecision: "allow"` from a hook does NOT override deny rules in settings
- **`jq` required for JSON parsing**: Install it, or use `python3 -c "import json, sys; ..."`
- **Matchers are case-sensitive**: `Edit|Write` works, `edit|write` does not
- **Test hooks manually**: `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./hook.sh && echo $?`

## Gotchas

- **`exit 0` is the safe default.** If your script has an early-exit condition it doesn't handle, make sure it falls through to `exit 0` -- otherwise the hook silently swallows the tool call.
- **Hooks run in non-interactive shells.** Environment variables from `.zshrc`/`.bashrc` are not available unless explicitly sourced or set in settings `env`.
- **PostToolUse hooks cannot block.** Exit code 2 only works in PreToolUse. PostToolUse hooks that exit 2 are logged as errors but the tool still succeeds.
- **Hook timeout default is 60s.** Long-running hooks (e.g., full test suites in Stop) should set an explicit `timeout` in the hook config.
- **Multiple hooks on the same matcher run sequentially.** If one is slow, it delays the others. Keep PostToolUse hooks fast (<1s).

## Process

1. Identify the goal (guard, automate, notify, verify)
2. Pick the right event (PreToolUse, PostToolUse, Stop, etc.)
3. Write the matcher regex (scope it tightly)
4. Choose hook type (command for most cases)
5. Write the script -- handle stdin JSON, communicate via exit codes
6. Make executable, use absolute paths
7. Add to the appropriate settings file
8. Test with `/hooks` command and manual stdin piping

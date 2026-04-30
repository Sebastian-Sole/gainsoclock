# Hooks Reference

Complete reference for all hook events, input/output formats, and handler fields.

## All 24 Hook Events

| Event | Fires when | Matcher values | Can block? |
|-------|-----------|----------------|------------|
| `SessionStart` | Session begins/resumes | `startup`, `resume`, `clear`, `compact` | No |
| `SessionEnd` | Session terminates | `clear`, `resume`, `logout`, `prompt_input_exit`, `other` | No |
| `UserPromptSubmit` | User submits prompt | *(none)* | No |
| `InstructionsLoaded` | CLAUDE.md loaded | `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact` | No |
| `PreToolUse` | Before tool executes | Tool name regex | Yes (exit 2) |
| `PostToolUse` | After tool succeeds | Tool name regex | No |
| `PostToolUseFailure` | Tool execution fails | Error type | No |
| `PermissionRequest` | Permission dialog appears | Tool name or `ExitPlanMode` | Yes |
| `Stop` | Claude finishes responding | *(none)* | Yes (exit 2) |
| `StopFailure` | Turn ends via API error | `rate_limit`, `authentication_failed`, `billing_error`, `server_error`, `max_output_tokens`, `unknown` | No |
| `Notification` | Claude waiting for input | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` | No |
| `SubagentStart` | Subagent spawned | Agent type | No |
| `SubagentStop` | Subagent finishes | Agent type | No |
| `TaskCreated` | Task created | *(none)* | No |
| `TaskCompleted` | Task completed | *(none)* | Yes |
| `ConfigChange` | Config file changes | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` | No |
| `CwdChanged` | Working directory changes | *(none)* | No |
| `FileChanged` | Watched file changes | Filename basename | No |
| `WorktreeCreate` | Worktree created | *(none)* | No |
| `WorktreeRemove` | Worktree removed | *(none)* | No |
| `PreCompact` | Before context compaction | `manual`, `auto` | No |
| `PostCompact` | After compaction | `manual`, `auto` | No |
| `Elicitation` | MCP server requests input | MCP server name | No |
| `ElicitationResult` | User responds to MCP prompt | MCP server name | No |
| `TeammateIdle` | Team teammate idle | Agent type | No |

## Hook Handler Fields

### Command

```json
{
  "type": "command",
  "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/script.sh",
  "timeout": 600,
  "shell": "bash",
  "async": false
}
```

### HTTP

```json
{
  "type": "http",
  "url": "https://hooks.example.com/events",
  "timeout": 30,
  "headers": { "Authorization": "Bearer $TOKEN" },
  "allowedEnvVars": ["TOKEN"]
}
```

### Prompt (single-turn LLM)

```json
{
  "type": "prompt",
  "prompt": "Is this SQL safe? $ARGUMENTS",
  "model": "claude-haiku"
}
```

### Agent (multi-turn subagent)

```json
{
  "type": "agent",
  "prompt": "Verify tests pass before stopping",
  "timeout": 120,
  "maxToolUses": 50
}
```

## Input Format (stdin JSON)

Every hook receives JSON on stdin with these common fields:

```json
{
  "session_id": "abc123",
  "cwd": "/project/root",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

### Tool-specific fields (PreToolUse / PostToolUse)

| Tool | `tool_input` fields |
|------|-------------------|
| `Bash` | `command` |
| `Edit` | `file_path`, `old_string`, `new_string` |
| `Write` | `file_path`, `content` |
| `Read` | `file_path` |
| `Glob` | `pattern`, `path` |
| `Grep` | `pattern`, `path`, `type` |
| `WebFetch` | `url`, `prompt` |
| `WebSearch` | `query` |
| `Task` | `prompt` |

### Stop-specific field

```json
{ "stop_hook_active": true }
```

Check this to prevent infinite Stop hook loops.

## Output Formats (stdout JSON)

### PreToolUse decision

```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow",
    "permissionDecisionReason": "Auto-approved lint command",
    "updatedInput": { "command": "modified-command" }
  }
}
```

`permissionDecision`: `"allow"`, `"deny"`, or `"ask"`

### Context injection (SessionStart, UserPromptSubmit)

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Text injected into Claude's context"
  }
}
```

### Stop/TaskCompleted blocking

```json
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "Tests are failing"
  }
}
```

### File watching (CwdChanged, FileChanged)

```json
{
  "hookSpecificOutput": {
    "watchPaths": [".envrc", ".env.local"]
  }
}
```

## Environment Variables

| Variable | Available in | Description |
|----------|-------------|-------------|
| `$CLAUDE_PROJECT_DIR` | All hooks | Project root directory |
| `$CLAUDE_ENV_FILE` | SessionStart, CwdChanged, FileChanged | File to write env vars to |
| `$CLAUDE_PLUGIN_ROOT` | Plugin hooks | Plugin installation directory |
| `$CLAUDE_PLUGIN_DATA` | Plugin hooks | Plugin persistent data directory |

## Common Patterns

### Auto-format after edits

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "FILE=$(cat | jq -r '.tool_input.file_path') && pnpm exec biome format --write \"$FILE\" 2>/dev/null; exit 0"
        }]
      }
    ]
  }
}
```

### Protect sensitive files

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "FILE=$(cat | jq -r '.tool_input.file_path'); if echo \"$FILE\" | grep -qE '\\.env|\\.pem|secrets'; then echo 'Blocked: sensitive file' >&2; exit 2; fi; exit 0"
        }]
      }
    ]
  }
}
```

### Verify before stopping

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "if [ \"$(cat | jq -r '.stop_hook_active')\" = 'true' ]; then exit 0; fi; cd $CLAUDE_PROJECT_DIR && pnpm --filter web lint --quiet 2>/dev/null || (echo 'Lint errors -- fix before stopping' >&2; exit 2)"
        }]
      }
    ]
  }
}
```

### Desktop notification (macOS)

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "osascript -e 'display notification \"Claude needs your attention\" with title \"Claude Code\"'"
        }]
      }
    ]
  }
}
```

## Debugging

- `/hooks` -- browse all configured hooks
- `Ctrl+O` -- toggle verbose mode (see hook stderr)
- `claude --debug` -- full execution details
- Manual test: `echo '{...}' | ./hook.sh && echo "exit: $?"`

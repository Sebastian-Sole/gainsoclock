#!/bin/bash
# PostToolUse hook: Validate Claude Code artifacts (agents, skills, commands)
# Checks for required frontmatter fields, sections, and patterns
# Non-blocking -- feeds warnings back to Claude as context

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip if file doesn't exist (was deleted)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

ISSUES=""

# --- Agent files: .claude/agents/*.md ---
if echo "$FILE_PATH" | grep -qE '\.claude/agents/.*\.md$'; then
  if ! grep -q '^color:' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing 'color:' in frontmatter"
  fi
  if ! grep -q '^model:' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing 'model:' in frontmatter (don't rely on inheritance)"
  fi
  if ! grep -q '^tools:' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing 'tools:' in frontmatter (scope to minimum needed)"
  fi
  if ! grep -q '## Personality' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing '## Personality' section with quoted inner monologue"
  fi
fi

# --- Skill files: .claude/skills/*/SKILL.md ---
if echo "$FILE_PATH" | grep -qE '\.claude/skills/.*/SKILL\.md$'; then
  if ! grep -qi 'fires when' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Description should start with 'Fires when...' (trigger mechanism)"
  fi
  if ! grep -q '## Gotchas' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing '## Gotchas' section (highest-signal content in any skill)"
  fi
  LINE_COUNT=$(wc -l < "$FILE_PATH" | tr -d ' ')
  if [ "$LINE_COUNT" -gt 150 ]; then
    WORD_COUNT=$(wc -w < "$FILE_PATH" | tr -d ' ')
    if [ "$WORD_COUNT" -gt 2000 ]; then
      ISSUES="$ISSUES\n  - $WORD_COUNT words exceeds 2000-word limit. Move detail to references/"
    fi
  fi
fi

# --- Command files: .claude/commands/*.md ---
if echo "$FILE_PATH" | grep -qE '\.claude/commands/.*\.md$'; then
  if ! grep -q '^description:' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing 'description:' in frontmatter"
  fi
  if ! grep -q '^allowed-tools:' "$FILE_PATH" 2>/dev/null && ! grep -q 'allowed-tools:' "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  - Missing 'allowed-tools:' in frontmatter (scope tools to prevent side effects)"
  fi
fi

# --- Output report if issues found ---
if [ -n "$ISSUES" ]; then
  echo ""
  echo "--- ARTIFACT QUALITY: $(basename "$FILE_PATH") ---"
  printf "$ISSUES\n"
  echo "---"
  echo "Apply create-agent/create-skill/create-command + prompt-engineering skill patterns. See .claude/rules/artifact-quality.md for full checklist."
fi

exit 0

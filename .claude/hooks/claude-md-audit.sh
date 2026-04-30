#!/bin/bash
# PostToolUse hook: Audit CLAUDE.md files when modified
# Checks line count, anti-patterns, and structural issues
# Non-blocking -- feeds results back to Claude as context

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only match CLAUDE.md, AGENTS.md, and .claude/rules/*.md files
BASENAME=$(basename "$FILE_PATH")
case "$FILE_PATH" in
  */CLAUDE.md|*/AGENTS.md) ;;
  */.claude/rules/*.md) ;;
  */.claude/skills/*/SKILL.md) ;;
  *) exit 0 ;;
esac

# Skip if file doesn't exist (was deleted)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

ISSUES=""
WARNINGS=""

# --- Rule 1: Line count ---
LINE_COUNT=$(wc -l < "$FILE_PATH" | tr -d ' ')
if [ "$LINE_COUNT" -gt 200 ]; then
  ISSUES="$ISSUES\n  [CRITICAL] $LINE_COUNT lines -- exceeds 200-line limit. LLMs start ignoring ALL instructions past ~200 lines. Split with @imports or .claude/rules/."
elif [ "$LINE_COUNT" -gt 150 ]; then
  WARNINGS="$WARNINGS\n  [WARNING] $LINE_COUNT lines -- approaching 200-line limit. Consider splitting soon."
fi

# --- Rule 2: No linter-replaceable rules (skip SKILL.md files which contain examples) ---
if ! echo "$FILE_PATH" | grep -q "SKILL.md$"; then
  if grep -qiE "(use [0-9]+-space indent|use single quotes|use semicolons|trailing comma|max line length)" "$FILE_PATH" 2>/dev/null; then
    ISSUES="$ISSUES\n  [CRITICAL] Contains linter-replaceable style rules. Move to biome.json instead."
  fi
fi

# --- Rule 4: No obvious instructions ---
if grep -qiE "^-.*write clean code|^-.*follow best practices|^-.*handle errors properly|^-.*write good tests" "$FILE_PATH" 2>/dev/null; then
  WARNINGS="$WARNINGS\n  [WARNING] Contains obvious/vague instructions Claude already knows. Be specific or remove."
fi

# --- Rule 5: Stale code snippets ---
SNIPPET_LINES=$(grep -c '```' "$FILE_PATH" 2>/dev/null)
SNIPPET_LINES=${SNIPPET_LINES:-0}
if [ "$SNIPPET_LINES" -gt 8 ]; then
  WARNINGS="$WARNINGS\n  [WARNING] $((SNIPPET_LINES / 2)) code blocks found. Consider using file:line references instead to prevent staleness."
fi

# --- Check for conflicting path references ---
if echo "$FILE_PATH" | grep -q "CLAUDE.md$"; then
  # Check for references to non-existent paths
  while IFS= read -r REF_PATH; do
    # Resolve relative to project dir
    FULL_PATH="$CLAUDE_PROJECT_DIR/$REF_PATH"
    if [ ! -e "$FULL_PATH" ]; then
      WARNINGS="$WARNINGS\n  [WARNING] References '$REF_PATH' but path does not exist."
    fi
  done < <(grep -oE '`(apps/[^`]+|docs/[^`]+|packages/[^`]+)`' "$FILE_PATH" 2>/dev/null | tr -d '`' | sort -u)
fi

# --- Check for duplicate content across CLAUDE.md files ---
# (lightweight: just flag if the same file has content also in .claude/rules/)
if echo "$FILE_PATH" | grep -q "apps/.*/CLAUDE.md"; then
  RULES_DIR="$CLAUDE_PROJECT_DIR/.claude/rules"
  if [ -d "$RULES_DIR" ]; then
    # Check for section headers that also appear in rules files
    while IFS= read -r HEADER; do
      CLEAN_HEADER=$(echo "$HEADER" | sed 's/^## //' | tr '[:upper:]' '[:lower:]')
      if grep -rqil "$CLEAN_HEADER" "$RULES_DIR" 2>/dev/null; then
        WARNINGS="$WARNINGS\n  [WARNING] Section '$HEADER' may duplicate content in .claude/rules/. Consider removing from CLAUDE.md."
      fi
    done < <(grep -E '^## ' "$FILE_PATH" 2>/dev/null)
  fi
fi

# --- Output report if issues found ---
if [ -n "$ISSUES" ] || [ -n "$WARNINGS" ]; then
  echo ""
  echo "--- CLAUDE.MD AUDIT: $(basename "$FILE_PATH") ($LINE_COUNT lines) ---"
  if [ -n "$ISSUES" ]; then
    printf "$ISSUES\n"
  fi
  if [ -n "$WARNINGS" ]; then
    printf "$WARNINGS\n"
  fi
  echo "---"
  echo "Run /claude-md for a full audit. See .claude/skills/claude-md/SKILL.md for all rules."
fi

exit 0

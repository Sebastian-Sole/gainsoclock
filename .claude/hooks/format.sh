#!/bin/bash
# PostToolUse hook: Auto-fix lint/format issues on edited .ts/.tsx/.js/.jsx files.
# Uses ESLint (the project's lint stack). Async + non-blocking.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

[ ! -f "$FILE_PATH" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Scope to the single edited file -- fast.
npx --no-install eslint --fix "$FILE_PATH" >/dev/null 2>&1

exit 0

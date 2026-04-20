#!/bin/bash
# PostToolUse hook: Warn if the edited file contains console.log / console.debug / console.warn / console.error
# that isn't wrapped in a __DEV__ guard. Non-blocking.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

[ ! -f "$FILE_PATH" ] && exit 0

# Skip test files and scripts dir where logging is expected.
case "$FILE_PATH" in
  */scripts/*|*.test.*|*.spec.*) exit 0 ;;
esac

# Match console.(log|debug|warn|error)( on lines that do not also mention __DEV__.
MATCHES=$(grep -nE 'console\.(log|debug|warn|error)\(' "$FILE_PATH" | grep -vE '__DEV__' || true)

if [ -n "$MATCHES" ]; then
  COUNT=$(echo "$MATCHES" | wc -l | tr -d ' ')
  echo ""
  echo "--- CONSOLE.LOG WARN: $COUNT unguarded console call(s) in $(basename "$FILE_PATH") ---"
  echo "$MATCHES" | head -10
  echo "---"
  echo "Wrap in 'if (__DEV__)' or remove before committing."
fi

exit 0

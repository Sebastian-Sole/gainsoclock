#!/bin/bash
# PostToolUse hook: TypeScript check after editing .ts/.tsx files.
# Async + non-blocking. Reports errors back to Claude as context.
# Skips files under convex/ (they're typechecked by the Convex CLI, not tsc).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Skip Convex files -- they have their own tsconfig and CLI typecheck.
case "$FILE_PATH" in
  */convex/*) exit 0 ;;
esac

# Skip if the file no longer exists (delete/rename).
[ ! -f "$FILE_PATH" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

RESULT=$(npx --no-install tsc --noEmit --pretty false 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  # Filter to errors that mention the edited file (fast signal).
  FILE_ERRORS=$(echo "$RESULT" | grep -F "$(basename "$FILE_PATH")")
  if [ -n "$FILE_ERRORS" ]; then
    echo ""
    echo "--- TYPECHECK: errors in $(basename "$FILE_PATH") ---"
    echo "$FILE_ERRORS" | head -20
    echo "---"
    echo "Fix the type errors before continuing. Full run: npx tsc --noEmit"
  fi
fi

exit 0

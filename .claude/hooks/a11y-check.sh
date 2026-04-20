#!/bin/bash
# PostToolUse hook: Run ESLint a11y rules on the edited .tsx/.jsx file.
# eslint-config-expo ships jsx-a11y rules by default. Non-blocking; surfaces
# violations as context back to Claude.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.tsx|*.jsx) ;;
  *) exit 0 ;;
esac

[ ! -f "$FILE_PATH" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Lint the single file; keep only jsx-a11y/* rule hits.
RAW=$(npx --no-install eslint --format compact "$FILE_PATH" 2>/dev/null)
A11Y=$(echo "$RAW" | grep -E 'jsx-a11y/|react-native-a11y/' || true)

if [ -n "$A11Y" ]; then
  COUNT=$(echo "$A11Y" | wc -l | tr -d ' ')
  echo ""
  echo "--- A11Y CHECK: $COUNT violation(s) in $(basename "$FILE_PATH") ---"
  echo "$A11Y" | head -15
  echo "---"
  echo "Add accessibilityLabel / accessibilityRole, or fix semantic markup before continuing."
fi

exit 0

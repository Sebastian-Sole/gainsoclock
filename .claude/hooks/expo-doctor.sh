#!/bin/bash
# PostToolUse hook: after edits to the root package.json, verify that installed
# dependency versions still match Expo SDK's expected matrix. Catches accidental
# `pnpm add <rn-pkg>` usage (which skips the Expo version pin) and New-Arch
# incompat additions.
#
# Fast (<5s normally), non-blocking, silent when everything is clean.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

# Only fire on the *root* package.json -- not convex/package.json or any nested one.
if [ "$FILE_PATH" != "$CLAUDE_PROJECT_DIR/package.json" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# If Expo isn't installed yet (e.g. fresh clone before `pnpm install`), skip silently.
if ! pnpm exec --silent expo --version >/dev/null 2>&1; then
  exit 0
fi

# --- Check 1: dep versions match the SDK's matrix (quick, local) ---
CHECK_RESULT=$(pnpm exec expo install --check 2>&1)
CHECK_EXIT=$?

if [ $CHECK_EXIT -ne 0 ]; then
  echo ""
  echo "--- EXPO DEP CHECK: version mismatches after package.json edit ---"
  echo "$CHECK_RESULT" | head -40
  echo "---"
  echo "Reinstall mismatched deps with 'pnpm expo install <pkg>' (not 'pnpm add')."
  echo "'pnpm expo install' picks the version Expo SDK 54 expects; 'pnpm add' does not."
fi

# --- Check 2: broader doctor report (New Arch compat, peer deps, plugin config) ---
# expo-doctor hits the React Native Directory API. Outer timeout (30s) in
# settings.json caps runtime; no inner timeout needed (macOS lacks `timeout` by default).
DOCTOR_RESULT=$(pnpm exec expo-doctor 2>&1)
DOCTOR_EXIT=$?

# expo-doctor exits non-zero when any check fails. Show only when it does.
if [ $DOCTOR_EXIT -ne 0 ]; then
  # Filter to lines that actually flag something (skip the 'x passed' noise).
  FILTERED=$(echo "$DOCTOR_RESULT" | grep -E '(✖|warning|incompatible|issue|fails)' | head -20)
  if [ -n "$FILTERED" ]; then
    echo ""
    echo "--- EXPO DOCTOR: findings after package.json edit ---"
    echo "$FILTERED"
    echo "---"
    echo "Full report: pnpm exec expo-doctor"
  fi
fi

exit 0

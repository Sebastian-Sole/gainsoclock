#!/bin/bash
# Stop hook: At session end, scan files modified vs main for unguarded console.* calls.
# Non-blocking summary. Skips scripts/ and test files.

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Files changed in the working tree (staged + unstaged + untracked tracked by diff).
CHANGED=$(git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null)
CHANGED=$(echo "$CHANGED" | sort -u | grep -E '\.(ts|tsx|js|jsx)$' || true)

[ -z "$CHANGED" ] && exit 0

REPORT=""
TOTAL=0

while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ ! -f "$f" ] && continue
  case "$f" in
    */scripts/*|*.test.*|*.spec.*) continue ;;
  esac
  HITS=$(grep -nE 'console\.(log|debug|warn|error)\(' "$f" | grep -vE '__DEV__' || true)
  if [ -n "$HITS" ]; then
    COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
    TOTAL=$((TOTAL + COUNT))
    REPORT="$REPORT\n  $f: $COUNT"
  fi
done <<< "$CHANGED"

if [ "$TOTAL" -gt 0 ]; then
  echo ""
  echo "--- CONSOLE.LOG AUDIT: $TOTAL unguarded call(s) across modified files ---"
  printf "$REPORT\n"
  echo "---"
  echo "Clean these up before the PR."
fi

exit 0

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# prism-auto.sh — Automated Prism session runner
# ═══════════════════════════════════════════════════════════════
#
# Runs all 9 Prism phases as separate Claude sessions.
# Each phase gets a fresh context window — no risk of hitting limits.
# Progress checkpointed to docs/prism/<session>/ via output files.
#
# Usage:
#   scripts/prism-auto.sh <session> "<topic>"
#   scripts/prism-auto.sh <session> "<topic>" --from explore
#   scripts/prism-auto.sh <session> "<topic>" --only gate
#
# Environment:
#   PRISM_MODEL        Model for Claude calls (default: opus)
#   PRISM_VERBOSE      Show verbose output (default: false)
#   PRISM_DRY_RUN      Print prompts without running (default: false)
#
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────

MODEL="${PRISM_MODEL:-opus}"
VERBOSE="${PRISM_VERBOSE:-false}"
DRY_RUN="${PRISM_DRY_RUN:-false}"

MAX_TURNS_LIGHT=50
MAX_TURNS_HEAVY=200

PHASES=(brief assume explore rotate synthesize gate plan split run)

# ── Args ────────────────────────────────────────────────────────

SESSION="${1:?Usage: scripts/prism-auto.sh <session> \"<topic>\" [--from <phase>] [--until <phase>] [--only <phase>]}"
TOPIC="${2:?Provide topic description as second argument}"
FROM=""
UNTIL=""
ONLY=""

shift 2
while [[ $# -gt 0 ]]; do
  case $1 in
    --from)  FROM="$2";  shift 2 ;;
    --until) UNTIL="$2"; shift 2 ;;
    --only)  ONLY="$2";  shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Paths ───────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIR="$PROJECT_ROOT/docs/prism/$SESSION"
LOG="$DIR/logs"

# ── Validation ──────────────────────────────────────────────────

if [[ ! -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
  echo "Error: Run from project root or ensure CLAUDE.md exists" >&2
  exit 1
fi

if ! command -v claude &> /dev/null; then
  echo "Error: 'claude' CLI not found in PATH" >&2
  exit 1
fi

mkdir -p "$LOG"

# ── Helpers ─────────────────────────────────────────────────────

ts() { date +%H:%M:%S; }

is_done() {
  case $1 in
    brief)      [[ -f "$DIR/brief.md" ]] ;;
    assume)     [[ -f "$DIR/assumptions.md" ]] ;;
    explore)    [[ -d "$DIR/findings" ]] && find "$DIR/findings" -name "*.md" -print -quit 2>/dev/null | grep -q . ;;
    rotate)     [[ -d "$DIR/rotations" ]] && find "$DIR/rotations" -name "*.md" -print -quit 2>/dev/null | grep -q . ;;
    synthesize) [[ -f "$DIR/synthesis.md" ]] ;;
    gate)       [[ -f "$DIR/gate-decision.md" ]] ;;
    plan)       [[ -f "$DIR/plan/master-plan.md" ]] ;;
    split)      [[ -d "$DIR/plan/sub-plans" ]] && find "$DIR/plan/sub-plans" -name "plan-*.md" -print -quit 2>/dev/null | grep -q . ;;
    run)        return 1 ;; # always re-check — completion is complex
    *)          return 1 ;;
  esac
}

turns_for() {
  case $1 in
    brief|assume|gate|split) echo "$MAX_TURNS_LIGHT" ;;
    *)                       echo "$MAX_TURNS_HEAVY" ;;
  esac
}

# ── Phase Runner ────────────────────────────────────────────────

run_phase() {
  local phase="$1"
  local prompt
  prompt="$(build_prompt "$phase")"
  local turns
  turns="$(turns_for "$phase")"

  echo ""
  echo "$(ts) ┌─── $phase"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "--- PROMPT ---"
    echo "$prompt"
    echo "--- END ---"
    echo "$(ts) └─── $phase (dry run)"
    return 0
  fi

  local flags=(
    -p "$prompt"
    --model "$MODEL"
    --max-turns "$turns"
    --dangerously-skip-permissions
  )
  [[ "$VERBOSE" == "true" ]] && flags+=(--verbose)

  if claude "${flags[@]}" 2>&1 | tee "$LOG/$phase.log"; then
    echo ""
    echo "$(ts) └─── $phase done"
  else
    local code=$?
    echo ""
    echo "$(ts) └─── $phase FAILED (exit $code)" >&2
    echo "     Log: $LOG/$phase.log" >&2
    exit 1
  fi
}

# ── Prompt Builder ──────────────────────────────────────────────

build_prompt() {
  local phase="$1"

  cat <<PROMPT
Phase: $(echo "$phase" | tr '[:lower:]' '[:upper:]') | Session: $SESSION

Read .claude/commands/prism-$phase.md and follow its instructions.
\$1 in those instructions = '$SESSION'.

$(phase_context "$phase")

This is an automated pipeline run:
- Decide autonomously where the instructions expect user input.
- Skip the progress display and next-step offer at the end.
- Write all outputs to the expected paths under docs/prism/$SESSION/.
PROMPT
}

phase_context() {
  case $1 in
    brief)
      cat <<CTX
Topic for exploration:
$TOPIC

Background materials are in docs/synthesis/ and docs/background/. Read what's relevant to the topic and incorporate it into the brief.
Create the brief directly — no user discussion needed.
CTX
      ;;

    assume)
      echo "Extract assumptions from the brief and score them on importance x certainty. Use your judgment on scores — no user discussion needed."
      ;;

    explore)
      echo "Select topics and perspectives based on the critical assumptions. Spawn all explorer agents in parallel. Use model: \"opus\" for all Task calls."
      ;;

    rotate)
      echo "Run the Charette rotation on all findings from the explore phase. Spawn rotation agents in parallel. Use model: \"opus\" for all Task calls."
      ;;

    synthesize)
      echo "Synthesize all findings and rotations into a unified analysis. Use model: \"opus\" for the synthesizer Task call."
      ;;

    gate)
      cat <<CTX
Choose Option A (proceed to planning). The exploration has produced enough information to plan.

Write a brief decision note to docs/prism/$SESSION/gate-decision.md with format:
# Gate Decision
Decision: Proceed to planning (Option A)
Rationale: <one paragraph summary of why the exploration is sufficient>
CTX
      ;;

    plan)
      echo "Create the master plan and run all relevant domain reviews. If any reviewer flags issues, address them and re-review automatically. Use model: \"opus\" for all Task calls."
      ;;

    split)
      echo "Split the master plan into independent sub-plans. Include the dependency graph."
      ;;

    run)
      echo "Execute all sub-plans in batch mode. Parallelize where dependencies allow. Use model: \"opus\" for all implementer Task calls."
      ;;
  esac
}

# ── Main ────────────────────────────────────────────────────────

main() {
  local display_topic="${TOPIC:0:60}"
  [[ ${#TOPIC} -gt 60 ]] && display_topic+="..."

  echo "═══════════════════════════════════════════════════"
  echo "  PRISM AUTO  $SESSION"
  echo "  Topic: $display_topic"
  echo "  Model: $MODEL"
  echo "═══════════════════════════════════════════════════"

  local skip=true
  [[ -z "$FROM" ]] && skip=false
  local past_until=false

  for phase in "${PHASES[@]}"; do
    # Handle --from: skip phases before the target
    if $skip; then
      if [[ "$phase" == "$FROM" ]]; then
        skip=false
      else
        echo "$(ts)   skip $phase (before --from $FROM)"
        continue
      fi
    fi

    # Handle --only: skip phases that don't match
    if [[ -n "$ONLY" && "$phase" != "$ONLY" ]]; then
      continue
    fi

    # Handle --until: stop before phases after the target
    if [[ -n "$UNTIL" ]] && [[ "$phase" != "$UNTIL" ]] && $past_until; then
      break
    fi
    if [[ -n "$UNTIL" && "$phase" == "$UNTIL" ]]; then
      past_until=true
    fi

    # Skip completed phases
    if is_done "$phase"; then
      echo "$(ts)   done $phase"
      continue
    fi

    # Run it — delegate to prism-implement.sh for the run phase
    if [[ "$phase" == "run" ]]; then
      "$SCRIPT_DIR/prism-implement.sh" "$SESSION" --model "$MODEL"
    else
      run_phase "$phase"
    fi

    # Break after --only
    [[ -n "$ONLY" ]] && break
  done

  echo ""
  echo "$(ts) ═══ $SESSION complete ═══"
  echo "$(ts) Output: docs/prism/$SESSION/"
}

cd "$PROJECT_ROOT"
main

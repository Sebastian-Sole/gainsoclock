#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# prism-implement.sh — Execute Prism sub-plans with dependency-aware parallelism
# ═══════════════════════════════════════════════════════════════
#
# Reads sub-plans from docs/prism/<session>/plan/sub-plans/,
# parses their dependency graph, and executes them as separate
# Claude sessions. Each sub-plan gets a fresh context window.
#
# Usage:
#   scripts/prism-implement.sh <session>
#   scripts/prism-implement.sh <session> --only plan-03
#   scripts/prism-implement.sh <session> --sequential
#
# Environment:
#   PRISM_MODEL        Model for Claude calls (default: opus)
#   PRISM_MAX_TURNS    Max turns per sub-plan (default: 200)
#   PRISM_DRY_RUN      Print prompts without running (default: false)
#
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────

MODEL="${PRISM_MODEL:-opus}"
MAX_TURNS="${PRISM_MAX_TURNS:-200}"
DRY_RUN="${PRISM_DRY_RUN:-false}"
SEQUENTIAL=false
ONLY=""
MAX_RETRIES="${PRISM_MAX_RETRIES:-10}"
RETRY_WAIT="${PRISM_RETRY_WAIT:-3600}"  # seconds between retries on rate limit (default 1 hour)

# ── Args ────────────────────────────────────────────────────────

SESSION="${1:?Usage: scripts/prism-implement.sh <session> [--only plan-NN] [--sequential]}"
shift

while [[ $# -gt 0 ]]; do
  case $1 in
    --only)       ONLY="$2"; shift 2 ;;
    --sequential) SEQUENTIAL=true; shift ;;
    --model)      MODEL="$2"; shift 2 ;;
    --max-turns)  MAX_TURNS="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Paths ───────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIR="$PROJECT_ROOT/docs/prism/$SESSION"
SUBPLANS_DIR="$DIR/plan/sub-plans"
IMPL_DIR="$DIR/implementation"
LOG_DIR="$DIR/logs"

# State directory (file-based, bash 3.2 compatible)
STATE_DIR=$(mktemp -d)
trap 'rm -rf "$STATE_DIR"' EXIT

# ── Validation ──────────────────────────────────────────────────

if [[ ! -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
  echo "Error: CLAUDE.md not found. Run from project root." >&2
  exit 1
fi

if ! command -v claude &> /dev/null; then
  echo "Error: 'claude' CLI not found in PATH." >&2
  exit 1
fi

if [[ ! -d "$SUBPLANS_DIR" ]]; then
  echo "Error: No sub-plans directory at $SUBPLANS_DIR" >&2
  echo "Run /prism-split $SESSION first." >&2
  exit 1
fi

mkdir -p "$IMPL_DIR" "$LOG_DIR"

# ── Helpers ─────────────────────────────────────────────────────

ts() { date +%H:%M:%S; }

# ── State Management (file-based for bash 3.2) ─────────────────

PLAN_IDS=()

set_plan_file()   { echo "$2" > "$STATE_DIR/$1.file"; }
set_plan_deps()   { echo "$2" > "$STATE_DIR/$1.deps"; }
set_plan_status() { echo "$2" > "$STATE_DIR/$1.status"; }

get_plan_file()   { cat "$STATE_DIR/$1.file" 2>/dev/null; }
get_plan_deps()   { cat "$STATE_DIR/$1.deps" 2>/dev/null; }
get_plan_status() { cat "$STATE_DIR/$1.status" 2>/dev/null; }

plan_exists() { [[ -f "$STATE_DIR/$1.file" ]]; }

# ── Parse Sub-Plans ─────────────────────────────────────────────

parse_subplans() {
  local f plan_id deps_line

  for f in "$SUBPLANS_DIR"/plan-*.md; do
    [[ -f "$f" ]] || continue

    # Extract plan-NN from filename (e.g., plan-01-data-types.md -> plan-01)
    plan_id=$(basename "$f" | grep -oE 'plan-[0-9]+')
    [[ -z "$plan_id" ]] && continue

    PLAN_IDS+=("$plan_id")
    set_plan_file "$plan_id" "$f"

    # Parse "Requires:" from Dependencies section
    deps_line=$(sed -n '/^## Dependencies/,/^## [^D]/p' "$f" 2>/dev/null | \
                grep -i 'requires' | \
                grep -oE 'plan-[0-9]+' | \
                tr '\n' ' ' || true)
    set_plan_deps "$plan_id" "${deps_line:-}"

    # Check if already completed
    if [[ -f "$IMPL_DIR/${plan_id}-log.md" ]] && \
       grep -q "^Status: complete" "$IMPL_DIR/${plan_id}-log.md" 2>/dev/null; then
      set_plan_status "$plan_id" "done"
    else
      set_plan_status "$plan_id" "pending"
    fi
  done

  # Sort plan IDs
  local sorted
  sorted=$(printf '%s\n' "${PLAN_IDS[@]}" | sort)
  PLAN_IDS=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && PLAN_IDS+=("$line")
  done <<< "$sorted"
}

# ── Dependency Graph ────────────────────────────────────────────

deps_met() {
  local plan="$1" dep deps
  deps=$(get_plan_deps "$plan")
  for dep in $deps; do
    [[ "$(get_plan_status "$dep")" != "done" ]] && return 1
  done
  return 0
}

get_ready() {
  local plan status
  for plan in "${PLAN_IDS[@]}"; do
    status=$(get_plan_status "$plan")
    if [[ "$status" == "pending" ]] && deps_met "$plan"; then
      echo "$plan"
    fi
  done
}

count_by_status() {
  local target="$1" count=0 plan
  for plan in "${PLAN_IDS[@]}"; do
    [[ "$(get_plan_status "$plan")" == "$target" ]] && count=$((count + 1))
  done
  echo "$count"
}

# ── Build Prompt ────────────────────────────────────────────────

build_prompt() {
  local plan_id="$1"
  local plan_file
  plan_file=$(get_plan_file "$plan_id")

  cat <<PROMPT
Session: $SESSION | Sub-plan: $plan_id

Read your sub-plan at: $plan_file
If you need broader context, selectively read sections from docs/prism/$SESSION/plan/master-plan.md by heading — do not read the whole file.

Implement what the sub-plan specifies. When done, write a completion log to docs/prism/$SESSION/implementation/${plan_id}-log.md with this exact format:

# Implementation Log: $plan_id
Status: complete

## Summary
<what was built>

## Files Created/Modified
<list>

## Tests
<results>

The line "Status: complete" is how the orchestrator knows you finished.
PROMPT
}

# ── Verify Completion ───────────────────────────────────────────

verify_complete() {
  local plan_id="$1"
  local impl_log="$IMPL_DIR/${plan_id}-log.md"
  [[ -f "$impl_log" ]] && grep -q "^Status: complete" "$impl_log" 2>/dev/null
}

# ── Execute Sub-Plan ────────────────────────────────────────────

AGENT_FILE=".claude/agents/prism-implementer.md"

run_subplan() {
  local plan_id="$1"
  local prompt
  prompt="$(build_prompt "$plan_id")"
  local log_file="$LOG_DIR/${plan_id}.log"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "--- PROMPT for $plan_id ---" > "$log_file"
    echo "$prompt" >> "$log_file"
    echo "--- SYSTEM PROMPT APPENDED: $AGENT_FILE ---" >> "$log_file"
    echo "--- END ---" >> "$log_file"
    return 0
  fi

  local attempt=0
  while true; do
    attempt=$((attempt + 1))

    # Run claude with the implementer agent as system context
    claude -p "$prompt" \
      --append-system-prompt-file "$AGENT_FILE" \
      --model "$MODEL" \
      --max-turns "$MAX_TURNS" \
      --dangerously-skip-permissions \
      > "$log_file" 2>&1 || true

    # Check for completion
    if verify_complete "$plan_id"; then
      return 0
    fi

    # Not complete — retry with wait (rate limit, crash, max-turns, whatever)
    if [[ $attempt -lt $MAX_RETRIES ]]; then
      local wait_msg
      wait_msg="$(($RETRY_WAIT / 3600))h$((($RETRY_WAIT % 3600) / 60))m"
      echo "$(ts)   $plan_id not complete — waiting $wait_msg before retry (attempt $attempt/$MAX_RETRIES)"
      sleep "$RETRY_WAIT"
      continue
    fi

    # Exhausted retries
    return 1
  done
}

# ── Display ─────────────────────────────────────────────────────

show_graph() {
  echo ""
  echo "  Sub-plans:"
  local plan deps status indicator name
  for plan in "${PLAN_IDS[@]}"; do
    deps=$(get_plan_deps "$plan")
    status=$(get_plan_status "$plan")
    case $status in
      done)    indicator="●" ;;
      running) indicator="◆" ;;
      failed)  indicator="✗" ;;
      *)       indicator="○" ;;
    esac
    name=$(basename "$(get_plan_file "$plan")" .md | sed "s/^${plan}-//")
    printf "  %s %-8s  %s" "$indicator" "$plan" "$name"
    [[ -n "$deps" ]] && printf "  <- %s" "$deps"
    echo ""
  done
  echo ""
}

show_progress() {
  local done_count total
  done_count=$(count_by_status "done")
  total=${#PLAN_IDS[@]}
  echo "$(ts) Progress: $done_count / $total"
}

# ── Run Wave (parallel batch of independent plans) ──────────────

run_wave() {
  local pids=()
  local pid_plans=()
  local plan

  for plan in "$@"; do
    set_plan_status "$plan" "running"
    echo "$(ts) ┌─── $plan"

    run_subplan "$plan" &
    pids+=($!)
    pid_plans+=("$plan")
  done

  # Wait for all processes, then verify completion via log files
  local i wave_had_failure=false
  for i in $(seq 0 $((${#pids[@]} - 1))); do
    plan="${pid_plans[$i]}"
    wait "${pids[$i]}" 2>/dev/null || true

    if [[ "$DRY_RUN" == "true" ]] || verify_complete "$plan"; then
      set_plan_status "$plan" "done"
      echo "$(ts) └─── $plan done"
    else
      # Back to pending — will be retried after a wait
      set_plan_status "$plan" "pending"
      echo "$(ts) └─── $plan not complete (will retry)"
      wave_had_failure=true
    fi
  done

  show_progress

  # Only wait if something in THIS wave failed
  if $wave_had_failure; then
    local wait_msg
    wait_msg="$(($RETRY_WAIT / 3600))h$((($RETRY_WAIT % 3600) / 60))m"
    echo "$(ts) Waiting $wait_msg before retrying..."
    sleep "$RETRY_WAIT"
  fi
}

# ── Run Single Plan (sequential mode or single-plan wave) ───────

run_single() {
  local plan="$1"
  set_plan_status "$plan" "running"
  echo "$(ts) ┌─── $plan"

  if [[ "$DRY_RUN" == "true" ]]; then
    run_subplan "$plan"
    set_plan_status "$plan" "done"
    echo "$(ts) └─── $plan (dry run)"
  else
    local prompt log_file attempt=0
    prompt="$(build_prompt "$plan")"
    log_file="$LOG_DIR/${plan}.log"

    while true; do
      attempt=$((attempt + 1))

      claude -p "$prompt" \
        --append-system-prompt-file "$AGENT_FILE" \
        --model "$MODEL" \
        --max-turns "$MAX_TURNS" \
        --dangerously-skip-permissions \
        2>&1 | tee "$log_file" || true

      echo ""

      if verify_complete "$plan"; then
        set_plan_status "$plan" "done"
        echo "$(ts) └─── $plan done"
        break
      fi

      if [[ $attempt -lt $MAX_RETRIES ]]; then
        local wait_msg
        wait_msg="$(($RETRY_WAIT / 3600))h$((($RETRY_WAIT % 3600) / 60))m"
        echo "$(ts)   $plan not complete — waiting $wait_msg before retry (attempt $attempt/$MAX_RETRIES)"
        sleep "$RETRY_WAIT"
        continue
      fi

      set_plan_status "$plan" "failed"
      echo "$(ts) └─── $plan EXHAUSTED $MAX_RETRIES retries" >&2
      exit 1
    done
  fi

  show_progress
}

# ── Main ────────────────────────────────────────────────────────

main() {
  parse_subplans

  if [[ ${#PLAN_IDS[@]} -eq 0 ]]; then
    echo "No sub-plans found in $SUBPLANS_DIR" >&2
    exit 1
  fi

  local total=${#PLAN_IDS[@]}
  local done_count
  done_count=$(count_by_status "done")
  local mode="parallel"
  $SEQUENTIAL && mode="sequential"

  echo "═══════════════════════════════════════════════════"
  echo "  PRISM IMPLEMENT  $SESSION"
  echo "  Sub-plans: $total  ($done_count already done)"
  echo "  Mode: $mode"
  echo "  Model: $MODEL  |  Max turns: $MAX_TURNS"
  echo "═══════════════════════════════════════════════════"

  show_graph

  # Handle --only
  if [[ -n "$ONLY" ]]; then
    if ! plan_exists "$ONLY"; then
      echo "Error: $ONLY not found in sub-plans." >&2
      exit 1
    fi
    echo "$(ts) Running single plan: $ONLY"
    run_single "$ONLY"
    return
  fi

  # Main execution loop
  while true; do
    local ready
    ready=$(get_ready)

    if [[ -z "$ready" ]]; then
      local pending
      pending=$(count_by_status "pending")

      if [[ "$pending" -eq 0 ]]; then
        echo ""
        echo "$(ts) ═══ All $total sub-plans complete ═══"
        echo "$(ts) Logs: $IMPL_DIR/"
        echo ""
        echo "Next steps:"
        echo "  - Review the implementation"
        echo "  - Run tests:  pnpm test"
        echo "  - Commit:     /mike:commit"
        break
      else
        echo ""
        echo "$(ts) Deadlock: $pending plans have unmet dependencies." >&2
        local plan
        for plan in "${PLAN_IDS[@]}"; do
          if [[ "$(get_plan_status "$plan")" == "pending" ]]; then
            echo "  $plan requires: $(get_plan_deps "$plan")" >&2
          fi
        done
        exit 1
      fi
    fi

    # Convert ready list to array
    local ready_arr=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && ready_arr+=("$line")
    done <<< "$ready"

    if $SEQUENTIAL || [[ ${#ready_arr[@]} -eq 1 ]]; then
      for plan in "${ready_arr[@]}"; do
        run_single "$plan"
      done
    else
      echo "$(ts) Wave: ${ready_arr[*]}"
      run_wave "${ready_arr[@]}"
    fi
  done
}

cd "$PROJECT_ROOT"
main

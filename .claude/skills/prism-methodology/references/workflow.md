# Prism Workflow — Phase Details

## Session Directory Structure

```
docs/prism/{session-name}/
  brief.md                         # Problem framing + scope
  orient.md                         # Inquiry map (exploration value x understanding)
  loadout.md                       # Recommended tools, MCPs, skills
  metrics.md                       # Token usage tracking per phase
  research/
    {topic}/
      {perspective}.md             # Individual explorer research
  rotations/
    round-{n}/
      {reviewer}-reviews-{original}.md
  synthesis.md                     # Unified synthesis
  gate-decisions.md                # Numbered decision log from gate phase
  decisions/
    adr-001-{title}.md             # Architecture Decision Records
  reviews/
    {domain}.md                    # Plan review by domain specialist
  plan/
    master-plan.md                 # Comprehensive plan
    sub-plans/
      plan-01-{name}.md            # Self-contained implementation plans
    review-fixes.md                # Fixes applied + deferred work from review
  implementation/
    plan-{NN}-log.md               # Implementation logs per sub-plan
  session-summary.md               # Final session summary (exists = closed)
```

## Phase 1: Brief (`/prism-brief`)

Interactive discussion to frame the problem. Produces `brief.md`.

The brief answers: What are we building and why? Who are the stakeholders? What does success look like? What background materials exist? What constraints are non-negotiable?

## Phase 2: Orient (`/prism-orient`)

Map what we need to understand before exploring. Covers five dimensions: risks, domain knowledge, prior art, vision, and unknowns. Score on two axes:

- **Exploration value** (1-5): How much would understanding this improve our plan?
- **Current understanding** (1-5): How well do we already understand this?

Focus exploration on: High value + Low understanding (the "Explore" quadrant).

## Phase 3: Explore (`/prism-explore`)

Launch parallel explorer agents with assigned perspectives and topics. Each agent writes to its own file — no shared writes, no conflicts.

The orchestrator:
1. Reads brief and orient.md
2. Identifies exploration topics from the "Explore" quadrant inquiry areas
3. Assigns perspectives to each topic
4. Runs loadout step to recommend tools
5. Launches explorers in parallel

## Phase 4: Rotate (`/prism-rotate`)

Charette rotation. Each explorer reads a DIFFERENT explorer's findings and writes a response: what was missed, what should be challenged, what should be extended.

Rotation creates engagement with blind spots — perspectives you wouldn't generate yourself.

## Phase 5: Synthesize (`/prism-synthesize`)

A synthesizer reads ALL findings and rotations. Produces:
- Unified themes and patterns
- Contradictions between findings (often the most valuable areas)
- Gaps needing more exploration
- Confidence-weighted conclusions

## Phase 6: Gate (`/prism-gate`)

Interactive decision point. Review synthesis together:
- Enough information? → Proceed to `/prism-plan`
- Gaps identified? → Return to `/prism-explore` with refined topics
- New questions? → Return to `/prism-orient`

### Gate Decision Tracking

The gate phase produces `gate-decisions.md` — a numbered log of every decision made during the gate walkthrough. Each decision (G-01, G-02, ...) includes:
- The decision itself
- Rationale and alternatives considered
- Variant potential (can this be decided differently?)
- Revisit triggers (what would change this decision?)

This file is the primary input to `/prism-plan`. It also enables **variant planning**: the same research can produce multiple gate-decisions files with different choices, leading to different plans from the same exploration. For example, one gate run might choose PWA while another chooses Expo — both feed into separate plans built on the same research base.

```
docs/prism/{session-name}/
  gate-decisions.md              # Primary decision record
  gate-decisions-variant-b.md    # Optional: alternative decision set
```

## Phase 7: Plan (`/prism-plan`)

Create comprehensive master plan. The planner:
1. Reads full synthesis and all ADRs
2. Creates phased plan with dependencies and risk mitigations
3. Dynamic domain reviewers are spawned based on plan content
4. Iterates based on reviewer feedback until approved

## Phase 8: Split (`/prism-split`)

Break master plan into self-contained sub-plans. Each sub-plan includes:
- All context needed to implement (no external dependencies)
- Clear acceptance criteria
- Specific files to create/modify
- Relevant findings from exploration
- Pseudo-code or examples where helpful (not full implementations)

## Phase 9: Implement (`/prism-run`)

Execute sub-plans using `scripts/prism-implement.sh`. The `/prism-run` command displays the implementation plan and dependency graph, then directs the user to run the bash script for actual execution.

## Phase 10: Review (`/prism-review`)

Interview-style human review. The user brings feedback on what was implemented:
- Discuss what works, what doesn't, what to change
- Fix minor issues on the spot with agreement
- Capture larger items as deferred work with agreed approaches

Produces `plan/review-fixes.md` — a single document recording both applied fixes and deferred work, used by close as the source of truth.

## Phase 11: Close (`/prism-close`)

Generate a session summary, commit changes, and optionally create a PR. The summary captures what was built, key decisions, drift from plan, and what's left in the parking lot. `session-summary.md` existence marks the session as closed.

---
description: "Split the master plan into self-contained sub-plans for parallel implementation."
argument-hint: "<session-name>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# Prism Split

Break the master plan into self-contained sub-plans that can be executed independently.

## What to Do

1. **Read** `docs/prism/$1/plan/master-plan.md`
2. **Identify natural boundaries**: Each sub-plan should be a logical unit of work that can be implemented and tested independently. Good boundaries:
   - A single component or page
   - A data layer (types, schemas, validation)
   - A service integration
   - A feature slice (vertical: data → API → UI)
3. **Determine dependencies**: Some sub-plans must complete before others can start. Document this.
4. **Write sub-plans**: Create `docs/prism/$1/plan/sub-plans/plan-{NN}-{name}.md`

## Sub-Plan Structure

Each sub-plan must be fully self-contained:

```markdown
# Sub-Plan {NN}: {Name}

## Dependencies
- Requires: plan-01 (data types must exist first)
- Blocks: plan-04 (needs this API)

## Objective
What this sub-plan builds, in one paragraph.

## Context
Relevant findings, decisions, and architecture context — everything the implementer needs without reading other files.

## Implementation
- Files to create/modify (with paths)
- Approach and key decisions
- Pseudo-code or examples where the approach isn't obvious

## Acceptance Criteria
- [ ] Specific, testable criteria
- [ ] Including accessibility requirements
- [ ] Including test requirements

## Risks
Known risks specific to this sub-plan and how to handle them.
```

## Important

The sub-plans will be executed by `prism-implementer` agents that may not have access to the broader exploration context. Everything they need must be IN the sub-plan.

## Stop Here

<important>When sub-plans are written, present the dependency graph and stop. Do not invoke `/prism-run` or any other prism command. Do not start implementation. Wait for the user to explicitly tell you what to do next.</important>

Output the progress display (read `.claude/skills/prism-methodology/references/progress-display.md`). Phases 1-8 done, phase 9 current, rest pending. Header: 8 of 11.

Offer: "Want me to run `/prism-run $1`? It shows the implementation plan and guides you to run `scripts/prism-implement.sh $1`."

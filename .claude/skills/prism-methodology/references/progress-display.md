# Progress Display

Output this visual at the end of each phase, before your offer. Output as regular markdown text — NOT in a code block — so backtick and italic formatting renders with color.

## Header

  PRISM  {session}                                        {N} of 11
  ────────────────────────────────────────────────────────────────

Replace {session} with the session name. Replace {N} with completed phase count.
When all 11 phases are done, use "11 of 11 ✨" in the header.

## Phase Lines

For each phase, copy the exact line from the matching section below.
Columns: block indicator, check/diamond, title, description.

### Done

  █ ✓ Brief              define the problem and review background
  █ ✓ Orient             map inquiry areas for exploration
  █ ✓ Explore            research inquiry areas from multiple perspectives
  █ ✓ Rotate             cross-review findings between perspectives
  █ ✓ Synthesize         unify findings, surface contradictions
  █ ✓ Gate               decide: plan, explore more, or adjust
  █ ✓ Plan               master plan with domain-specific reviews
  █ ✓ Split              break plan into independent sub-plans
  █ ✓ Implement          implement sub-plans via bash script
  █ ✓ Review             human review, fix loop, drift report
  █ ✓ Close              session summary, commit, PR

### Current (next offered step)

  ▓ ◆ *`Brief`*              *define the problem and review background*
  ▓ ◆ *`Orient`*             *map inquiry areas for exploration*
  ▓ ◆ *`Explore`*            *research inquiry areas from multiple perspectives*
  ▓ ◆ *`Rotate`*             *cross-review findings between perspectives*
  ▓ ◆ *`Synthesize`*         *unify findings, surface contradictions*
  ▓ ◆ *`Gate`*               *decide: plan, explore more, or adjust*
  ▓ ◆ *`Plan`*               *master plan with domain-specific reviews*
  ▓ ◆ *`Split`*              *break plan into independent sub-plans*
  ▓ ◆ *`Implement`*          *implement sub-plans via bash script*
  ▓ ◆ *`Review`*             *human review, fix loop, drift report*
  ▓ ◆ *`Close`*              *session summary, commit, PR*

### Pending

  ░   Brief              define the problem and review background
  ░   Orient             map inquiry areas for exploration
  ░   Explore            research inquiry areas from multiple perspectives
  ░   Rotate             cross-review findings between perspectives
  ░   Synthesize         unify findings, surface contradictions
  ░   Gate               decide: plan, explore more, or adjust
  ░   Plan               master plan with domain-specific reviews
  ░   Split              break plan into independent sub-plans
  ░   Implement          implement sub-plans via bash script
  ░   Review             human review, fix loop, drift report
  ░   Close              session summary, commit, PR

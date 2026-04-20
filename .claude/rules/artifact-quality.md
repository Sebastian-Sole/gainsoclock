# Artifact Quality

When writing files to `.claude/agents/`, `.claude/skills/`, or `.claude/commands/`, apply the corresponding creator skill and prompt-engineering patterns. This applies whether creating one file or twenty as part of a larger system.

## Agents (`.claude/agents/*.md`)

Before finalizing any agent file, verify:

- [ ] `model:` in frontmatter (explicit, not inherited). Exception: review pipeline agents (`review-code`, `review-typescript`, `review-security`, `review-aggregator`, `review-validator`) intentionally omit `model:` so it's set by the review-cycle profile at runtime.
- [ ] `color:` in frontmatter
- [ ] `tools:` scoped to minimum needed
- [ ] `## Personality` section with quoted inner monologue
- [ ] `<example>` blocks in the `description:` frontmatter
- [ ] `## Output Format` section defining what the agent returns

## Skills (`.claude/skills/*/SKILL.md`)

Before finalizing any skill file, verify:

- [ ] `description:` starts with "Fires when..." (trigger mechanism)
- [ ] `## Gotchas` section documenting non-obvious behavior
- [ ] Under 2000 words (use `references/` for detailed content)
- [ ] Project-specific paths and tools (pnpm, biome, @/ aliases)

## Commands (`.claude/commands/*.md`)

Before finalizing any command file, verify:

- [ ] `description:` one-line summary
- [ ] `allowed-tools:` scoped to minimum needed
- [ ] `argument-hint:` if the command takes arguments
- [ ] `## Stop Here` with `<important>` tag if part of a multi-phase workflow

## Prompt Quality (all artifacts)

- Use `<important>` tags only for hard constraints, not emphasis
- Dial back aggressive language (CRITICAL/MUST/ALWAYS) -- Opus 4.6 overtriggers on these
- Add IS/IS NOT bounding when an artifact's scope could be ambiguous

---
name: create-skill
description: "Fires when creating, scaffolding, or writing any `.claude/skills/*/SKILL.md` file. Also fires when building systems that include skills, or when asked about skill structure and best practices."
---

# Create a Claude Code Skill

<important>Before finalizing any skill file, run the verification checklist below. Apply **prompt-engineering** skill patterns -- this is the shared foundation for all Claude Code artifacts.</important>

## Verification Checklist

- [ ] `description:` starts with "Fires when..." (trigger mechanism, not documentation)
- [ ] Include file path patterns in description for indirect creation triggers
- [ ] `## Gotchas` section exists (highest-signal content in any skill)
- [ ] Under 2000 words (use `references/` for detailed content)
- [ ] Project-specific paths and tools (pnpm, biome, @/ aliases)

## File Structure

```
.claude/skills/<name>/
  SKILL.md              # Main skill file (required)
  references/           # Detailed docs, lookup tables (optional)
```

## YAML Frontmatter

```yaml
---
name: skill-name
description: "Fires when... <trigger description>"
---
```

Write the description broadly enough to catch both direct requests ("create a skill") and indirect creation (building a system that includes skills).

See `@${CLAUDE_SKILL_DIR}/references/frontmatter-reference.md` for all available frontmatter fields.

## Content Guidelines

### Build a Gotchas Section

Document non-obvious behavior that has caused bugs, framework-specific quirks, and common mistakes Claude makes in this area.

### Progressive Disclosure

Keep `SKILL.md` under 2000 words. Put detailed reference tables, API docs, and examples in `references/`. Reference them with `@${CLAUDE_SKILL_DIR}/references/<file>`.

## Skill Categories

Pick the right pattern:

| Category | Example | Pattern |
|----------|---------|---------|
| Library/API reference | shadcn/ui | Lookup tables, code snippets, gotchas |
| Product verification | Pre-commit check | Phased checklist, pass/fail output |
| Code scaffolding | Component generator | File templates, naming conventions |
| Code quality | Linting rules | Rules, examples, auto-fix patterns |
| Runbooks | Incident response | Decision trees, escalation paths |

## Process

1. Ask for the skill's purpose and when it should fire
2. Pick a category to guide the pattern
3. Create `SKILL.md` with frontmatter and content
4. Add `references/` only if the skill needs detailed lookup data
5. Run the verification checklist

## Gotchas

- **The `description:` field is a trigger mechanism, not documentation.** Write it as "Fires when..." with file path patterns. Claude uses this to decide when to load the skill.
- **Gotchas are the highest-signal section.** Document non-obvious behavior, framework quirks, and common Claude mistakes. If you only write one section well, make it this one.
- **2000 word limit on SKILL.md is real.** Skill content is loaded into context every time it triggers. Move detailed reference tables to `references/` and link with `@${CLAUDE_SKILL_DIR}/references/<file>`.
- **Opus 4.6 overtriggers on aggressive language.** Soften MUST/ALWAYS/NEVER to defaults and conventions. The model follows instructions without being yelled at.

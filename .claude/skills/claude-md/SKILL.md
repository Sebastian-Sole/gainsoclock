---
name: claude-md
description: "Fires when creating, editing, or reviewing CLAUDE.md files. Also fires when asked about CLAUDE.md best practices, structure, or organization."
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Write
  - Bash
---

# CLAUDE.md Best Practices

Ensure all CLAUDE.md files follow proven best practices. Use when creating, editing, or auditing CLAUDE.md files.

## Usage

```
/claude-md                     # Audit all CLAUDE.md files in the project
/claude-md apps/web/CLAUDE.md  # Audit a specific file
/claude-md create apps/api     # Scaffold a new CLAUDE.md for a directory
```

## Process

### 1. Determine Scope

Parse `$ARGUMENTS`:
- If a file path: audit that specific CLAUDE.md
- If `create <dir>`: scaffold a new CLAUDE.md for that directory
- If empty: audit all CLAUDE.md files in the project

### 2. Audit Existing Files

For each CLAUDE.md file, check against ALL rules below. Report violations.

### 3. Output Report

```
CLAUDE.MD AUDIT
===============
File: <path>
Lines: X / 200 max

VIOLATIONS:
  [CRITICAL] <rule> -- <description>
  [WARNING]  <rule> -- <description>

SUGGESTIONS:
  - <improvement>

STRUCTURE:
  [pass/fail] Has project identity
  [pass/fail] Has tech stack
  [pass/fail] Has key commands
  [pass/fail] Has gotchas section
  [pass/fail] Under 200 lines
  [pass/fail] No linter-replaceable rules
  [pass/fail] Uses conditional blocks appropriately
  [pass/fail] References > copies
  [pass/fail] Instructions are specific and verifiable
```

## Rules

### Critical (MUST fix)

1. **Under 200 lines**. Over 200, LLMs start ignoring ALL instructions uniformly. Split with `@imports` or `.claude/rules/` files.
2. **No linter-replaceable rules**. Never send an LLM to do a linter's job. "Use 2-space indentation" belongs in Biome, not CLAUDE.md.
3. **No conflicting instructions**. Cross-check against other CLAUDE.md files and `.claude/rules/`. Contradictions cause arbitrary behavior.
4. **No obvious instructions**. Claude already knows how to code. Don't state "write clean code" or "handle errors properly."
5. **No stale code snippets**. Reference files with `file:line` instead of copy-pasting code that will become outdated.

### Important (SHOULD fix)

6. **Specific and verifiable**. Every instruction must be testable. Bad: "Format code properly." Good: "Run `pnpm lint` before committing."
7. **Use `<important if>` blocks** for domain-specific rules. Unwrapped domain rules get ignored during unrelated work.
8. **Include a Gotchas section**. Highest-signal content. Document non-obvious failures, framework quirks, and common mistakes.
9. **Progressive disclosure**. Keep CLAUDE.md as the index. Put detailed reference in `@imports`, `.claude/rules/`, or `docs/`.
10. **Reference external docs**. Use `@path/to/file.md` imports for detailed guides instead of duplicating content.

### Nice to Have

11. **WHY-WHAT-HOW structure**. Cover project identity (WHY), tech stack & structure (WHAT), and workflows & commands (HOW).
12. **Team-maintained**. CLAUDE.md should be checked into git and contributed to by the whole team.
13. **Iterate from failures**. When Claude makes a mistake, add the lesson to CLAUDE.md. Claude writes good rules for itself.

## File Organization Rules

### Monorepo Loading Behavior

- **Ancestor loading (UP)**: Claude walks upward from the working directory and loads every CLAUDE.md. Loaded at startup.
- **Descendant loading (DOWN)**: Subdirectory CLAUDE.md files are lazy-loaded only when Claude reads files in that directory.
- Root CLAUDE.md: project-wide identity, stack, commands.
- App-level CLAUDE.md: app-specific patterns, gotchas, testing.
- `.claude/rules/*.md`: topic-specific rules. Support `paths:` frontmatter for scoping.

### What Goes Where

| Content | Location | Why |
|---------|----------|-----|
| Project identity, stack | Root `CLAUDE.md` | Universal, every session |
| App-specific patterns | `apps/<app>/CLAUDE.md` | Lazy-loaded when relevant |
| Coding conventions | `.claude/rules/coding-conventions.md` | Keeps CLAUDE.md lean |
| Detailed reference | `docs/`, `references/` | Progressive disclosure |
| Personal preferences | `~/.claude/CLAUDE.md` | Never committed to git |

### Conditional Blocks

Use `<important if="condition">` to scope domain-specific rules:

```markdown
<important if="you are writing Playwright E2E tests">
Import from `e2e/a11y-test` for the WCAG 2.1 AA fixture.
</important>
```

**Guidelines:**
- Keep universal content unwrapped
- Use sparingly -- 2-4 blocks per file max
- Make conditions specific, not broad ("writing code" is too broad)
- Each block should contain 2-5 concrete instructions

## Anti-Patterns

| Anti-pattern | Why it's bad | Fix |
|-------------|-------------|-----|
| 500-line CLAUDE.md | Claude ignores everything after ~200 lines | Split into `@imports` and `.claude/rules/` |
| "Write clean code" | Obvious, unverifiable, wastes instruction budget | Remove entirely |
| Pasted code examples | Go stale, consume lines | Use `file:line` references |
| Style rules (indentation, quotes) | Linters are deterministic, LLMs aren't | Put in biome.json |
| No gotchas section | Missing the highest-value content | Add real failure lessons |
| All instructions unwrapped | Domain rules ignored during unrelated work | Use `<important if>` blocks |

## Scaffolding Template

When creating a new CLAUDE.md, start from this structure:

```markdown
# <App/Package Name>

<One sentence: what this is and its role in the system.>

## Key Commands

- `pnpm <cmd>` -- <what it does>

## Patterns

- <Pattern 1: specific, verifiable>
- <Pattern 2: specific, verifiable>

## Gotchas

- <Non-obvious thing 1>
- <Non-obvious thing 2>
```

Then add sections as needed. Resist the urge to be comprehensive upfront -- CLAUDE.md should grow from real failures, not speculation.

## Gotchas

- Claude's system prompt already uses ~50 of your ~200 instruction budget. Every line counts.
- The `<system-reminder>` wrapper tells Claude to ignore "irrelevant" content -- the more noise, the more gets ignored.
- `<important if>` blocks are NOT guaranteed to work perfectly -- they're a best-effort signal. Critical rules should still be top-level.
- `/memory` command shows which CLAUDE.md files are loaded. Use it to debug missing instructions.
- CLAUDE.md fully survives `/compact`. Conversational instructions do not.
- Auto memory (`MEMORY.md`) is for Claude's own learnings. CLAUDE.md is for human-authored instructions. Don't mix them.

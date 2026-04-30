---
name: agent-health
description: "Fires when asked to run an agent health check, audit instruction coherence, check for contradictions in skills/rules/commands, or validate agent instructions against the codebase."
user-invocable: true
model: opus
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Task
---

# Agent Health

Health check for the entire agent instruction system. Audits for contradictions between files, drift from the committed codebase, and prompt quality against best practices.

This skill produces a report. It does NOT modify files, create files, or apply fixes.

<important>This skill is strictly read-only. Never use Edit, Write, or any tool that modifies files. Output a report and stop.</important>

## Usage

```
/agent-health              # Full audit
/agent-health skills       # Skills only
/agent-health codebase     # Codebase drift only
/agent-health <path>       # Audit one file against all others
```

Parse `$ARGUMENTS` to determine scope. Empty = full audit.

## Goal

Scan all instruction files, find issues across three dimensions, and report them with recommended fixes. The user decides what to act on.

## What to Scan

Use Glob to discover instruction files:

- `CLAUDE.md`, `**/CLAUDE.md`, `**/AGENTS.md`
- `.claude/rules/*.md`
- `.claude/skills/*/SKILL.md`
- `.claude/commands/*.md`
- `.claude/agents/*.md`
- `.claude/hooks/*.sh`

Read every file found. Use `git show HEAD:<path>` (not the working tree) when comparing against codebase.

## What to Check

### 1. Contradictions (instructions vs instructions)

Find directives that conflict across files. Categories to compare:

| Category | Example conflict |
|----------|-----------------|
| Tech stack | File A says `npm`, File B says `pnpm` |
| Patterns | "Server Components by default" vs "always use client components" |
| File structure | "Tests in `__tests__/`" vs "Tests in `tests/`" |
| Tooling | "Run eslint" vs "Biome only, no ESLint" |
| Forbidden items | File A forbids X, File B uses or recommends X |

Types of contradictions:
- **Direct**: Opposite claims about the same thing
- **Scope conflict**: Two files claim authority over the same domain differently
- **Duplicated-but-diverged**: Same topic in multiple files with subtle differences
- **Implicit**: Individually correct but contradictory when combined

### 2. Codebase Drift (instructions vs committed code)

The committed codebase is source of truth. Check:

- **package.json alignment**: Do claimed dependencies/scripts actually exist?
- **Pattern claims**: Instructions say "use pattern X" -- does committed code use it?
- **File structure**: Do referenced paths exist in `git ls-tree -r --name-only HEAD`?
- **Config alignment**: Do biome.json, tsconfig.json, next.config.ts match claims?
- **Stale references**: Paths, commands, or files mentioned in instructions that don't exist

### 3. Prompt Quality (instructions vs prompt-engineering best practices)

Read the prompt-engineering skill at `.claude/skills/prompt-engineering/SKILL.md` -- that is the single source of truth for prompt quality rules.

Evaluate each skill, agent, and command against every rule defined there. Report violations in the `PROMPT QUALITY` section of the report.

## Output Format

```
AGENT HEALTH REPORT
====================
Scanned: X files | Found: Y issues

CONTRADICTIONS
--------------
[C-1] CRITICAL: <summary>
  File A: <path>:<line> -- "<directive>"
  File B: <path>:<line> -- "<directive>"
  Impact: <what goes wrong>

CODEBASE DRIFT
--------------
[D-1] CRITICAL: <summary>
  Instruction: <path>:<line> -- "<claim>"
  Reality: <what the committed code actually does>
  Evidence: <file:line or command output>

STALE REFERENCES
----------------
[S-1] <path>:<line> references "<missing thing>"

PROMPT QUALITY
--------------
[P-1] WARNING: <skill-name> -- <rule violated>
  Location: <path>:<line>
  Issue: <what's wrong>
  Fix: <what good looks like>

DUPLICATIONS
------------
[DUP-1] "<topic>" covered in:
  - <path A>:<lines>
  - <path B>:<lines>
  Divergence: <how they differ>

RECOMMENDED FIXES
=================
[C-1] <what should change and in which file>
[D-1] <update instruction or flag codebase issue>
[P-1] <specific rewrite suggestion>
...
```

## Judgment Calls

Not everything is a contradiction:
- **Different `allowed-tools` per skill** is intentional, not a conflict
- **Scope differences** are valid -- React in web app + Express in API is fine
- **ECC-origin skills referencing `npm`** are drift from our `pnpm` convention, but flag as WARNING since ECC skills may be overwritten on update
- **Hooks contain executable code** -- report issues but never suggest modifying them without context
- **Review pipeline agents** (`review-code`, `review-typescript`, `review-security`, `review-aggregator`, `review-validator`) intentionally omit `model:` from frontmatter -- the model is set by the review-cycle profile at runtime. Do not flag missing `model:` on these agents.

## Gotchas

- Use `git show HEAD:<path>` for codebase truth. Working tree may contain uncommitted experiments that aren't yet the source of truth.
- Memory files are private user data. Report issues in them but recommend the user fix manually.
- The prompt-engineering rules are guidelines, not laws. Flag violations as WARNING, not CRITICAL, unless they cause actual behavior problems.

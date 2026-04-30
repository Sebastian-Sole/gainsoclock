# Harness Onboarding

A reusable Claude Code harness extracted from KS Digital. Ships the **Prism methodology**, **code review pipeline**, **testing framework**, and **meta-scaffolding** as portable artifacts. Project-specific pieces (coding conventions, domain personas, review agents) are left empty — this doc walks you through filling them in with ready-to-use prompts.

---

## 1. What's in the box

```
.claude/
├── agents/           # prism-*, review-aggregator, review-validator, review-security
├── commands/         # prism-*, verify, workflow, wf-*, pr, plan-feature
├── hooks/            # artifact-quality.sh, claude-md-audit.sh, a11y-check.sh
├── prompts/          # review-aggregator, review-coordinator templates
├── review-profiles/  # quick.json, standard.json, thorough.json, mixed.json
├── rules/            # artifact-quality.md
├── scripts/          # run-review.js + lib/cost-tracker.js
├── skills/           # prism-methodology, tdd-workflow, e2e-testing, create-*, etc.
├── workflows/        # bug-fix, quick-ship, full-feature, accessibility
├── hooks.json
├── review-agents.json
└── settings.json
```

## 2. Integrate into a project

```bash
cp -R /path/to/harness/.claude /path/to/your-project/
cd /path/to/your-project
```

Then work through sections 3 → 5 below.

---

## 3. Configuration files to review

### `.claude/settings.json`
Runs three PostToolUse hooks. Keep as-is unless you skip those hooks. Toggles `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

### `.claude/hooks.json`
References `.claude/hooks/*.sh`. **Edit** if your project doesn't use Biome or TypeScript. Most teams want to keep:
- `typecheck.sh` (update command for your typechecker — `tsc`, `pyright`, `go vet`)
- `format.sh` (swap Biome for your formatter)
- `a11y-check.sh` (keep if you ship UI)
- `claude-md-audit.sh`, `artifact-quality.sh` (keep as-is)

> Note: `hooks/typecheck.sh`, `hooks/format.sh`, `hooks/console-log-warn.sh`, `hooks/console-log-audit.sh` are **not** shipped in this harness — they were KS-Biome-specific. Either recreate for your stack or delete the references from `hooks.json`.

### `.claude/review-agents.json`
Lists which reviewer agents the review loop spawns. After creating `review-code.md` and a language-specific reviewer (section 4), confirm the names match.

### `.claude/scripts/lib/cost-tracker.js`
Hardcoded pricing table for Claude/Codex/Gemini models. **Update** when model prices drift.

### `.claude/hooks/a11y-check.sh`
Contains `apps/web/node_modules/.bin/biome` path assumption. **Edit** to match your repo layout, or delete the hook if you don't use Biome.

---

## 4. Project-specific files to create

Each section below is: (a) the file to create, (b) a prompt to paste into Claude Code to have it generated. Run the prompts in your target project so Claude has the repo context.

### 4.1 `CLAUDE.md` (project root)

Short (<200 lines) project brief. Stack, constraints, critical deadlines, directory map, language/domain rules.

**Prompt:**
```
Create a CLAUDE.md at the project root following the claude-md skill. Keep it under 200 lines.

Include:
1. One-paragraph project description and primary users
2. Stack table (monorepo tool, framework, UI lib, state, validation, linter, test runners, language)
3. "Critical Constraints" section — deadlines, compliance requirements (WCAG level, data residency, etc.), language/locale rules
4. "Knowledge" pointers — where synthesis docs live, where AGENTS.md files live, where framework docs live
5. A Personality block — 2–3 sentences in the voice we want Claude to hold
6. "Important" — anything non-negotiable like "Always run /verify before committing"

Infer stack and structure by reading package.json, tsconfig.json, and top-level directories. Ask me if any critical constraint (deadline, compliance regime, primary language) is not obvious from the repo.
```

### 4.2 `.claude/rules/coding-conventions.md`

Hard rules that CLAUDE.md references.

**Prompt:**
```
Create .claude/rules/coding-conventions.md. Read CLAUDE.md first for the stack. Cover:

- Linting/formatting (which tool, how to invoke, what NOT to install)
- Language rules (strict mode, forbidden constructs, path aliases)
- Framework rules (component model defaults, data-fetching patterns, mutation patterns)
- Styling rules (utility framework, tokens, component variant library)
- Accessibility targets and testable rules (semantic HTML, ARIA boundaries, contrast)
- File organization (where components/utilities/tests live)

Be concrete and enforceable. No aspirational wording. Format as short bulleted sections.
```

### 4.3 `.claude/agents/review-code.md`

General code reviewer for the review pipeline. Tuned to your stack.

**Prompt:**
```
Create .claude/agents/review-code.md following the create-agent skill and the artifact-quality rule.

This is a code review pipeline agent — omit `model:` in frontmatter (the review profile sets it at runtime). Include color, tools (Read, Grep, Glob, Bash), description with <example> blocks, Personality block, Output Format.

Scope: senior-level review covering security, quality, framework patterns for <FRAMEWORK>, performance, maintainability. Reference the exact commands in our package.json for type-checking and linting. Reference our coding-conventions rule. It should return structured findings (severity, file:line, explanation, suggestion) that review-aggregator can merge.

Read CLAUDE.md, package.json, and .claude/rules/coding-conventions.md first.
```

### 4.4 Language-specific reviewer — e.g. `.claude/agents/review-typescript.md`

Typing/async correctness reviewer. Rename for your language (`review-python.md`, `review-go.md`, etc.).

**Prompt:**
```
Create .claude/agents/review-<LANG>.md, a language-specific code reviewer for the review pipeline. Follow create-agent and artifact-quality.

Omit `model:` (set by review profile). Scope: type safety, async correctness, idiomatic patterns, and stack-specific pitfalls for <LANG>. Invoke our typecheck and lint commands by name (read package.json / pyproject.toml). Call out unsafe casts, loose types, missing narrowing, leaked promises, and concurrency bugs.

Read CLAUDE.md and coding-conventions before drafting. Output structured findings (severity, file:line, explanation, suggestion).

After creating, update .claude/review-agents.json so this agent is in the reviewer registry.
```

### 4.5 `.claude/agents/doc-updater.md` (optional)

Only needed if you want a `/update-docs` command.

**Prompt:**
```
Create .claude/agents/doc-updater.md. It should sync CLAUDE.md files, AGENTS.md, .claude/rules/*, and any developer guides with actual codebase state. It flags drift: stale paths, missing commands, outdated version pins, duplicate content across docs.

Map our actual directory structure (read the repo first). Then list the docs it owns, the signals it checks (line counts, broken paths, version mismatches), and its output format (list of proposed edits with rationale).

Follow create-agent + artifact-quality. Model: haiku is fine.

After creating, also create .claude/commands/update-docs.md that invokes this agent.
```

### 4.6 Prism domain personas — `.claude/skills/prism-methodology/references/personas/`

Ships with generic personas (a11y, security, performance, ux-evaluation, search-systems). Add domain-specific reviewers for your business.

**Prompt (run once per persona you need):**
```
Create .claude/skills/prism-methodology/references/personas/<NAME>.md. A persona is one short paragraph (3–6 sentences) that gives the prism-reviewer or prism-explorer a specific lens. It names the concerns, tradeoffs, and failure modes of that domain.

The domain is: <describe — e.g., "healthcare privacy (HIPAA)", "payments/PCI", "multi-tenant SaaS", "real-time collaboration">. Read CLAUDE.md for project context so the persona knows what we're building.

Keep it to one page max. No checklists. Write from inside the perspective — what this reviewer notices, worries about, and pushes back on.
```

Typical domain personas to consider: your compliance regime, your industry domain expert, your primary integration partner, your most critical non-functional concern.

### 4.7 E2E user test contexts — `.claude/skills/e2e-testing/references/`

Ships with `testing-modes.md` only. Add test contexts and personas for your product.

**Prompt — personas:**
```
Create .claude/skills/e2e-testing/references/personas/<persona-name>.md for each primary user type of our product. Read CLAUDE.md.

Each persona file: one paragraph on who they are, their goal, their prior knowledge of the product, what devices/assistive tech they use, and the emotional state they arrive in. This drives how our agentic E2E tests interpret success.

Examples of persona slots to fill: first-time visitor, returning power user, admin, mobile-only user, screen-reader user.
```

**Prompt — test contexts:**
```
Create .claude/skills/e2e-testing/references/user-test-contexts/<ID>.md, one per user-test scenario.

Each file contains: task ID, persona reference, starting URL, task description (what the user is trying to accomplish), success criteria (observable outcomes), and any known traps. These are scenario specs that Playwright tests and agentic tests both consume.

List the scenarios we need by reading our requirements docs or asking me. Number them with a prefix (e.g., C-1 for customer tasks, A-1 for admin). Also write a README.md in the same folder indexing all of them.
```

---

## 5. Files shipped that may need light editing

| File | What to check |
|------|--------------|
| `.claude/commands/verify.md` | Commands assume `pnpm`. Swap for your package manager. |
| `.claude/commands/plan-feature.md` | Has a KS-Bibliofil example — replace with a feature from your domain. |
| `.claude/commands/wf-full-feature.md` | References the `thorough` review profile; keep unless you customized profiles. |
| `.claude/workflows/full-feature.json` | Same — confirm step names match your commands. |
| `.claude/scripts/run-review.js` | Points at `review-typescript.md`, `review-security.md`, `review-code.md`. Rename if you called your reviewers differently. |
| `.claude/review-profiles/*.json` | Model names (Opus/Codex/Gemini). Confirm providers are enabled for your account. |
| `.claude/agents/prism-implementer.md` | Mentions Next.js / shadcn / Zustand conventions. Rewrite the "follows project conventions" block for your stack, or delete it and let it read `coding-conventions.md` at runtime. |
| `.claude/agents/review-security.md` | Uses `pnpm audit`. Swap for `npm audit` / `yarn audit` / language equivalent. |
| `.claude/skills/tdd-workflow/SKILL.md` | Has a Norwegian "ingen treff" example. Replace with one from your domain. |
| `.claude/skills/e2e-testing/SKILL.md` | Has Norwegian selector examples. Replace after you define personas/contexts in 4.7. |
| `.claude/skills/claude-md/SKILL.md` | Example paths are KS monorepo. Update to your layout. |
| `.claude/skills/coding-standards/`, `next-best-practices/`, `shadcn/`, `a11y-*`, `frontend-*`, `design-system/`, `screen-reader-test/` | Keep only the ones whose stack matches yours; delete the rest. |
| `.claude/hooks/a11y-check.sh` | Hardcoded `apps/web/node_modules/.bin/biome` path. |

---

## 6. Verify integration

Run these in order in your target project:

1. `/prism` — confirms the Prism system loads and shows session state.
2. `/verify` — confirms the verification command runs your build/type/lint/test chain end-to-end.
3. Kick off a code review: `node .claude/scripts/run-review.js --profile quick HEAD~1` — confirms reviewer agents spawn, aggregate, and validate.
4. Edit a `.md` file in `.claude/agents/` and confirm the `artifact-quality.sh` hook fires.

If all four pass, the harness is integrated.

---

## 7. Order of operations (suggested)

1. Copy `.claude/` in.
2. Create `CLAUDE.md` (4.1).
3. Create `coding-conventions.md` (4.2).
4. Edit `hooks.json` + hook scripts for your stack (section 3).
5. Create the review agents (4.3, 4.4) and update `review-agents.json`.
6. Edit the "light editing" files from section 5 as you hit them.
7. Add domain personas (4.6) and E2E contexts (4.7) the first time you run `/prism-explore` or write an E2E test.
8. Run the section-6 verification.

Skip anything you don't use. The Prism system and meta-scaffolding (`create-*`, `prompt-engineering`, `agent-health`) work with zero setup; the review loop and testing framework need sections 4.3–4.4 and 4.7 respectively before they're useful.

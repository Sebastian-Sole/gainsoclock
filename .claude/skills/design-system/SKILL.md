---
name: design-system
description: "Fires when asked to generate, audit, or review a design system. Also fires when asked about design tokens, visual consistency, or AI slop detection."
user-invocable: true
---

# Design System — Generate & Audit Visual Systems

## When to Use

- Starting a new project that needs a design system
- Auditing an existing codebase for visual consistency
- Before a redesign — understand what you have
- When the UI looks "off" but you can't pinpoint why
- Reviewing PRs that touch styling

## How It Works

### Mode 1: Generate Design System

Analyzes your codebase and generates a cohesive design system:

```
1. Scan CSS/Tailwind/styled-components for existing patterns
2. Extract: colors, typography, spacing, border-radius, shadows, breakpoints
3. Research 3 competitor sites for inspiration (via browser MCP)
4. Propose a design token set (JSON + CSS custom properties)
5. Generate DESIGN.md with rationale for each decision
6. Create an interactive HTML preview page (self-contained, no deps)
```

Output: `DESIGN.md` + `design-tokens.json` + `design-preview.html`

### Mode 2: Visual Audit

Scores your UI across 10 dimensions (0-10 each):

```
1. Color consistency — are you using your palette or random hex values?
2. Typography hierarchy — clear h1 > h2 > h3 > body > caption?
3. Spacing rhythm — consistent scale (4px/8px/16px) or arbitrary?
4. Component consistency — do similar elements look similar?
5. Responsive behavior — fluid or broken at breakpoints?
6. Dark mode — complete or half-done?
7. Animation — purposeful or gratuitous?
8. Accessibility — contrast ratios, focus states, touch targets
9. Information density — cluttered or clean?
10. Polish — hover states, transitions, loading states, empty states
```

Each dimension gets a score, specific examples, and a fix with exact file:line.

### Mode 3: AI Slop Detection

Identifies generic AI-generated design patterns:

```
- Gratuitous gradients on everything
- Purple-to-blue defaults
- "Glass morphism" cards with no purpose
- Rounded corners on things that shouldn't be rounded
- Excessive animations on scroll
- Generic hero with centered text over stock gradient
- Sans-serif font stack with no personality
```

## Examples

**Generate for a SaaS app:**

```
/design-system generate --style minimal --palette earth-tones
```

**Audit existing UI:**

```
/design-system audit --url http://localhost:3000 --pages / /pricing /docs
```

**Check for AI slop:**

```
/design-system slop-check
```

## This Skill IS / IS NOT

- **IS**: Generating design token sets, auditing visual consistency, detecting AI-generated design patterns
- **IS NOT**: shadcn/ui component usage — see `shadcn` skill for adding/composing components
- **IS NOT**: Accessibility auditing — see `a11y-check` for WCAG compliance scanning

## Gotchas

- **This project already has a design system** via shadcn/ui v4 + Tailwind CSS v4 design tokens in `app/globals.css`. Use "audit" mode to check consistency against existing tokens rather than generating a new system from scratch.
- **Bergen brand colors are hardcoded.** `#003B6E` appears in multiple files. Per-library theming is Phase 2 — don't try to make it dynamic yet.
- **Semantic color tokens are in `globals.css` via `@theme`.** Check there before proposing new tokens.
- **Browser MCP is needed for competitor research.** Mode 1 (Generate) uses `agent-browser` to scan competitor sites — ensure it's installed.

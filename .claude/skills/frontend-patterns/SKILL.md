---
name: frontend-patterns
description: "Fires when building React components, managing state, implementing data fetching, optimizing performance, or working with forms and client-side routing."
origin: ECC
---

# Frontend Development Patterns

Modern frontend patterns for React, Next.js, and performant user interfaces.

## When to Activate

- Building React components (composition, props, rendering)
- Managing state (useState, Zustand, Context)
- Implementing data fetching (SWR, React Query, server components)
- Optimizing performance (memoization, virtualization, code splitting)
- Working with forms (validation, controlled inputs, Zod schemas)
- Handling client-side routing and navigation
- Building accessible, responsive UI patterns

## Pattern Index

### Component Patterns & Custom Hooks
> Reference: `references/component-patterns.md`

Composition over inheritance, compound components (Context-based), and render props for flexible UI assembly. Includes reusable hooks for state toggling, async data fetching with callbacks, and input debouncing.

### State Management & Performance
> Reference: `references/state-and-performance.md`

Zustand store patterns with selective subscriptions to avoid re-renders. Performance techniques including React.memo, useMemo/useCallback, lazy loading with Suspense, list virtualization via @tanstack/react-virtual, and CSS `content-visibility` as a zero-JS virtualization alternative.

### Forms & Error Handling
> Reference: `references/forms-and-errors.md`

Controlled form pattern with field-level validation and error display. Class-based ErrorBoundary with getDerivedStateFromError and retry capability.

### React Server Components & React 19
> Reference: `references/rsc-and-react19.md`

RSC patterns: parallel data fetching via composition, Suspense streaming with async children, promise sharing with `use()`, minimizing serialization at RSC/client boundaries, eager promise starts, per-request deduplication with `React.cache()`, and post-response work with `after()`. React 19 patterns: `useTransition` for async loading states and `<Activity>` for state-preserving show/hide.

### Animation & Accessibility
> Reference: `references/animation-and-a11y.md`

Motion (from `motion/react`) patterns for list enter/exit animations and modal transitions with AnimatePresence. Accessibility patterns for keyboard navigation (arrow keys, Enter, Escape) with ARIA roles, and focus management for modals with save/restore of previous focus.

## This Skill IS / IS NOT

- **IS**: General React and frontend patterns (composition, state, performance, forms, animation, a11y)
- **IS NOT**: Next.js-specific patterns — see `next-best-practices` for file conventions, RSC, data patterns
- **IS NOT**: Project coding standards — see `coding-standards` for naming, error handling, TypeScript patterns
- **IS NOT**: shadcn/ui component usage — see `shadcn` skill for component-specific patterns

## Gotchas

- **ECC-origin skill.** Some patterns reference `npm` or libraries not used in this project (e.g., `motion/react`, `@tanstack/react-virtual`). Adapt to project conventions (`pnpm`, installed libraries).
- **React Compiler handles memoization.** Don't apply `React.memo`/`useMemo`/`useCallback` patterns from `references/state-and-performance.md` unless you've measured a specific problem.
- **`useContext` is replaced by `use()` in React 19.** The `use(ThemeContext)` pattern in `coding-standards` is the current approach.
- **Reference files contain the detailed patterns.** The main skill file is an index — always read the relevant reference file before applying patterns.

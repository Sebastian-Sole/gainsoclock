---
name: tdd-workflow
description: "Fires when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests."
---

# Test-Driven Development Workflow

All code development follows TDD principles. Tests come first, implementation follows.

## When to Activate

- Writing new features or components
- Fixing bugs (write the failing test first)
- Refactoring existing code
- Adding API routes or Server Actions

## Core Principles

### Tests BEFORE Code

Always write the failing test first, then implement the minimum code to make it pass.

### Coverage Philosophy (Hybrid)

- **New features/components**: Target 80% coverage. Write comprehensive unit + E2E tests.
- **Bug fixes**: Regression-first. Write a test that reproduces the bug before fixing it. See `ai-regression-testing` skill for patterns.
- No arbitrary coverage gates that block PRs — use coverage as a signal, not a wall.

### Selector Strategy (All Test Types)

Prefer user-facing selectors in both unit and E2E tests. This is the Playwright and Testing Library official recommendation, and it enforces accessibility by design.

**Priority order:**
1. `getByRole` / `page.getByRole()` — primary choice for almost everything
2. `getByLabel` / `page.getByLabel()` — form controls
3. `getByText` / `page.getByText()` — non-interactive content
4. `getByTestId` / `page.getByTestId()` — last resort, for dynamic content with no accessible role

If you can't find an element by role, the UI may have an accessibility problem.

## TDD Workflow Steps

### Step 1: Define the Behavior

```
As a library patron, I want to search for books by title,
so that I can find and reserve the book I'm looking for.
```

### Step 2: Write Failing Tests

```typescript
import { expect, test, describe } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResults } from "@/components/search-results";

describe("SearchResults", () => {
  test("displays matching books for a search query", () => {
    const books = [
      { id: "1", title: "Dei sju dorene", author: "Agnes Ravatn" },
    ];
    render(<SearchResults books={books} query="Dei sju" />);

    expect(screen.getByRole("heading", { name: /dei sju dorene/i })).toBeInTheDocument();
    expect(screen.getByText("Agnes Ravatn")).toBeInTheDocument();
  });

  test("shows empty state when no books match", () => {
    render(<SearchResults books={[]} query="nonexistent" />);

    expect(screen.getByText(/ingen treff/i)).toBeInTheDocument();
  });

  test("shows result count for screen readers", () => {
    const books = [
      { id: "1", title: "Dei sju dorene", author: "Agnes Ravatn" },
    ];
    render(<SearchResults books={books} query="Dei sju" />);

    expect(screen.getByRole("status")).toHaveTextContent(/1 resultat/i);
  });
});
```

### Step 3: Run Tests (They Should Fail)

Run the project's unit test command (see CLAUDE.md Quick Reference). All tests should fail — this confirms they're testing real behavior.

### Step 4: Implement Minimal Code

Write the minimum code to make each test pass. Resist adding features not covered by tests.

### Step 5: Run Tests Again (Green)

All tests should pass. If any fail, fix the implementation — not the test.

### Step 6: Refactor

Improve code quality while keeping tests green:
- Extract shared logic
- Improve naming
- Simplify conditionals

### Step 7: Verify Coverage

Run the project's coverage command. Check that new code is covered. Add tests for any significant gaps.

## Test Types & When to Use Each

### Unit Tests (Vitest + Testing Library)

For individual functions, utilities, and component rendering logic.

```typescript
import { expect, test, describe, vi } from "vitest";

describe("formatLoanDate", () => {
  test("formats Norwegian date correctly", () => {
    const result = formatLoanDate(new Date("2026-05-15"));
    expect(result).toBe("15. mai 2026");
  });

  test("shows 'i dag' for today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15"));

    expect(formatLoanDate(new Date("2026-05-15"))).toBe("i dag");

    vi.useRealTimers();
  });
});
```

**Component tests** — query by role/label:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("reserve button calls onReserve with book id", async () => {
  const onReserve = vi.fn();
  render(<BookCard book={testBook} onReserve={onReserve} />);

  await userEvent.click(screen.getByRole("button", { name: /reserver/i }));

  expect(onReserve).toHaveBeenCalledWith(testBook.id);
});
```

### E2E Tests (Playwright)

For critical user flows. Every E2E test MUST include an axe-core accessibility scan (see `apps/web/CLAUDE.md` for the a11y fixture pattern).

```typescript
import { test, expect } from "./a11y-test";

test.describe("Book search flow", () => {
  test("patron can search and find a book", async ({ page }) => {
    await page.goto("/sok");

    await page.getByRole("searchbox", { name: /sok/i }).fill("Dei sju dorene");
    await page.getByRole("button", { name: /sok/i }).click();

    await expect(
      page.getByRole("heading", { name: /dei sju dorene/i })
    ).toBeVisible();
    await expect(page.getByText("Agnes Ravatn")).toBeVisible();
  });

  test("search page has no a11y violations", async ({ page, makeAxeBuilder }) => {
    await page.goto("/sok");
    const results = await makeAxeBuilder().analyze();
    expect(results.violations).toEqual([]);
  });
});
```

### API Route Tests

For testing Next.js route handlers directly without a running server. See `__tests__/helpers.ts` for the `createTestRequest` utility.

```typescript
import { expect, test, describe } from "vitest";
import { createTestRequest, parseResponse } from "../helpers";
import { GET } from "@/app/api/books/route";

describe("GET /api/books", () => {
  test("returns books matching search query", async () => {
    const req = createTestRequest("/api/books?q=ravatn");
    const res = await GET(req);
    const { status, json } = await parseResponse(res);

    expect(status).toBe(200);
    expect(json.data.length).toBeGreaterThan(0);
  });

  test("returns 400 for missing query parameter", async () => {
    const req = createTestRequest("/api/books");
    const res = await GET(req);

    expect(res.status).toBe(400);
  });
});
```

## Mocking in Vitest

```typescript
import { vi } from "vitest";

// Mock a module
vi.mock("@/lib/bibliofil-client", () => ({
  searchBooks: vi.fn(() =>
    Promise.resolve([
      { id: "1", title: "Dei sju dorene", author: "Agnes Ravatn" },
    ])
  ),
}));

// Spy on a function
const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
  new Response(JSON.stringify({ data: [] }))
);

// Reset between tests
afterEach(() => {
  vi.restoreAllMocks();
});
```

## Common Mistakes to Avoid

### Testing implementation details
```typescript
// Bad — tests internal state
expect(component.state.isLoading).toBe(false);

// Good — tests what users see
expect(screen.getByRole("heading", { name: /sok/i })).toBeInTheDocument();
```

### Brittle selectors
```typescript
// Bad — breaks on any DOM change
await page.locator(".css-1a2b3c").click();
await page.locator('[data-testid="btn"]').click();

// Good — semantic, accessible
await page.getByRole("button", { name: /reserver/i }).click();
```

### Arbitrary waits in E2E
```typescript
// Bad — slow and flaky
await page.waitForTimeout(2000);

// Good — wait for specific condition
await page.waitForResponse(resp => resp.url().includes("/api/search"));
await expect(page.getByRole("list")).toBeVisible();
```

### Tests depending on each other
```typescript
// Bad — shared state between tests
test("creates reservation", () => { /* ... */ });
test("cancels the reservation", () => { /* depends on previous */ });

// Good — each test is independent
test("cancels a reservation", () => {
  const reservation = createTestReservation();
  // cancel logic
});
```

## This Skill IS / IS NOT

- **IS**: The test-driven development workflow (Red-Green-Refactor) for new features, bug fixes, and refactoring
- **IS NOT**: E2E test patterns (Page Object Model, flakiness) — see `e2e-testing` skill
- **IS NOT**: AI-specific regression patterns — see `ai-regression-testing` skill

## Gotchas

- **Write the failing test first.** If the test passes before implementation, it's not testing real behavior.
- **Don't fix the test to match the implementation.** If a test fails after implementation, the implementation is wrong — fix the code, not the test.
- **Coverage is a signal, not a wall.** Target 80% on new code but don't block PRs on arbitrary thresholds.
- **Query by role/label, not test IDs.** `screen.getByRole("button", { name: /reserver/i })` over `screen.getByTestId("reserve-btn")`. This enforces accessibility by design.
- **Mock at boundaries, not internals.** Mock API calls and external services. Don't mock internal functions — that tests implementation details.

## Cross-References

- **E2E patterns**: See `e2e-testing` skill for Page Object Model, flaky test strategies, artifact management
- **Regression patterns**: See `ai-regression-testing` skill for AI-specific blind spots and regression-first testing
- **A11y testing**: See `keyboard-test` and `screen-reader-test` skills for manual verification checklists
- **Commands and paths**: See CLAUDE.md Quick Reference for exact test commands
- **Test file structure**: See CLAUDE.md and `coding-conventions` rule for directory conventions

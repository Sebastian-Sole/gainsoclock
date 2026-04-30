---
name: coding-standards
description: "Fires when writing, reviewing, or refactoring TypeScript, JavaScript, React, or Node.js code. Provides universal coding standards and best practices."
---

# Coding Standards & Best Practices

Universal coding standards. For project-specific conventions (linting, file organization, path aliases), see CLAUDE.md and `coding-conventions` rule.

## When to Activate

- Writing new code
- Reviewing code for quality and maintainability
- Refactoring existing code
- Enforcing naming, formatting, or structural consistency

## Code Quality Principles

### 1. Readability First
- Code is read more than written
- Clear variable and function names
- Self-documenting code preferred over comments

### 2. KISS (Keep It Simple)
- Simplest solution that works
- Avoid over-engineering
- No premature optimization

### 3. DRY (Don't Repeat Yourself)
- Extract common logic into functions
- Create reusable components
- Share utilities across modules

### 4. YAGNI (You Aren't Gonna Need It)
- Don't build features before they're needed
- Start simple, refactor when needed

## TypeScript Standards

### Variable Naming

```typescript
// Good — descriptive names
const searchQuery = "Dei sju dorene";
const isAuthenticated = true;
const totalLoans = 5;

// Bad — unclear names
const q = "Dei sju dorene";
const flag = true;
const x = 5;
```

### Function Naming

```typescript
// Good — verb-noun pattern
async function fetchBookDetails(bookId: string) {}
function formatLoanDate(date: Date): string {}
function isValidEmail(email: string): boolean {}

// Bad — unclear or noun-only
async function book(id: string) {}
function date(d: Date) {}
```

### Immutability

```typescript
// Always use spread for objects
const updatedLoan = { ...loan, returnDate: new Date() };

// Prefer ES2023 immutable array methods
const sorted = books.toSorted((a, b) => a.title.localeCompare(b.title));
const reversed = results.toReversed();
const withReplacement = items.with(2, newItem);

// Never mutate directly
books.sort();        // Bad — mutates in place
books.push(newBook); // Bad — mutates
```

### Error Handling

```typescript
// Good — comprehensive
async function fetchBooks(query: string) {
  try {
    const response = await fetch(`/api/books?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Book search failed:", error);
    throw new Error("Kunne ikke hente boker");
  }
}
```

### Async/Await

```typescript
// Good — parallel when independent
const [books, events, branches] = await Promise.all([
  fetchBooks(query),
  fetchEvents(),
  fetchBranches(),
]);

// Bad — sequential when unnecessary
const books = await fetchBooks(query);
const events = await fetchEvents();
const branches = await fetchBranches();
```

### Type Safety

See `coding-conventions` rule for strict mode, `any` ban, enum ban, and interface/type preferences.

```typescript
// Good — proper types with unions
interface Book {
  id: string;
  title: string;
  author: string;
  status: "available" | "loaned" | "reserved";
  branch: string;
}

// Bad — using 'any'
function getBook(id: any): Promise<any> {}
```

## React Patterns

### Component Structure

```typescript
interface BookCardProps {
  book: Book;
  onReserve: (bookId: string) => void;
  disabled?: boolean;
}

export function BookCard({ book, onReserve, disabled = false }: BookCardProps) {
  return (
    <article>
      <h3>{book.title}</h3>
      <p>{book.author}</p>
      <button
        onClick={() => onReserve(book.id)}
        disabled={disabled}
      >
        Reserver
      </button>
    </article>
  );
}
```

### ref as Regular Prop (React 19)

```tsx
// React 19 — ref is a regular prop, no forwardRef needed
function SearchInput({ ref, ...props }: Props & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

### use() Replaces useContext()

```tsx
// React 19 — can also be called conditionally
const theme = use(ThemeContext);
```

### React Compiler Note

React 19 with React Compiler handles memoization automatically. Do not manually add `useMemo`, `useCallback`, or `React.memo` unless you have measured a specific performance problem. The compiler optimizes this for you.

### Server Action Authentication

Server Actions are public HTTP endpoints. Always verify auth **inside** each action.

```typescript
"use server";

export async function cancelReservation(reservationId: string) {
  const session = await verifySession();
  if (!session) throw new Error("Ikke innlogget");
  if (session.user.id !== reservation.userId) {
    throw new Error("Ingen tilgang");
  }
  await db.reservation.delete({ where: { id: reservationId } });
}
```

## Conditional Rendering

```typescript
// Good — clear conditions
{isLoading && <Spinner />}
{error && <ErrorMessage error={error} />}
{books && <BookList books={books} />}

// Bad — ternary hell
{isLoading ? <Spinner /> : error ? <ErrorMessage error={error} /> : books ? <BookList books={books} /> : null}
```

## API Design Standards

### Response Format

```typescript
// Consistent response structure
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}
```

### Input Validation

Use Zod for schema validation. Note: Zod 4 uses `z.interface({})` — see CLAUDE.md for details.

```typescript
import { z } from "zod";

const SearchParamsSchema = z.interface({
  q: z.string().min(1).max(200),
  branch: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

## Comments

```typescript
// Good — explain WHY, not WHAT
// Norwegian libraries use MARC21 format — field 245$a is the title
const title = record.getField("245", "a");

// Bad — stating the obvious
// Get the title
const title = record.getField("245", "a");
```

## Code Smells to Watch For

### Long Functions
Split functions longer than ~50 lines into smaller, focused functions.

### Deep Nesting
```typescript
// Bad — 5+ levels
if (user) { if (user.isStaff) { if (branch) { ... } } }

// Good — early returns
if (!user) return;
if (!user.isStaff) return;
if (!branch) return;
// proceed
```

### Magic Numbers
```typescript
// Bad
if (retryCount > 3) {}
setTimeout(callback, 500);

// Good
const MAX_RETRIES = 3;
const DEBOUNCE_MS = 500;
if (retryCount > MAX_RETRIES) {}
setTimeout(callback, DEBOUNCE_MS);
```

## Testing Standards

See `tdd-workflow` skill for the full TDD process and `coding-conventions` rule for test file organization.

### AAA Pattern (Arrange-Act-Assert)

```typescript
test("formats Norwegian loan date correctly", () => {
  // Arrange
  const date = new Date("2026-05-15");

  // Act
  const formatted = formatLoanDate(date);

  // Assert
  expect(formatted).toBe("15. mai 2026");
});
```

### Test Naming

```typescript
// Good — describes behavior
test("returns empty array when no books match query", () => {});
test("shows error message when reservation fails", () => {});

// Bad — vague
test("works", () => {});
test("test search", () => {});
```

## This Skill IS / IS NOT

- **IS**: Universal coding standards (naming, patterns, error handling, testing structure) that apply regardless of project setup
- **IS NOT**: Project-specific conventions (linting tool, file organization, path aliases) — those are in the `coding-conventions` rule
- **IS NOT**: Framework-specific patterns — see `next-best-practices` for Next.js, `frontend-patterns` for React

## Gotchas

- **React Compiler handles memoization.** Do not flag missing `useMemo`/`useCallback`/`React.memo` in this project — the compiler optimizes automatically.
- **Zod 4 uses `z.interface({})`.** Not `z.object({})`. This is a common mistake from training data.
- **Server Actions are public HTTP endpoints.** Always verify auth inside each action — don't rely on middleware alone.
- **ES2023 immutable array methods** (`toSorted`, `toReversed`, `with`) are preferred over mutating equivalents in this project's target.

## Cross-References

- **Project conventions**: See `coding-conventions` rule for linting, file organization, TypeScript strictness
- **Component patterns**: See `apps/web/CLAUDE.md` for shadcn/ui, Tailwind, Zustand, Zod specifics
- **Testing**: See `tdd-workflow` skill for the full workflow
- **Accessibility**: See `coding-conventions` rule for WCAG 2.1 AA requirements

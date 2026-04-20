---
name: ai-regression-testing
description: "Fires when an AI agent has modified code and needs regression testing, or when a bug is found and needs a test to prevent re-introduction. Covers API testing without DB, bug-check workflows, and AI blind spot patterns."
---

# AI Regression Testing

Testing patterns for AI-assisted development, where the same model writes code and reviews it — creating systematic blind spots that only automated tests can catch.

## When to Activate

- AI agent has modified API routes, Server Actions, or backend logic
- A bug was found and fixed — need to prevent re-introduction
- Running a bug-check or review after AI-assisted code changes
- Multiple code paths exist (mock data vs production, feature flags, etc.)

## The Core Problem

When an AI writes code and then reviews its own work, it carries the same assumptions into both steps:

```
AI writes fix → AI reviews fix → AI says "looks correct" → Bug still exists
```

**Real-world example:**
```
Fix 1: Added new field to API response
  → Forgot to include it in the data query
  → AI reviewed and missed it (same blind spot)

Fix 2: Added it to the query
  → TypeScript build error (type not updated)

Fix 3: Fixed the type
  → Only fixed production path, forgot mock data path

Fix 4: Test caught it instantly on first run
```

The pattern: **code path inconsistency** is the #1 AI-introduced regression.

## API Route Testing (No DB Required)

Test API routes directly using the project's test helpers (see `__tests__/helpers.ts` for `createTestRequest`).

```typescript
import { describe, it, expect } from "vitest";
import { createTestRequest, parseResponse } from "../helpers";
import { GET } from "@/app/api/books/route";

// Define the contract — what fields MUST be in the response
const REQUIRED_FIELDS = [
  "id",
  "title",
  "author",
  "isbn",
  "available",
  "branch",
  "coverImageUrl",  // ← Added after bug found it missing
];

describe("GET /api/books/:id", () => {
  it("returns all required fields", async () => {
    const req = createTestRequest("/api/books/123");
    const res = await GET(req, { params: { id: "123" } });
    const { status, json } = await parseResponse(res);

    expect(status).toBe(200);
    for (const field of REQUIRED_FIELDS) {
      expect(json.data).toHaveProperty(field);
    }
  });

  // Regression test — this exact bug was introduced by AI
  it("coverImageUrl is not undefined (regression)", async () => {
    const req = createTestRequest("/api/books/123");
    const res = await GET(req, { params: { id: "123" } });
    const { json } = await parseResponse(res);

    expect(json.data.coverImageUrl).toBeDefined();
    expect(typeof json.data.coverImageUrl === "string" || json.data.coverImageUrl === null).toBe(true);
  });
});
```

## Testing Code Path Parity

The most common AI regression: fixing one code path but forgetting another (mock data, error handling, different user roles).

```typescript
describe("GET /api/reservations", () => {
  it("returns same shape for authenticated user and guest", async () => {
    const authReq = createTestRequest("/api/reservations", {
      headers: { authorization: "Bearer test-token" },
    });
    const guestReq = createTestRequest("/api/reservations");

    const authRes = await GET(authReq);
    const guestRes = await GET(guestReq);

    const authJson = await authRes.json();
    const guestJson = await guestRes.json();

    // Both should have the same top-level shape
    expect(Object.keys(authJson)).toEqual(Object.keys(guestJson));
  });
});
```

## Common AI Regression Patterns

### Pattern 1: Code Path Mismatch

**Frequency**: Most common

```typescript
// AI adds field to one branch only
if (useMockData) {
  return { data: { id, title, author } };          // Missing new field
}
return { data: { id, title, author, coverImage } }; // Has new field

// Fix: both paths must return the same shape
if (useMockData) {
  return { data: { id, title, author, coverImage: null } };
}
return { data: { id, title, author, coverImage } };
```

**Test to catch it:**
```typescript
it("mock and production paths return same fields", async () => {
  const res = await GET(createTestRequest("/api/books/123"));
  const { json } = await parseResponse(res);

  for (const field of REQUIRED_FIELDS) {
    expect(json.data).toHaveProperty(field);
  }
});
```

### Pattern 2: Query/Select Omission

**Frequency**: Common when adding new fields to existing endpoints

```typescript
// AI adds field to response type but not to the data fetch
const book = await db.book.findUnique({
  where: { id },
  select: { id: true, title: true, author: true }, // coverImage not here
});

return { data: { ...book, coverImage: book.coverImage } };
// → coverImage is always undefined
```

### Pattern 3: Error State Leakage

**Frequency**: Moderate — when adding error handling

```typescript
// Error state set but stale data not cleared
catch (err) {
  setError("Kunne ikke laste reservasjoner");
  // reservations still shows data from previous request!
}

// Fix: clear related state on error
catch (err) {
  setReservations([]);
  setError("Kunne ikke laste reservasjoner");
}
```

### Pattern 4: Optimistic Update Without Rollback

```typescript
// No rollback on failure
const handleCancelReservation = async (id: string) => {
  setReservations(prev => prev.filter(r => r.id !== id));
  await fetch(`/api/reservations/${id}`, { method: "DELETE" });
  // If API fails, reservation is gone from UI but still in system
};

// Fix: capture previous state and rollback
const handleCancelReservation = async (id: string) => {
  const prev = [...reservations];
  setReservations(prev => prev.filter(r => r.id !== id));
  try {
    const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("API error");
  } catch {
    setReservations(prev);
  }
};
```

## Strategy: Test Where Bugs Were Found

Don't aim for blanket coverage. Focus tests on areas where bugs have actually occurred:

```
Bug found in /api/books/:id       → Write test for book detail API
Bug found in /api/reservations    → Write test for reservations API
Bug found in search component     → Write test for search behavior
No bug in /api/branches           → Don't write test (yet)
```

**Why this works with AI development:**

1. AI tends to make the **same category of mistake** repeatedly
2. Bugs cluster in complex areas (multi-path logic, state management, data fetching)
3. Once tested, that exact regression **cannot happen again**
4. Test count grows organically with bug fixes — no wasted effort

## Quick Reference

| AI Regression Pattern | Test Strategy | Priority |
|---|---|---|
| Code path mismatch | Assert same response shape across paths | High |
| Query/select omission | Assert all required fields in response | High |
| Error state leakage | Assert state cleanup on error | Medium |
| Missing rollback | Assert state restored on API failure | Medium |
| Type cast masking null | Assert field is not undefined | Medium |

## DO / DON'T

**DO:**
- Write tests immediately after finding a bug (before fixing it if possible — TDD)
- Test the API response shape, not the implementation
- Run tests as the first step of every bug-check
- Keep tests fast (< 1 second total for API tests)
- Name tests after the bug they prevent (e.g., "coverImageUrl regression")

**DON'T:**
- Write tests for code that has never had a bug (unless it's a new feature — see `tdd-workflow`)
- Trust AI self-review as a substitute for automated tests
- Skip mock/test data path testing because "it's just mock data"
- Write E2E tests when unit tests suffice for catching the regression

## This Skill IS / IS NOT

- **IS**: Patterns for catching regressions introduced by AI-assisted development (code path mismatches, blind spots)
- **IS NOT**: General TDD workflow — see `tdd-workflow` for the Red-Green-Refactor cycle
- **IS NOT**: E2E testing patterns — see `e2e-testing` for Playwright-specific guidance

## Gotchas

- **AI makes the same category of mistake repeatedly.** Code path mismatch (fixing one branch but not another) is the #1 pattern. Test for it explicitly.
- **Don't trust AI self-review.** The same assumptions that caused the bug will blind the review. Automated tests are the only reliable check.
- **Mock data paths diverge silently.** When adding fields to API responses, always check both the production and mock data code paths return the same shape.
- **Test where bugs were found, not everywhere.** Bug-driven test growth is more effective than blanket coverage for catching AI regressions.

## Cross-References

- **TDD for new features**: See `tdd-workflow` skill — new features get 80% coverage target
- **E2E patterns**: See `e2e-testing` skill for Playwright-specific patterns
- **Test helpers**: See `__tests__/helpers.ts` for `createTestRequest` and `parseResponse`

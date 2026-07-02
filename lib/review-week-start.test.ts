import { describe, it, expect } from "vitest";
import {
  completedWeekStart,
  MAX_WEEKS_BACK,
} from "@/components/review/review-dates";

// Characterization tests for the CLIENT week-start contract that the
// server-side weekly-review pre-generation cron (`convex/weeklyReview.ts`,
// `completedWeekStartUTC`) must agree with — the two compute the same
// "YYYY-MM-DD" Monday string (client in local time, server in UTC) so the
// cron's pre-generated row is found by the client's `getReview` query.
// Convex code isn't covered by `pnpm test` (vitest scope is `lib/**`), so
// this pins the CLIENT half of that contract; the server twin cites this
// file in a comment instead of being cross-checked here.

describe("completedWeekStart", () => {
  it("mid-week: most recently completed week is last Mon-Sun", () => {
    // Wednesday 2026-07-08 -> current week's Monday is 2026-07-06 ->
    // the most recently COMPLETED week started 2026-06-29.
    const now = new Date(2026, 6, 8, 12, 0, 0);
    expect(completedWeekStart(0, now)).toBe("2026-06-29");
  });

  it("on a Monday: the week that just started is not yet completed", () => {
    // Monday 2026-07-06 -> same result as any other day that week.
    const now = new Date(2026, 6, 6, 0, 30, 0);
    expect(completedWeekStart(0, now)).toBe("2026-06-29");
  });

  it("on a Sunday: still belongs to the Mon-Sun week ending that day", () => {
    // Sunday 2026-07-12 -> belongs to the week starting 2026-07-06, so the
    // most recently completed week is still 2026-06-29.
    const now = new Date(2026, 6, 12, 23, 0, 0);
    expect(completedWeekStart(0, now)).toBe("2026-06-29");
  });

  it("weeksBack pages further into the past by whole weeks", () => {
    const now = new Date(2026, 6, 8, 12, 0, 0);
    expect(completedWeekStart(1, now)).toBe("2026-06-22");
    expect(completedWeekStart(2, now)).toBe("2026-06-15");
  });
});

describe("MAX_WEEKS_BACK", () => {
  it("pins the current paging limit", () => {
    expect(MAX_WEEKS_BACK).toBe(4);
  });
});

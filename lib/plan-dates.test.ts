import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatPlanDate,
  getPlanDayDate,
  isPast,
  isToday,
  isTomorrow,
} from "@/lib/plan-dates";

// Characterization tests: pin CURRENT week-start + DST-sensitive date math in
// lib/plan-dates.ts (plan 046). All getPlanDayDate assertions read local
// Y/M/D getters (never toISOString) so they agree in any timezone, including
// CI's UTC — this code is local-time-only by design, so results should not
// be TZ-dependent. Reference weekdays used below were independently
// verified via `date -j -f "%Y-%m-%d" <date> "+%A"` before being hardcoded.

describe("getPlanDayDate", () => {
  it("case 1: monday-start user, monday start date — dayOfWeek 0 wraps to the end of the week", () => {
    const monday = getPlanDayDate("2026-06-01", 1, 1, "monday");
    expect([monday.getFullYear(), monday.getMonth(), monday.getDate()]).toEqual([2026, 5, 1]);

    // dayOfWeek 0 (Sunday) is "before" the monday week-start, so it wraps
    // via the `dayOffset += 7` branch to the END of week 1 (Jun 7), not the
    // start of the week.
    const sunday = getPlanDayDate("2026-06-01", 1, 0, "monday");
    expect([sunday.getFullYear(), sunday.getMonth(), sunday.getDate()]).toEqual([2026, 5, 7]);
  });

  it("case 2: sunday-start user, sunday start date", () => {
    const sunday = getPlanDayDate("2026-06-07", 1, 0, "sunday");
    expect([sunday.getFullYear(), sunday.getMonth(), sunday.getDate()]).toEqual([2026, 5, 7]);

    const saturday = getPlanDayDate("2026-06-07", 1, 6, "sunday");
    expect([saturday.getFullYear(), saturday.getMonth(), saturday.getDate()]).toEqual([2026, 5, 13]);
  });

  it("case 3: week arithmetic — week 3, monday-start, dayOfWeek 3 (Wed) = start + 14 + 2 days", () => {
    const date = getPlanDayDate("2026-06-01", 3, 3, "monday");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 5, 17]);
  });

  it("case 4: DST spring-forward (EU, 2026-03-29) does not shift the calendar date", () => {
    // start is the Monday before the spring-forward Sunday (2026-03-29);
    // week 2 / dayOfWeek 1 (Monday) lands 7 days later, crossing the jump,
    // on the Monday after it. setDate() is DST-safe: the local calendar
    // date lands correctly even though an hour of wall-clock time vanished
    // partway through the range.
    const date = getPlanDayDate("2026-03-23", 2, 1, "monday");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 30]);
  });

  it("case 5: DST fall-back (EU, 2026-10-25) does not shift the calendar date", () => {
    // start is the Monday before the fall-back Sunday (2026-10-25); week 2
    // / dayOfWeek 1 lands 7 days later, crossing the repeated hour.
    const date = getPlanDayDate("2026-10-19", 2, 1, "monday");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 26]);
  });

  it("case 6 (characterization, not endorsement): monday-start user whose startDate is a Wednesday", () => {
    // CHARACTERIZATION: getPlanDayDate trusts startDate positionally and
    // never validates it against weekStartDay. dayOffset is computed
    // relative to startDate's actual weekday, not a "real" Monday, so
    // asking for dayOfWeek=1 ("Monday") on a Wednesday-anchored plan just
    // returns startDate itself (still a Wednesday), and asking for
    // dayOfWeek=0 ("Sunday") returns a Tuesday. This pins CURRENT behavior
    // for malformed input (doc comment says startDate "should be a Monday
    // for monday-start users") — it documents a future validation gap, not
    // correct behavior. See plan 046, step 6 / maintenance notes.
    const start = "2026-06-03"; // a Wednesday, not a Monday
    const askedMonday = getPlanDayDate(start, 1, 1, "monday");
    expect([askedMonday.getFullYear(), askedMonday.getMonth(), askedMonday.getDate()]).toEqual([
      2026, 5, 3,
    ]); // still Wednesday, not actually a Monday

    const askedSunday = getPlanDayDate(start, 1, 0, "monday");
    expect([askedSunday.getFullYear(), askedSunday.getMonth(), askedSunday.getDate()]).toEqual([
      2026, 5, 9,
    ]); // a Tuesday, not actually a Sunday
  });
});

describe("isToday / isTomorrow / isPast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("case 7: same local day as system time", () => {
    vi.setSystemTime(new Date(2026, 5, 10, 15, 0, 0));
    const sameDay = new Date(2026, 5, 10);
    expect(isToday(sameDay)).toBe(true);
    expect(isTomorrow(sameDay)).toBe(false);
    expect(isPast(sameDay)).toBe(false);
  });

  it("case 8: tomorrow and yesterday relative to system time", () => {
    vi.setSystemTime(new Date(2026, 5, 10, 15, 0, 0));
    expect(isTomorrow(new Date(2026, 5, 11))).toBe(true);
    expect(isPast(new Date(2026, 5, 9))).toBe(true);
  });

  it("case 9: month boundary — Jun 30 system time, Jul 1 is tomorrow", () => {
    vi.setSystemTime(new Date(2026, 5, 30, 15, 0, 0));
    expect(isTomorrow(new Date(2026, 6, 1))).toBe(true);
  });

  it("case 10: isPast is date-level, not time-level — same day, earlier hour, is not past", () => {
    // today is computed as midnight of the system date; a Date at 3am on
    // that same day is NOT < that midnight, so isPast is false even though
    // 3am is "earlier" than the current 3pm system time.
    vi.setSystemTime(new Date(2026, 5, 10, 15, 0, 0));
    const earlierSameDay = new Date(2026, 5, 10, 3, 0, 0);
    expect(isPast(earlierSameDay)).toBe(false);
  });

  it("case 11: year boundary — Dec 31 system time, Jan 1 is tomorrow", () => {
    vi.setSystemTime(new Date(2026, 11, 31, 15, 0, 0));
    expect(isTomorrow(new Date(2027, 0, 1))).toBe(true);
  });
});

describe("formatPlanDate", () => {
  it("case 12: formats as 'Ddd, Mon D'", () => {
    // 2026-02-24 is a Tuesday (verified independently).
    expect(formatPlanDate(new Date(2026, 1, 24))).toBe("Tue, Feb 24");
  });
});

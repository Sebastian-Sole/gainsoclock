import { describe, expect, it } from "vitest";
import { firstIncompleteSetIndex } from "./set-progress";

describe("firstIncompleteSetIndex", () => {
  it("returns 0 when no sets are completed", () => {
    expect(
      firstIncompleteSetIndex([{ completed: false }, { completed: false }]),
    ).toBe(0);
  });

  it("returns the earliest incomplete set when some are completed", () => {
    expect(
      firstIncompleteSetIndex([
        { completed: true },
        { completed: true },
        { completed: false },
        { completed: false },
      ]),
    ).toBe(2);
  });

  it("skips a gap: completed, incomplete, completed -> index 1", () => {
    expect(
      firstIncompleteSetIndex([
        { completed: true },
        { completed: false },
        { completed: true },
      ]),
    ).toBe(1);
  });

  it("falls back to 0 when every set is completed", () => {
    expect(
      firstIncompleteSetIndex([{ completed: true }, { completed: true }]),
    ).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(firstIncompleteSetIndex([])).toBe(0);
  });

  it("treats a missing completed flag as incomplete", () => {
    expect(firstIncompleteSetIndex([{ completed: true }, {}])).toBe(1);
  });
});

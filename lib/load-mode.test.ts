import { describe, it, expect } from "vitest";
import {
  LOAD_MODES,
  LOAD_MODE_OPTIONS,
  coerceLoadMode,
  effectiveLoad,
  isLoadMode,
  loadModeFieldSuffix,
  loadMultiplier,
  resolveLoadMode,
} from "@/lib/load-mode";

// The single place the "what does the stored weight mean?" convention is
// defined. Legacy back-compat is the load-bearing behavior here: an ABSENT
// loadMode must behave exactly like 'total' everywhere, so pre-flag data is
// unchanged in interpretation.

describe("resolveLoadMode (legacy defaulting)", () => {
  it("defaults absent to 'total'", () => {
    expect(resolveLoadMode(undefined)).toBe("total");
  });

  it("passes explicit modes through", () => {
    expect(resolveLoadMode("total")).toBe("total");
    expect(resolveLoadMode("per_hand")).toBe("per_hand");
    expect(resolveLoadMode("per_side")).toBe("per_side");
  });
});

describe("loadMultiplier / effectiveLoad", () => {
  it("absent and 'total' are multiplier 1 (legacy rows unchanged)", () => {
    expect(loadMultiplier(undefined)).toBe(1);
    expect(loadMultiplier("total")).toBe(1);
    expect(effectiveLoad(80, undefined)).toBe(80);
    expect(effectiveLoad(80, "total")).toBe(80);
  });

  it("'per_hand' doubles: two implements move at once", () => {
    expect(loadMultiplier("per_hand")).toBe(2);
    expect(effectiveLoad(10, "per_hand")).toBe(20);
    expect(effectiveLoad(12.5, "per_hand")).toBe(25);
  });

  it("'per_side' is multiplier 2: a logged set covers both sides", () => {
    expect(loadMultiplier("per_side")).toBe(2);
    expect(effectiveLoad(24, "per_side")).toBe(48);
  });
});

describe("coerceLoadMode (hydration boundary)", () => {
  it("keeps recognized modes", () => {
    for (const mode of LOAD_MODES) {
      expect(coerceLoadMode(mode)).toBe(mode);
    }
  });

  it("drops unknown or absent values (undefined = legacy total)", () => {
    expect(coerceLoadMode(undefined)).toBeUndefined();
    expect(coerceLoadMode("")).toBeUndefined();
    expect(coerceLoadMode("bilateral")).toBeUndefined();
    expect(coerceLoadMode("PER_HAND")).toBeUndefined();
  });
});

describe("isLoadMode", () => {
  it("recognizes exactly the three modes", () => {
    expect(isLoadMode("total")).toBe(true);
    expect(isLoadMode("per_hand")).toBe(true);
    expect(isLoadMode("per_side")).toBe(true);
    expect(isLoadMode("per_arm")).toBe(false);
  });
});

describe("loadModeFieldSuffix", () => {
  it("labels unilateral modes and stays silent for total/legacy", () => {
    expect(loadModeFieldSuffix(undefined)).toBeUndefined();
    expect(loadModeFieldSuffix("total")).toBeUndefined();
    expect(loadModeFieldSuffix("per_hand")).toBe("per hand");
    expect(loadModeFieldSuffix("per_side")).toBe("per side");
  });
});

describe("LOAD_MODE_OPTIONS (create-flow selector)", () => {
  it("covers every mode once, 'total' first (the default)", () => {
    expect(LOAD_MODE_OPTIONS.map((o) => o.id)).toEqual([
      "total",
      "per_hand",
      "per_side",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import {
  formatMetricValue,
  parseLocaleNumber,
  parseWeightKg,
  parseHeightCm,
  parseAgeYears,
} from "@/lib/format";

// Characterization tests: pin CURRENT behavior of the comma-decimal locale
// parser and the bounded onboarding parsers. These guard the 16+ age gate and
// weight/height input; oddities are pinned deliberately and commented.

describe("parseLocaleNumber", () => {
  it("accepts comma decimal: '82,5' -> 82.5", () => {
    expect(parseLocaleNumber("82,5")).toBe(82.5);
  });

  it("accepts dot decimal: '82.5' -> 82.5", () => {
    expect(parseLocaleNumber("82.5")).toBe(82.5);
  });

  it("empty string -> null", () => {
    expect(parseLocaleNumber("")).toBeNull();
  });

  it("whitespace-only -> null (trimmed to empty)", () => {
    expect(parseLocaleNumber("   ")).toBeNull();
  });

  it("non-numeric -> null", () => {
    expect(parseLocaleNumber("abc")).toBeNull();
  });

  it("ODDITY: double-separator '1,234.5' -> null", () => {
    // replace(',', '.') only swaps the FIRST comma, yielding '1.234.5', which
    // Number() rejects as NaN. Thousands-grouped input is rejected, not parsed.
    // (See plan 003 note.)
    expect(parseLocaleNumber("1,234.5")).toBeNull();
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(parseLocaleNumber("  73,2  ")).toBe(73.2);
  });
});

describe("parseWeightKg (bounds 30-250, inclusive)", () => {
  it("lower edge 30 is accepted", () => {
    expect(parseWeightKg("30")).toBe(30);
  });

  it("upper edge 250 is accepted", () => {
    expect(parseWeightKg("250")).toBe(250);
  });

  it("just below lower edge (29.9) -> null", () => {
    expect(parseWeightKg("29,9")).toBeNull();
  });

  it("just above upper edge (250.1) -> null", () => {
    expect(parseWeightKg("250.1")).toBeNull();
  });

  it("comma decimal within bounds parses", () => {
    expect(parseWeightKg("82,5")).toBe(82.5);
  });
});

describe("parseHeightCm (bounds 120-230, inclusive)", () => {
  it("lower edge 120 is accepted", () => {
    expect(parseHeightCm("120")).toBe(120);
  });

  it("upper edge 230 is accepted", () => {
    expect(parseHeightCm("230")).toBe(230);
  });

  it("below lower edge (119) -> null", () => {
    expect(parseHeightCm("119")).toBeNull();
  });

  it("above upper edge (231) -> null", () => {
    expect(parseHeightCm("231")).toBeNull();
  });
});

describe("parseAgeYears (integer, bounds 16-100, inclusive)", () => {
  it("below the 16+ gate (15) -> null", () => {
    expect(parseAgeYears("15")).toBeNull();
  });

  it("lower edge 16 is accepted", () => {
    expect(parseAgeYears("16")).toBe(16);
  });

  it("upper edge 100 is accepted", () => {
    expect(parseAgeYears("100")).toBe(100);
  });

  it("above upper edge (101) -> null", () => {
    expect(parseAgeYears("101")).toBeNull();
  });

  it("non-integer (16.5) -> null (integerOnly rejects fractional age)", () => {
    expect(parseAgeYears("16.5")).toBeNull();
  });
});

describe("formatMetricValue (stats charts / PB rows)", () => {
  it("routes unit-preference metrics through user units", () => {
    expect(formatMetricValue("weight", 92.46, "kg", "km")).toBe("92.5 kg");
    expect(formatMetricValue("distance", 4.24, "kg", "mi")).toBe("4.2 mi");
    expect(formatMetricValue("speed", 12.34, "kg", "km")).toBe("12.3 km/h");
    expect(formatMetricValue("pace", 330, "kg", "km")).toBe("5:30 /km");
  });

  it("formats duration as m:ss and integer metrics with their fixed unit", () => {
    expect(formatMetricValue("duration", 90.4, "kg", "km")).toBe("1:30");
    expect(formatMetricValue("reps", 12.6, "kg", "km")).toBe("13 reps");
    expect(formatMetricValue("power_avg", 219.5, "kg", "km")).toBe("220 W");
    expect(formatMetricValue("heart_rate_avg", 149.6, "kg", "km")).toBe("150 bpm");
    expect(formatMetricValue("cadence", 27.2, "kg", "km")).toBe("27 spm");
    expect(formatMetricValue("calories", 54.5, "kg", "km")).toBe("55 kcal");
  });
});

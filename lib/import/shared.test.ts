import { describe, it, expect } from "vitest";
import {
  ALL_IMPORT_OPTIONS,
  buildLogsFromNormalizedRows,
  convertDistance,
  convertWeight,
  normalizeHeader,
  parseClockDuration,
  parseHmsDuration,
  parseNumericCell,
  positiveOrUndefined,
  sessionKeysFromRows,
  summarizeRows,
  tryParseIsoLike,
  type NormalizedSetRow,
} from "@/lib/import/shared";

describe("normalizeHeader", () => {
  it("lowercases and strips non-alphanumerics", () => {
    expect(normalizeHeader("Workout Name")).toBe("workoutname");
    expect(normalizeHeader("weight_kg")).toBe("weightkg");
    expect(normalizeHeader("Weight (kg)")).toBe("weightkg");
  });
});

describe("parseNumericCell", () => {
  it("accepts comma decimals", () => {
    expect(parseNumericCell("82,5")).toBe(82.5);
  });

  it("returns null on empty / undefined", () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell(undefined)).toBeNull();
  });
});

describe("positiveOrUndefined", () => {
  it("treats 0 (CSV 'not tracked') as absent", () => {
    expect(positiveOrUndefined(0)).toBeUndefined();
    expect(positiveOrUndefined(null)).toBeUndefined();
    expect(positiveOrUndefined(5)).toBe(5);
  });
});

describe("tryParseIsoLike", () => {
  it("parses space-separated timestamps (JSC-safe normalization)", () => {
    const d = tryParseIsoLike("2020-12-30 18:51:52");
    expect(d?.getTime()).toBe(new Date("2020-12-30T18:51:52").getTime());
  });

  it("returns null instead of inventing a date", () => {
    expect(tryParseIsoLike("not a date")).toBeNull();
    expect(tryParseIsoLike("")).toBeNull();
    expect(tryParseIsoLike(undefined)).toBeNull();
  });
});

describe("parseHmsDuration", () => {
  it("parses Strong-style durations", () => {
    expect(parseHmsDuration("2h 38m")).toBe(9480);
    expect(parseHmsDuration("1h 5m 30s")).toBe(3930);
    expect(parseHmsDuration("45m")).toBe(2700);
    expect(parseHmsDuration("90s")).toBe(90);
  });

  it("treats a bare number as seconds", () => {
    expect(parseHmsDuration("120")).toBe(120);
  });

  it("returns 0 for empty/invalid", () => {
    expect(parseHmsDuration(undefined)).toBe(0);
    expect(parseHmsDuration("")).toBe(0);
    expect(parseHmsDuration("n/a")).toBe(0);
  });
});

describe("parseClockDuration", () => {
  it("parses MM:SS and HH:MM:SS", () => {
    expect(parseClockDuration("1:30")).toBe(90);
    expect(parseClockDuration("01:02:03")).toBe(3723);
  });
});

describe("unit conversion", () => {
  it("converts lbs to kg (rounded to 2dp)", () => {
    expect(convertWeight(225, "lbs", "kg")).toBe(102.06);
  });

  it("converts kg to lbs (rounded to 2dp)", () => {
    expect(convertWeight(100, "kg", "lbs")).toBe(220.46);
  });

  it("is identity for same unit", () => {
    expect(convertWeight(82.5, "kg", "kg")).toBe(82.5);
  });

  it("converts miles and meters to km", () => {
    expect(convertDistance(3, "mi", "km")).toBe(4.828);
    expect(convertDistance(5000, "m", "km")).toBe(5);
  });

  it("converts km to miles", () => {
    expect(convertDistance(5, "km", "mi")).toBe(3.107);
  });
});

function row(overrides: Partial<NormalizedSetRow>): NormalizedSetRow {
  return {
    workoutKey: "k1",
    workoutName: "Push Day",
    startedAt: "2024-01-05T10:00:00.000Z",
    completedAt: "2024-01-05T11:00:00.000Z",
    exercise: "Bench Press",
    completed: true,
    ...overrides,
  };
}

describe("buildLogsFromNormalizedRows", () => {
  const resolver = (name: string) => `ex-${name}`;

  it("groups rows into workouts and exercises, preserving order", () => {
    const rows = [
      row({ reps: 5, weight: 100 }),
      row({ exercise: "Squat", reps: 5, weight: 140 }),
      row({ reps: 3, weight: 105 }),
    ];
    const logs = buildLogsFromNormalizedRows(rows, ALL_IMPORT_OPTIONS, resolver);

    expect(logs).toHaveLength(1);
    expect(logs[0].templateName).toBe("Push Day");
    expect(logs[0].durationSeconds).toBe(3600);
    expect(logs[0].exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Squat",
    ]);
    // Interleaved rows of the same exercise collapse into one exercise
    expect(logs[0].exercises[0].sets).toHaveLength(2);
    expect(logs[0].exercises[0].sets[0]).toMatchObject({
      type: "reps_weight",
      reps: 5,
      weight: 100,
      completed: true,
    });
  });

  it("derives set type from which fields are present", () => {
    const rows = [
      row({ exercise: "Plank", timeSeconds: 60 }),
      row({ exercise: "Run", timeSeconds: 1800, distance: 5 }),
      row({ exercise: "Pull-up", reps: 10 }),
    ];
    const logs = buildLogsFromNormalizedRows(rows, ALL_IMPORT_OPTIONS, resolver);
    const types = logs[0].exercises.map((e) => e.sets[0].type);
    expect(types).toEqual(["time_only", "time_distance", "reps_only"]);
  });

  it("sorts workouts oldest first", () => {
    const rows = [
      row({
        workoutKey: "k2",
        startedAt: "2024-02-01T10:00:00.000Z",
        completedAt: "2024-02-01T11:00:00.000Z",
        reps: 5,
        weight: 100,
      }),
      row({ reps: 5, weight: 100 }),
    ];
    const logs = buildLogsFromNormalizedRows(rows, ALL_IMPORT_OPTIONS, resolver);
    expect(logs.map((l) => l.startedAt)).toEqual([
      "2024-01-05T10:00:00.000Z",
      "2024-02-01T10:00:00.000Z",
    ]);
  });

  it("honours import options (no sets when setsAndReps is off)", () => {
    const logs = buildLogsFromNormalizedRows(
      [row({ reps: 5, weight: 100 })],
      { ...ALL_IMPORT_OPTIONS, setsAndReps: false },
      resolver
    );
    expect(logs[0].exercises[0].sets).toEqual([]);
  });
});

describe("summarizeRows / sessionKeysFromRows", () => {
  it("summarizes counts and date range", () => {
    const rows = [
      row({ reps: 5 }),
      row({ exercise: "Squat", reps: 5 }),
      row({
        workoutKey: "k2",
        startedAt: "2024-02-01T10:00:00.000Z",
        completedAt: "2024-02-01T11:00:00.000Z",
        reps: 5,
      }),
    ];
    const summary = summarizeRows(rows);
    expect(summary.workoutCount).toBe(2);
    expect(summary.exerciseCount).toBe(2);
    expect(summary.setCount).toBe(3);
    expect(summary.dateRange).toEqual({
      earliest: "2024-01-05T10:00:00.000Z",
      latest: "2024-02-01T10:00:00.000Z",
    });
  });

  it("produces distinct session keys (the dedup key)", () => {
    const rows = [row({}), row({}), row({ workoutKey: "k2" })];
    expect(sessionKeysFromRows(rows)).toEqual([
      "2024-01-05T10:00:00.000Z|2024-01-05T11:00:00.000Z",
    ]);
  });
});

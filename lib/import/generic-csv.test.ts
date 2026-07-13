import { describe, it, expect } from "vitest";
import {
  detectGenericMapping,
  parseGenericCSV,
  parseGenericDate,
} from "@/lib/import/generic-csv";
import {
  ALL_IMPORT_OPTIONS,
  buildLogsFromNormalizedRows,
  sessionKeysFromRows,
  type ImportUnits,
} from "@/lib/import/shared";

const KG_UNITS: ImportUnits = { weightUnit: "kg", distanceUnit: "km" };

describe("detectGenericMapping", () => {
  it("maps common header spellings", () => {
    expect(
      detectGenericMapping(["Date", "Exercise Name", "Weight", "Reps"])
    ).toMatchObject({
      date: "date",
      exercise: "exercisename",
      weight: "weight",
      reps: "reps",
    });
  });

  it("recognizes unit-bearing and snake_case headers", () => {
    expect(
      detectGenericMapping(["workout_date", "movement", "weight_lbs", "rep"])
    ).toMatchObject({
      date: "workoutdate",
      exercise: "movement",
      weight: "weightlbs",
      reps: "rep",
    });
  });

  it("accepts duration-only files and a workout name column", () => {
    expect(
      detectGenericMapping(["Date", "Exercise", "Time", "Routine"])
    ).toMatchObject({ date: "date", exercise: "exercise", duration: "time", name: "routine" });
  });

  it("rejects files missing date, exercise, or all value columns", () => {
    expect(detectGenericMapping(["Exercise", "Weight", "Reps"])).toBeNull();
    expect(detectGenericMapping(["Date", "Weight", "Reps"])).toBeNull();
    expect(detectGenericMapping(["Date", "Exercise", "Notes"])).toBeNull();
  });
});

describe("parseGenericDate", () => {
  it("pins date-only values to 12:00 local time (stable dedup keys)", () => {
    expect(parseGenericDate("2024-01-05")?.getTime()).toBe(
      new Date(2024, 0, 5, 12, 0, 0).getTime()
    );
  });

  it("reads slash dates day-first, unless the first number must be a month", () => {
    expect(parseGenericDate("06/01/2024")?.getTime()).toBe(
      new Date(2024, 0, 6, 12, 0, 0).getTime() // 6 Jan
    );
    expect(parseGenericDate("01/25/2024")?.getTime()).toBe(
      new Date(2024, 0, 25, 12, 0, 0).getTime() // 25 Jan (25 can't be a month)
    );
  });

  it("parses full timestamps directly", () => {
    expect(parseGenericDate("2024-01-05 18:30:00")?.getTime()).toBe(
      new Date("2024-01-05T18:30:00").getTime()
    );
  });

  it("returns null on garbage", () => {
    expect(parseGenericDate("soon")).toBeNull();
    expect(parseGenericDate("")).toBeNull();
  });
});

describe("parseGenericCSV", () => {
  it("imports a simple date/exercise/weight/reps file, comma decimals included", () => {
    const csv = `Date,Exercise,Weight,Reps
2024-01-05,Bench Press,"80,5",5
2024-01-05,Bench Press,82.5,3
2024-01-06,Squat,100,5
`;
    const parsed = parseGenericCSV(csv, KG_UNITS);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.summary.workoutCount).toBe(2); // grouped by day
    expect(parsed.rows[0].weight).toBe(80.5);

    const logs = buildLogsFromNormalizedRows(
      parsed.rows,
      ALL_IMPORT_OPTIONS,
      (name) => `ex-${name}`
    );
    expect(logs).toHaveLength(2);
    expect(logs[0].exercises[0].sets).toHaveLength(2);
    expect(logs[0].exercises[0].sets[1]).toMatchObject({
      type: "reps_weight",
      reps: 3,
      weight: 82.5,
    });
  });

  it("converts when the weight header declares a unit (weight_lbs → kg)", () => {
    const csv = `date,exercise,weight_lbs,reps
2024-01-05,Deadlift,315,3
`;
    const parsed = parseGenericCSV(csv, KG_UNITS);
    expect(parsed.rows[0].weight).toBe(142.88); // 315 lb
  });

  it("converts kg-declared weights to lbs when the app is set to lbs", () => {
    const csv = `date,exercise,Weight (kg),reps
2024-01-05,Deadlift,100,3
`;
    const parsed = parseGenericCSV(csv, {
      weightUnit: "lbs",
      distanceUnit: "mi",
    });
    expect(parsed.rows[0].weight).toBe(220.46);
  });

  it("parses clock-style durations and plain seconds", () => {
    const csv = `date,exercise,duration
2024-01-05,Plank,1:30
2024-01-05,Wall Sit,60
`;
    const parsed = parseGenericCSV(csv, KG_UNITS);
    expect(parsed.rows[0].timeSeconds).toBe(90);
    expect(parsed.rows[1].timeSeconds).toBe(60);
  });

  it("groups sessions by date + workout name", () => {
    const csv = `date,workout,exercise,weight,reps
2024-01-05,Push,Bench Press,80,5
2024-01-05,Pull,Row,70,8
`;
    const parsed = parseGenericCSV(csv, KG_UNITS);
    expect(parsed.summary.workoutCount).toBe(2);
    const logs = buildLogsFromNormalizedRows(
      parsed.rows,
      ALL_IMPORT_OPTIONS,
      (name) => `ex-${name}`
    );
    expect(logs.map((l) => l.templateName).sort()).toEqual(["Pull", "Push"]);
  });

  it("is deterministic: re-parsing yields identical session keys (dedup)", () => {
    const csv = `Date,Exercise,Weight,Reps
2024-01-05,Bench Press,80,5
`;
    const a = parseGenericCSV(csv, KG_UNITS);
    const b = parseGenericCSV(csv, KG_UNITS);
    expect(sessionKeysFromRows(a.rows)).toEqual(sessionKeysFromRows(b.rows));
  });

  it("returns no rows when required columns are missing", () => {
    expect(parseGenericCSV("", KG_UNITS).rows).toEqual([]);
    expect(
      parseGenericCSV("exercise,weight,reps\nSquat,100,5\n", KG_UNITS).rows
    ).toEqual([]);
    expect(
      parseGenericCSV("date,exercise,notes\n2024-01-05,Squat,hi\n", KG_UNITS)
        .rows
    ).toEqual([]);
  });

  it("skips rows with unparseable dates or missing exercise", () => {
    const csv = `date,exercise,weight,reps
2024-01-05,Bench Press,80,5
someday,Squat,100,5
2024-01-06,,60,8
`;
    const parsed = parseGenericCSV(csv, KG_UNITS);
    expect(parsed.rows).toHaveLength(1);
  });
});

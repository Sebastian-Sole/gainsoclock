import { describe, it, expect } from "vitest";
import { parseStrongCSV } from "@/lib/import/strong";
import {
  ALL_IMPORT_OPTIONS,
  buildLogsFromNormalizedRows,
  sessionKeysFromRows,
  type ImportUnits,
} from "@/lib/import/shared";

const KG_UNITS: ImportUnits = { weightUnit: "kg", distanceUnit: "km" };

// Hand-crafted from the community-documented iOS export format:
// Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,
// Seconds,Notes,Workout Notes,RPE
// Includes a comma-decimal weight (quoted), a "Rest Timer" pseudo-row, a
// time-only set and a time+distance set. Unused numeric cells are 0.
const IOS_CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2020-12-30 18:51:52,"Evening Workout",2h 38m,"Squat (Barbell)",1,100.0,5,0,0,"","",8
2020-12-30 18:51:52,"Evening Workout",2h 38m,"Squat (Barbell)",2,"102,5",5,0,0,,,
2020-12-30 18:51:52,"Evening Workout",2h 38m,"Plank",1,0,0,0,60,,,
2020-12-30 18:51:52,"Evening Workout",2h 38m,"Rest Timer",Rest Timer,0,0,0,90,,,
2021-01-02 10:00:00,"Morning Run",45m,"Running",1,0,0,5.2,1800,,,
`;

// Android-style export: semicolon-delimited, with Weight Unit / Distance Unit
// columns and a "Workout Duration" column.
const ANDROID_CSV = `Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration
2023-05-10 07:30:00;Push Day;Bench Press;1;225;lbs;5;;0;;0;;;1h 0m
2023-05-10 07:30:00;Push Day;Row (Machine);1;80;kg;10;;0;;0;;;1h 0m
2023-05-10 07:30:00;Push Day;Treadmill;1;0;;0;;3;miles;600;;;1h 0m
`;

describe("parseStrongCSV (iOS export)", () => {
  const parsed = parseStrongCSV(IOS_CSV, KG_UNITS);

  it("skips 'Rest Timer' pseudo-rows and summarizes the rest", () => {
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.summary.workoutCount).toBe(2);
    expect(parsed.summary.exerciseCount).toBe(3);
    expect(parsed.summary.setCount).toBe(4);
  });

  it("normalizes the start date and computes the end from Duration", () => {
    const start = new Date("2020-12-30T18:51:52");
    const first = parsed.rows[0];
    expect(first.startedAt).toBe(start.toISOString());
    expect(first.completedAt).toBe(
      new Date(start.getTime() + (2 * 3600 + 38 * 60) * 1000).toISOString()
    );
  });

  it("accepts comma-decimal weights", () => {
    expect(parsed.rows[1].weight).toBe(102.5);
  });

  it("passes weights through unconverted (iOS export has no unit column)", () => {
    expect(parsed.rows[0].weight).toBe(100);
  });

  it("builds the right set shapes", () => {
    const logs = buildLogsFromNormalizedRows(
      parsed.rows,
      ALL_IMPORT_OPTIONS,
      (name) => `ex-${name}`
    );
    expect(logs).toHaveLength(2);

    const evening = logs[0];
    expect(evening.templateName).toBe("Evening Workout");
    expect(evening.durationSeconds).toBe(9480);
    expect(evening.exercises.map((e) => e.name)).toEqual([
      "Squat (Barbell)",
      "Plank",
    ]);
    expect(evening.exercises[0].sets[0]).toMatchObject({
      type: "reps_weight",
      reps: 5,
      weight: 100,
    });
    expect(evening.exercises[1].sets[0]).toMatchObject({
      type: "time_only",
      time: 60,
    });

    const run = logs[1];
    expect(run.exercises[0].sets[0]).toMatchObject({
      type: "time_distance",
      time: 1800,
      distance: 5.2,
    });
  });

  it("is deterministic: re-parsing yields identical session keys (dedup)", () => {
    const again = parseStrongCSV(IOS_CSV, KG_UNITS);
    expect(sessionKeysFromRows(again.rows)).toEqual(
      sessionKeysFromRows(parsed.rows)
    );
  });
});

describe("parseStrongCSV (Android semicolon export with unit columns)", () => {
  const parsed = parseStrongCSV(ANDROID_CSV, KG_UNITS);

  it("auto-detects the semicolon delimiter", () => {
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.summary.workoutCount).toBe(1);
  });

  it("converts lb weights to the app's kg setting", () => {
    expect(parsed.rows[0].weight).toBe(102.06); // 225 lb
  });

  it("leaves kg weights alone", () => {
    expect(parsed.rows[1].weight).toBe(80);
  });

  it("converts miles to km via the Distance Unit column", () => {
    expect(parsed.rows[2].distance).toBe(4.828); // 3 mi
    expect(parsed.rows[2].timeSeconds).toBe(600);
  });

  it("reads 'Workout Duration' as the duration column", () => {
    const start = new Date("2023-05-10T07:30:00");
    expect(parsed.rows[0].completedAt).toBe(
      new Date(start.getTime() + 3600 * 1000).toISOString()
    );
  });

  it("converts to lbs when the app is set to lbs", () => {
    const lbs = parseStrongCSV(ANDROID_CSV, {
      weightUnit: "lbs",
      distanceUnit: "mi",
    });
    expect(lbs.rows[0].weight).toBe(225); // already lbs
    expect(lbs.rows[1].weight).toBe(176.37); // 80 kg
    expect(lbs.rows[2].distance).toBe(3); // already miles
  });
});

describe("parseStrongCSV (edge cases)", () => {
  it("returns no rows for an empty or unrelated CSV", () => {
    expect(parseStrongCSV("", KG_UNITS).rows).toEqual([]);
    expect(
      parseStrongCSV("foo,bar\n1,2\n", KG_UNITS).rows
    ).toEqual([]);
  });

  it("skips rows with unparseable dates", () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
not-a-date,"W",30m,"Squat",1,100,5,0,0,,,
`;
    expect(parseStrongCSV(csv, KG_UNITS).rows).toEqual([]);
  });
});

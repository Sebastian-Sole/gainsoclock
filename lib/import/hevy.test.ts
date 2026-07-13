import { describe, it, expect } from "vitest";
import { parseHevyCSV, parseHevyDate } from "@/lib/import/hevy";
import {
  ALL_IMPORT_OPTIONS,
  buildLogsFromNormalizedRows,
  sessionKeysFromRows,
  type ImportUnits,
} from "@/lib/import/shared";

const KG_UNITS: ImportUnits = { weightUnit: "kg", distanceUnit: "km" };

// Hand-crafted from the community-documented export header (kg account):
// title,start_time,end_time,description,exercise_title,superset_id,
// exercise_notes,set_index,set_type,weight_kg,reps,distance_km,
// duration_seconds,rpe
// Includes a warmup set, a comma-decimal weight, a superset (A/B interleaved)
// and an ISO-style timestamp on the second workout.
const KG_CSV = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:52","","Bench Press (Barbell)",,"",0,"warmup",60,10,,,
"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:52","","Bench Press (Barbell)",,"",1,"normal","82,5",8,,,8
"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:52","","Lateral Raise",1,"",0,"normal",10,12,,,
"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:52","","Triceps Pushdown",1,"",0,"normal",30,10,,,
"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:52","","Lateral Raise",1,"",1,"normal",10,12,,,
"Push Day","28 Mar 2025, 17:29","28 Mar 2025, 18:52","","Plank",,"",0,"normal",,,,60,
"Morning Run","2025-04-01 08:00:00","2025-04-01 08:45:00","","Running",,"",0,"normal",,,5.2,2700,
`;

// lb account: weight_lbs / distance_miles headers instead.
const LBS_CSV = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
"Leg Day","10 Jun 2024, 08:15","10 Jun 2024, 09:00","","Squat (Barbell)",,"",0,"normal",225,5,,,
"Leg Day","10 Jun 2024, 08:15","10 Jun 2024, 09:00","","Treadmill",,"",0,"normal",,,3,600,
`;

describe("parseHevyDate", () => {
  it("parses the 'DD Mon YYYY, HH:MM' format as local time", () => {
    expect(parseHevyDate("28 Mar 2025, 17:29")?.getTime()).toBe(
      new Date(2025, 2, 28, 17, 29).getTime()
    );
  });

  it("parses ISO-ish timestamps", () => {
    expect(parseHevyDate("2025-04-01 08:00:00")?.getTime()).toBe(
      new Date("2025-04-01T08:00:00").getTime()
    );
  });

  it("returns null on garbage", () => {
    expect(parseHevyDate("someday")).toBeNull();
    expect(parseHevyDate(undefined)).toBeNull();
  });
});

describe("parseHevyCSV (kg export)", () => {
  const parsed = parseHevyCSV(KG_CSV, KG_UNITS);

  it("summarizes workouts, exercises and sets", () => {
    expect(parsed.rows).toHaveLength(7);
    expect(parsed.summary.workoutCount).toBe(2);
    expect(parsed.summary.exerciseCount).toBe(5);
  });

  it("uses start/end times for the session (dedup) key", () => {
    const start = new Date(2025, 2, 28, 17, 29).toISOString();
    const end = new Date(2025, 2, 28, 18, 52).toISOString();
    expect(parsed.rows[0].startedAt).toBe(start);
    expect(parsed.rows[0].completedAt).toBe(end);
  });

  it("accepts comma-decimal weights", () => {
    expect(parsed.rows[1].weight).toBe(82.5);
  });

  it("imports warmup sets like normal sets (no warmup flag in the model)", () => {
    expect(parsed.rows[0]).toMatchObject({ weight: 60, reps: 10, completed: true });
  });

  it("keeps superset exercises in first-seen order (grouping dropped)", () => {
    const logs = buildLogsFromNormalizedRows(
      parsed.rows,
      ALL_IMPORT_OPTIONS,
      (name) => `ex-${name}`
    );
    const push = logs[0];
    expect(push.templateName).toBe("Push Day");
    expect(push.durationSeconds).toBe(83 * 60);
    expect(push.exercises.map((e) => e.name)).toEqual([
      "Bench Press (Barbell)",
      "Lateral Raise",
      "Triceps Pushdown",
      "Plank",
    ]);
    // Interleaved superset rows collapse into per-exercise set lists
    expect(push.exercises[1].sets).toHaveLength(2);
  });

  it("maps duration_seconds and distance_km", () => {
    const plank = parsed.rows[5];
    expect(plank.timeSeconds).toBe(60);

    const run = parsed.rows[6];
    expect(run).toMatchObject({ timeSeconds: 2700, distance: 5.2 });
  });

  it("converts kg to lbs when the app is set to lbs", () => {
    const lbs = parseHevyCSV(KG_CSV, { weightUnit: "lbs", distanceUnit: "mi" });
    expect(lbs.rows[1].weight).toBe(181.88); // 82.5 kg
    expect(lbs.rows[6].distance).toBe(3.231); // 5.2 km
  });

  it("is deterministic: re-parsing yields identical session keys (dedup)", () => {
    const again = parseHevyCSV(KG_CSV, KG_UNITS);
    expect(sessionKeysFromRows(again.rows)).toEqual(
      sessionKeysFromRows(parsed.rows)
    );
  });
});

describe("parseHevyCSV (lb export)", () => {
  const parsed = parseHevyCSV(LBS_CSV, KG_UNITS);

  it("converts weight_lbs to kg", () => {
    expect(parsed.rows[0].weight).toBe(102.06); // 225 lb
  });

  it("converts distance_miles to km", () => {
    expect(parsed.rows[1].distance).toBe(4.828); // 3 mi
    expect(parsed.rows[1].timeSeconds).toBe(600);
  });
});

describe("parseHevyCSV (edge cases)", () => {
  it("returns no rows for empty or unrelated CSVs", () => {
    expect(parseHevyCSV("", KG_UNITS).rows).toEqual([]);
    expect(parseHevyCSV("foo,bar\n1,2\n", KG_UNITS).rows).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  computeAllStats,
  computeExerciseSeries,
  sessionTotals,
  trendAccessibilitySummary,
} from "@/lib/stats";
import type { WorkoutLog, WorkoutLogExercise, WorkoutSet } from "@/lib/types";

// Characterization tests: pin computeAllStats behavior over a fixture log set.
// Covers per-type accumulation for all six set types, PB extraction, and
// totals. Oddities (notably the intervals zero-contribution) are pinned and
// commented. `now` is fixed so current-year math is deterministic. Streaks are
// no longer computed by computeAllStats (see plan 043); that coverage lives in
// lib/streaks.test.ts.
//
// Shape migration (issue #104): ExerciseStats is now keyed by MetricId —
// `totals.reps` / `bests.weight` replace `totalReps` / `maxWeight`, and the
// volume pair is `totalVolume` / `maxVolume`. Every asserted VALUE below is
// unchanged from the pre-migration characterization; only the field access
// moved. Where the old shape pinned `0` for a never-recorded metric, the map
// now simply has no key (asserted as undefined).

const NOW = new Date("2026-06-10T12:00:00Z");

function exercise(
  exerciseId: string,
  name: string,
  sets: WorkoutSet[]
): WorkoutLogExercise {
  return {
    id: `wle-${exerciseId}`,
    exerciseId,
    name,
    type: "reps_weight", // denormalized display field; not read by the stats math
    metrics: ["weight", "reps"],
    order: 0,
    restTimeSeconds: 60,
    sets,
  };
}

function log(
  id: string,
  startedAt: string,
  durationSeconds: number,
  exercises: WorkoutLogExercise[]
): WorkoutLog {
  return {
    id,
    templateName: "Test",
    exercises,
    startedAt,
    completedAt: startedAt,
    durationSeconds,
  };
}

// One exercise per set type, all sets completed, single log.
const SQUAT = exercise("squat", "Squat", [
  { id: "s1", type: "reps_weight", reps: 5, weight: 100, completed: true },
  { id: "s2", type: "reps_weight", reps: 5, weight: 120, completed: true },
]);
const PLANK_REPS_TIME = exercise("plankrt", "Weighted Plank", [
  { id: "rt1", type: "reps_time", reps: 3, time: 30, completed: true },
]);
const PLANK = exercise("plank", "Plank", [
  { id: "t1", type: "time_only", time: 60, completed: true },
]);
const RUN = exercise("run", "Run", [
  { id: "td1", type: "time_distance", time: 1800, distance: 5, completed: true },
]);
const PUSHUP = exercise("pushup", "Push-up", [
  { id: "r1", type: "reps_only", reps: 20, completed: true },
]);
const INTERVAL_RUN = exercise("ivl", "Interval Run", [
  {
    id: "i1",
    type: "intervals",
    variant: "work",
    metric: "distance",
    time: 120,
    distanceUnit: "km",
    distance: 0.4,
    completed: true,
  },
]);

const LOG = log("log1", "2026-06-10T08:00:00Z", 3600, [
  SQUAT,
  PLANK_REPS_TIME,
  PLANK,
  RUN,
  PUSHUP,
  INTERVAL_RUN,
]);

function statsFor(name: string) {
  const all = computeAllStats([LOG], NOW);
  const s = all.exerciseStats.find((e) => e.exerciseName === name);
  if (!s) throw new Error(`no stats for ${name}`);
  return s;
}

describe("computeAllStats — empty input", () => {
  it("returns zeroed totals and no exercise stats", () => {
    const all = computeAllStats([], NOW);
    expect(all.exerciseStats).toEqual([]);
    expect(all.totals.totalWorkouts).toBe(0);
    expect(all.totals.totalSets).toBe(0);
    expect(all.bestMonth).toBeNull();
    expect(all.bestYear).toBeNull();
  });
});

describe("computeAllStats — per-type accumulation", () => {
  it("reps_weight: reps total and volume (sum reps*weight); PBs from max set", () => {
    const s = statsFor("Squat");
    expect(s.totals.reps).toBe(10); // 5 + 5
    expect(s.totalVolume).toBe(1100); // 5*100 + 5*120
    expect(s.totalSets).toBe(2);
    expect(s.bests.weight?.value).toBe(120);
    expect(s.bests.reps?.value).toBe(5);
    expect(s.maxVolume?.value).toBe(600); // best single set: 5*120
    expect(s.metricIds).toEqual(["weight", "reps"]); // observed, palette order
  });

  it("reps_time: reps and duration totals; duration PB", () => {
    const s = statsFor("Weighted Plank");
    expect(s.totals.reps).toBe(3);
    expect(s.totals.duration).toBe(30);
    expect(s.bests.duration?.value).toBe(30);
    expect(s.bests.reps?.value).toBe(3);
    expect(s.bests.weight).toBeUndefined(); // no weight on reps_time sets
  });

  it("time_only: duration total only; duration PB", () => {
    const s = statsFor("Plank");
    expect(s.totals.duration).toBe(60);
    expect(s.totals.reps).toBeUndefined(); // never recorded (was 0)
    expect(s.bests.duration?.value).toBe(60);
  });

  it("time_distance: duration and distance totals; duration + distance PBs", () => {
    const s = statsFor("Run");
    expect(s.totals.duration).toBe(1800);
    expect(s.totals.distance).toBe(5);
    expect(s.bests.duration?.value).toBe(1800);
    expect(s.bests.distance?.value).toBe(5);
  });

  it("reps_only: reps total only; reps PB", () => {
    const s = statsFor("Push-up");
    expect(s.totals.reps).toBe(20);
    expect(s.totals.duration).toBeUndefined();
    expect(s.totalVolume).toBe(0);
    expect(s.bests.reps?.value).toBe(20);
  });

  it("intervals: work-variant time/distance counted in totals (plan 011)", () => {
    // Plan 011 added the `intervals` branch to computeExerciseStats/computeTotals:
    // work-variant interval sets contribute their `time` to the duration total,
    // and their `distance` to the distance total when `metric === 'distance'`.
    // Rest-variant intervals contribute nothing. The set still bumps totalSets
    // and feeds duration/distance PBs as before.
    const s = statsFor("Interval Run");
    expect(s.totalSets).toBe(1); // completed set still counts
    expect(s.totals.reps).toBeUndefined();
    expect(s.totalVolume).toBe(0);
    expect(s.totals.duration).toBe(120); // work-variant time counted (plan 011)
    expect(s.totals.distance).toBe(0.4); // metric==='distance' work set counted (plan 011)
    expect(s.bests.duration?.value).toBe(120); // PB tracking still fires
    expect(s.bests.distance?.value).toBe(0.4);
  });

  it("intervals: residual distance is NOT counted after switching to a non-distance metric", () => {
    // The interval UI keeps every value field on the flat set; switching the
    // effort metric (distance → pace/speed) must not leave the old distance
    // feeding totals/PBs. Interval distance only counts when it is the
    // selected metric. The selected metric (pace here) now DOES count — pace
    // was invisible to stats before the registry generalization.
    const stale = exercise("stale", "Stale Interval", [
      {
        id: "sw",
        type: "intervals",
        variant: "work",
        metric: "pace",
        paceSeconds: 300,
        time: 120,
        distanceUnit: "km",
        distance: 2.5, // residual from before the metric switch
        completed: true,
      },
    ]);
    const all = computeAllStats([log("logStale", "2026-06-10T09:00:00Z", 600, [stale])], NOW);
    const s = all.exerciseStats.find((e) => e.exerciseName === "Stale Interval")!;
    expect(s.totals.distance).toBeUndefined();
    expect(s.bests.distance).toBeUndefined();
    expect(all.totals.totalDistance).toBe(0);
    // Non-distance fields are unaffected.
    expect(s.totals.duration).toBe(120);
    // The selected interval metric is now visible in stats.
    expect(s.bests.pace?.value).toBe(300);
  });
});

describe("computeAllStats — totals", () => {
  it("totals aggregate completed sets across all exercises; duration from log", () => {
    const all = computeAllStats([LOG], NOW);
    const t = all.totals;
    expect(t.totalWorkouts).toBe(1);
    expect(t.totalTimeSeconds).toBe(3600); // from log.durationSeconds, not set times
    // totalSets: 2 (squat) + 1 + 1 + 1 + 1 + 1 (interval) = 7
    expect(t.totalSets).toBe(7);
    // totalReps: 10 (squat) + 3 (reps_time) + 20 (reps_only) = 33
    // (time_only, time_distance, intervals add no reps)
    expect(t.totalReps).toBe(33);
    // totalWeightLifted: only reps_weight -> 1100
    expect(t.totalWeightLifted).toBe(1100);
    // totalDistance: time_distance (5) + work-variant interval, metric distance (0.4) = 5.4 (plan 011)
    expect(t.totalDistance).toBe(5.4);
  });

  it("incomplete sets are excluded from totals", () => {
    const partial = log("log2", "2026-06-09T08:00:00Z", 600, [
      exercise("squat2", "Squat", [
        { id: "c", type: "reps_weight", reps: 5, weight: 50, completed: true },
        { id: "i", type: "reps_weight", reps: 5, weight: 999, completed: false },
      ]),
    ]);
    const all = computeAllStats([partial], NOW);
    expect(all.totals.totalSets).toBe(1);
    expect(all.totals.totalWeightLifted).toBe(250); // 5*50 only
    const s = all.exerciseStats.find((e) => e.exerciseName === "Squat")!;
    expect(s.bests.weight?.value).toBe(50); // the 999 set was not completed
  });
});

// Composed ('metrics') exercises accumulate flat fields the same way — no
// per-type branch. A cardio machine contributes its duration/distance; power
// and heart rate are avg metrics and don't pollute the volume/rep totals.
function metricsExercise(
  exerciseId: string,
  name: string,
  metrics: WorkoutLogExercise["metrics"],
  sets: WorkoutSet[]
): WorkoutLogExercise {
  return {
    id: `wle-${exerciseId}`,
    exerciseId,
    name,
    type: "metrics",
    metrics,
    order: 0,
    restTimeSeconds: 0,
    sets,
  };
}

describe("computeAllStats — composed metrics exercises", () => {
  it("Watts Bike: duration/distance totals; power/HR don't add reps or volume", () => {
    const bike = metricsExercise(
      "bike",
      "Watts Bike",
      ["duration", "power_avg", "distance", "heart_rate_avg"],
      [
        {
          id: "b1",
          type: "metrics",
          time: 600,
          powerAvg: 220,
          distance: 4.2,
          heartRateAvg: 150,
          completed: true,
        },
      ]
    );
    const all = computeAllStats([log("l", "2026-06-10T08:00:00Z", 700, [bike])], NOW);
    const s = all.exerciseStats.find((e) => e.exerciseName === "Watts Bike")!;
    expect(s.totals.duration).toBe(600);
    expect(s.totals.distance).toBe(4.2);
    expect(s.totals.reps).toBeUndefined();
    expect(s.totalVolume).toBe(0); // no weight metric → no volume
    expect(s.bests.distance?.value).toBe(4.2);
    expect(all.totals.totalDistance).toBe(4.2);
    expect(all.totals.totalWeightLifted).toBe(0);
    // Registry-driven behavior: power is a real PB now (was invisible before
    // the generalization); avg metrics never enter the sum totals; HR has
    // prDirection 'none' so it gets no PB.
    expect(s.bests.power_avg?.value).toBe(220);
    expect(s.totals.power_avg).toBeUndefined();
    expect(s.bests.heart_rate_avg).toBeUndefined();
    expect(s.metricIds).toEqual(["duration", "distance", "power_avg", "heart_rate_avg"]);
  });

  it("composed weight+reps exercise counts volume and weight PB like a legacy strength set", () => {
    const lift = metricsExercise("dl", "Deadlift", ["weight", "reps"], [
      { id: "d1", type: "metrics", weight: 140, reps: 3, completed: true },
    ]);
    const all = computeAllStats([log("l", "2026-06-10T08:00:00Z", 700, [lift])], NOW);
    const s = all.exerciseStats.find((e) => e.exerciseName === "Deadlift")!;
    expect(s.totalVolume).toBe(420); // 140*3
    expect(s.bests.weight?.value).toBe(140);
    expect(s.maxVolume?.value).toBe(420);
    expect(all.totals.totalWeightLifted).toBe(420);
  });

  it("calories sum into a lifetime total but get no PB (prDirection 'none')", () => {
    const erg = metricsExercise("erg", "Ski Erg", ["duration", "calories"], [
      { id: "e1", type: "metrics", time: 300, calories: 55, completed: true },
      { id: "e2", type: "metrics", time: 300, calories: 45, completed: true },
    ]);
    const all = computeAllStats([log("l", "2026-06-10T08:00:00Z", 700, [erg])], NOW);
    const s = all.exerciseStats.find((e) => e.exerciseName === "Ski Erg")!;
    expect(s.totals.calories).toBe(100);
    expect(s.bests.calories).toBeUndefined();
  });
});

describe("computeAllStats — prDirection 'lower' (pace)", () => {
  it("best pace is the MINIMUM across sessions, and 0 is ignored as unset", () => {
    const row = (id: string, date: string, pace: number) =>
      log(id, date, 1200, [
        metricsExercise("row", "Rowing", ["duration", "pace"], [
          { id: `${id}-s`, type: "metrics", time: 1200, paceSeconds: pace, completed: true },
        ]),
      ]);
    const all = computeAllStats(
      [
        row("r1", "2026-06-01T08:00:00Z", 130),
        row("r2", "2026-06-03T08:00:00Z", 118), // fastest — the PB
        row("r3", "2026-06-05T08:00:00Z", 125),
        row("r4", "2026-06-07T08:00:00Z", 0), // unset default, must not win
      ],
      NOW
    );
    const s = all.exerciseStats.find((e) => e.exerciseName === "Rowing")!;
    expect(s.bests.pace?.value).toBe(118);
    expect(s.bests.pace?.date).toBe("2026-06-03T08:00:00Z");
    // avg metrics never sum into totals
    expect(s.totals.pace).toBeUndefined();
  });
});

// ---- Progression series ----

describe("computeExerciseSeries", () => {
  const benchLog = (id: string, date: string, sets: WorkoutSet[]) =>
    log(id, date, 3600, [metricsExercise("bench", "Bench Press", ["weight", "reps"], sets)]);

  it("emits one point per session per metric, chronologically, even from unsorted logs", () => {
    const series = computeExerciseSeries(
      [
        // deliberately out of order
        benchLog("b2", "2026-06-08T08:00:00Z", [
          { id: "x1", type: "metrics", weight: 105, reps: 5, completed: true },
        ]),
        benchLog("b1", "2026-06-01T08:00:00Z", [
          { id: "y1", type: "metrics", weight: 100, reps: 5, completed: true },
          { id: "y2", type: "metrics", weight: 102.5, reps: 3, completed: true },
        ]),
      ],
      "bench"
    );
    // weight aggregation is 'none' → session value = best (heaviest) set
    expect(series.weight).toEqual([
      { date: "2026-06-01T08:00:00Z", value: 102.5 },
      { date: "2026-06-08T08:00:00Z", value: 105 },
    ]);
    // reps aggregation is 'sum' → session total
    expect(series.reps).toEqual([
      { date: "2026-06-01T08:00:00Z", value: 8 },
      { date: "2026-06-08T08:00:00Z", value: 5 },
    ]);
  });

  it("avg metrics average the session's sets; zero 'lower' values are ignored", () => {
    const series = computeExerciseSeries(
      [
        log("r1", "2026-06-01T08:00:00Z", 1200, [
          metricsExercise("row", "Rowing", ["pace"], [
            { id: "p1", type: "metrics", paceSeconds: 120, completed: true },
            { id: "p2", type: "metrics", paceSeconds: 130, completed: true },
            { id: "p3", type: "metrics", paceSeconds: 0, completed: true }, // unset
          ]),
        ]),
      ],
      "row"
    );
    expect(series.pace).toEqual([{ date: "2026-06-01T08:00:00Z", value: 125 }]);
  });

  it("excludes incomplete sets, rest intervals, and stale interval distance", () => {
    const series = computeExerciseSeries(
      [
        log("i1", "2026-06-01T08:00:00Z", 1200, [
          exercise("ivl", "Interval Run", [
            { id: "w", type: "intervals", variant: "work", metric: "pace", paceSeconds: 300, time: 120, distance: 2.5, distanceUnit: "km", completed: true },
            { id: "r", type: "intervals", variant: "rest", metric: "pace", time: 60, completed: true },
            { id: "n", type: "intervals", variant: "work", metric: "pace", paceSeconds: 280, time: 120, distanceUnit: "km", completed: false },
          ]),
        ]),
      ],
      "ivl"
    );
    expect(series.pace).toEqual([{ date: "2026-06-01T08:00:00Z", value: 300 }]);
    expect(series.distance).toBeUndefined(); // stale — pace is the selected metric
    expect(series.duration).toEqual([{ date: "2026-06-01T08:00:00Z", value: 120 }]); // work only
  });

  it("returns an empty map for an exercise with no logs", () => {
    expect(computeExerciseSeries([LOG], "nope")).toEqual({});
  });
});

describe("trendAccessibilitySummary", () => {
  const fmt = (v: number) => `${v} kg`;

  it("summarizes an upward trend with percent, span, latest, and count", () => {
    const label = trendAccessibilitySummary(
      "Bench Press estimated 1RM",
      [
        { date: "2026-03-01T08:00:00Z", value: 85 },
        { date: "2026-04-15T08:00:00Z", value: 90 },
        { date: "2026-06-01T08:00:00Z", value: 92 },
      ],
      fmt
    );
    // 85 → 92 is +8.2% ≈ 8%, 92 days ≈ 3 months
    expect(label).toBe(
      "Bench Press estimated 1RM, up 8% over 3 months, latest 92 kg, 3 sessions"
    );
  });

  it("summarizes a downward trend (down can be an improvement for pace)", () => {
    const label = trendAccessibilitySummary(
      "Rowing pace",
      [
        { date: "2026-06-01T08:00:00Z", value: 130 },
        { date: "2026-06-08T08:00:00Z", value: 117 },
      ],
      (v) => `${v} s`
    );
    expect(label).toBe("Rowing pace, down 10% over 7 days, latest 117 s, 2 sessions");
  });

  it("reports steady when the change rounds to 0%", () => {
    const label = trendAccessibilitySummary(
      "Squat weight",
      [
        { date: "2026-06-01T08:00:00Z", value: 100 },
        { date: "2026-06-05T08:00:00Z", value: 100.2 },
      ],
      fmt
    );
    expect(label).toContain("steady over 4 days");
  });

  it("handles single-point and empty series without percent math", () => {
    expect(
      trendAccessibilitySummary("Squat weight", [{ date: "2026-06-01T08:00:00Z", value: 100 }], fmt)
    ).toBe("Squat weight, one session in the selected range, latest 100 kg");
    expect(trendAccessibilitySummary("Squat weight", [], fmt)).toBe(
      "Squat weight, no data in the selected range"
    );
  });
});

// sessionTotals: the summary-screen helper shares the aggregate stats'
// exclusions (completed-only, rest intervals, stale interval distance).
describe("sessionTotals", () => {
  it("sums volume/distance/reps/time over completed sets with shared exclusions", () => {
    const totals = sessionTotals([
      {
        sets: [
          { id: "a", type: "metrics", weight: 100, reps: 5, completed: true },
          { id: "b", type: "metrics", weight: 999, reps: 5, completed: false }, // not completed
        ],
      },
      {
        sets: [
          { id: "c", type: "metrics", time: 600, distance: 4.2, completed: true },
          {
            id: "d",
            type: "intervals",
            variant: "rest", // rest sub-set contributes nothing
            metric: "distance",
            time: 30,
            distanceUnit: "km",
            distance: 1,
            completed: true,
          },
          {
            id: "e",
            type: "intervals",
            variant: "work",
            metric: "pace", // residual distance not counted
            paceSeconds: 300,
            time: 120,
            distanceUnit: "km",
            distance: 2.5,
            completed: true,
          },
        ],
      },
    ]);
    expect(totals.volume).toBe(500);
    expect(totals.distance).toBe(4.2);
    expect(totals.reps).toBe(5);
    expect(totals.time).toBe(720); // 600 + interval work 120
  });

  it("returns zeros for an empty session", () => {
    expect(sessionTotals([])).toEqual({ volume: 0, distance: 0, reps: 0, time: 0 });
  });
});

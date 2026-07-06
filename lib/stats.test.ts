import { describe, it, expect } from "vitest";
import { computeAllStats } from "@/lib/stats";
import type { WorkoutLog, WorkoutLogExercise, WorkoutSet } from "@/lib/types";

// Characterization tests: pin CURRENT computeAllStats behavior over a fixture
// log set. Covers per-type accumulation for all six set types, PB extraction,
// and totals. Oddities (notably the intervals zero-contribution) are pinned and
// commented. `now` is fixed so current-year math is deterministic. Streaks are
// no longer computed by computeAllStats (see plan 043); that coverage lives in
// lib/streaks.test.ts.

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
  it("reps_weight: totalReps and totalWeight (sum reps*weight); PBs from max set", () => {
    const s = statsFor("Squat");
    expect(s.totalReps).toBe(10); // 5 + 5
    expect(s.totalWeight).toBe(1100); // 5*100 + 5*120
    expect(s.totalSets).toBe(2);
    expect(s.maxWeight?.value).toBe(120);
    expect(s.maxReps?.value).toBe(5);
    expect(s.maxVolume?.value).toBe(600); // best single set: 5*120
  });

  it("reps_time: totalReps and totalTime; maxTime PB", () => {
    const s = statsFor("Weighted Plank");
    expect(s.totalReps).toBe(3);
    expect(s.totalTime).toBe(30);
    expect(s.maxTime?.value).toBe(30);
    expect(s.maxReps?.value).toBe(3);
    expect(s.maxWeight).toBeUndefined(); // no weight on reps_time sets
  });

  it("time_only: totalTime only; maxTime PB", () => {
    const s = statsFor("Plank");
    expect(s.totalTime).toBe(60);
    expect(s.totalReps).toBe(0);
    expect(s.maxTime?.value).toBe(60);
  });

  it("time_distance: totalTime and totalDistance; maxTime + maxDistance PBs", () => {
    const s = statsFor("Run");
    expect(s.totalTime).toBe(1800);
    expect(s.totalDistance).toBe(5);
    expect(s.maxTime?.value).toBe(1800);
    expect(s.maxDistance?.value).toBe(5);
  });

  it("reps_only: totalReps only; maxReps PB", () => {
    const s = statsFor("Push-up");
    expect(s.totalReps).toBe(20);
    expect(s.totalTime).toBe(0);
    expect(s.totalWeight).toBe(0);
    expect(s.maxReps?.value).toBe(20);
  });

  it("intervals: work-variant time/distance counted in totals (plan 011)", () => {
    // Plan 011 added the `intervals` branch to computeExerciseStats/computeTotals:
    // work-variant interval sets contribute their `time` to totalTime, and their
    // `distance` to totalDistance when `metric === 'distance'`. Rest-variant
    // intervals contribute nothing. The set still bumps totalSets and feeds
    // maxTime/maxDistance PBs as before.
    const s = statsFor("Interval Run");
    expect(s.totalSets).toBe(1); // completed set still counts
    expect(s.totalReps).toBe(0);
    expect(s.totalWeight).toBe(0);
    expect(s.totalTime).toBe(120); // work-variant time counted (plan 011)
    expect(s.totalDistance).toBe(0.4); // metric==='distance' work set counted (plan 011)
    expect(s.maxTime?.value).toBe(120); // PB tracking still fires
    expect(s.maxDistance?.value).toBe(0.4);
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
    expect(s.maxWeight?.value).toBe(50); // the 999 set was not completed
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
  it("Watts Bike: duration→totalTime, distance→totalDistance; power/HR don't add reps or volume", () => {
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
    expect(s.totalTime).toBe(600);
    expect(s.totalDistance).toBe(4.2);
    expect(s.totalReps).toBe(0);
    expect(s.totalWeight).toBe(0); // no weight metric → no volume
    expect(s.maxDistance?.value).toBe(4.2);
    expect(all.totals.totalDistance).toBe(4.2);
    expect(all.totals.totalWeightLifted).toBe(0);
  });

  it("composed weight+reps exercise counts volume and weight PB like a legacy strength set", () => {
    const lift = metricsExercise("dl", "Deadlift", ["weight", "reps"], [
      { id: "d1", type: "metrics", weight: 140, reps: 3, completed: true },
    ]);
    const all = computeAllStats([log("l", "2026-06-10T08:00:00Z", 700, [lift])], NOW);
    const s = all.exerciseStats.find((e) => e.exerciseName === "Deadlift")!;
    expect(s.totalWeight).toBe(420); // 140*3
    expect(s.maxWeight?.value).toBe(140);
    expect(s.maxVolume?.value).toBe(420);
    expect(all.totals.totalWeightLifted).toBe(420);
  });
});

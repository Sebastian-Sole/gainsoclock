import type { AhaWorkout } from "@/lib/aha-schema";

// Static safety-net session served when the aha action exhausts retries or
// the client hits the p99 hard-kill. Conforms to `AhaWorkout`.
export const FALLBACK_SESSION: AhaWorkout = {
  intro: "Here's your first session — let's start.",
  warmup: {
    exercises: [
      {
        exerciseId: "cat-cow",
        sets: 1,
        reps: 10,
        restSeconds: 30,
        coachingNote: "Move slowly between arched and rounded spine.",
      },
      {
        exerciseId: "world-greatest-stretch",
        sets: 1,
        reps: 6,
        restSeconds: 30,
        coachingNote: "Alternate sides, 3 reps per side.",
      },
    ],
  },
  workout: {
    name: "Starter bodyweight",
    targetMuscleGroups: ["lower-body", "upper-body", "core"],
    durationMinutes: 20,
    exercises: [
      {
        exerciseId: "bodyweight-squat",
        sets: 3,
        reps: 10,
        restSeconds: 60,
        coachingNote: "RPE 6 — last 2 reps should feel challenging but clean.",
      },
      {
        exerciseId: "push-up",
        sets: 3,
        reps: 8,
        restSeconds: 60,
        coachingNote: "Modify on knees if needed.",
      },
      {
        exerciseId: "inverted-row",
        sets: 3,
        reps: 8,
        restSeconds: 60,
        coachingNote: "Use a sturdy table; keep the body straight.",
      },
    ],
  },
  cooldown: {
    exercises: [
      {
        exerciseId: "childs-pose",
        sets: 1,
        reps: 1,
        restSeconds: 30,
        coachingNote: "Hold 60 seconds, breathe slowly.",
      },
      {
        exerciseId: "hamstring-stretch-supine",
        sets: 1,
        reps: 2,
        restSeconds: 30,
        coachingNote: "30 seconds per leg.",
      },
    ],
  },
};

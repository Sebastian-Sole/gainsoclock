// Runtime types + narrow for the aha workout payload. The Convex
// `onboardingAha.workout` column is typed `v.any()` because streaming writes
// overwrite the full JSON blob each 250ms tick; the client only parses on
// `status: "complete"`.

export type AhaExercise = {
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  coachingNote: string;
};

export type AhaWorkout = {
  intro: string;
  warmup: { exercises: AhaExercise[] };
  workout: {
    name: string;
    targetMuscleGroups: string[];
    durationMinutes: number;
    exercises: AhaExercise[];
  };
  cooldown: { exercises: AhaExercise[] };
};

function isExercise(v: unknown): v is AhaExercise {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.exerciseId === "string" &&
    typeof o.sets === "number" &&
    typeof o.reps === "number" &&
    typeof o.restSeconds === "number" &&
    typeof o.coachingNote === "string"
  );
}

function isExerciseArray(v: unknown): v is AhaExercise[] {
  return Array.isArray(v) && v.every(isExercise);
}

export function parseAhaWorkout(raw: unknown): AhaWorkout | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.intro !== "string") return null;
  const warmup = o.warmup as Record<string, unknown> | undefined;
  const workout = o.workout as Record<string, unknown> | undefined;
  const cooldown = o.cooldown as Record<string, unknown> | undefined;
  if (!warmup || !isExerciseArray(warmup.exercises)) return null;
  if (!cooldown || !isExerciseArray(cooldown.exercises)) return null;
  if (!workout) return null;
  if (typeof workout.name !== "string") return null;
  if (!Array.isArray(workout.targetMuscleGroups)) return null;
  if (!workout.targetMuscleGroups.every((s) => typeof s === "string"))
    return null;
  if (typeof workout.durationMinutes !== "number") return null;
  if (!isExerciseArray(workout.exercises)) return null;
  return {
    intro: o.intro,
    warmup: { exercises: warmup.exercises },
    workout: {
      name: workout.name,
      targetMuscleGroups: workout.targetMuscleGroups as string[],
      durationMinutes: workout.durationMinutes,
      exercises: workout.exercises,
    },
    cooldown: { exercises: cooldown.exercises },
  };
}

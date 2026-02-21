import Papa from 'papaparse';
import { generateId } from '@/lib/id';
import type {
  ExerciseType,
  WorkoutLog,
  WorkoutLogExercise,
  WorkoutSet,
} from '@/lib/types';

// Raw CSV row from FitNotes export
export interface FitNotesRow {
  Name: string;
  StartTime: string;
  EndTime: string;
  BodyWeight: string;
  Exercise: string;
  Equipment: string;
  Reps: string;
  Weight: string;
  Time: string;
  Distance: string;
  Status: string;
  IsWarmup: string;
  RPE: string;
  RIR: string;
  Categories: string;
  Note: string;
}

export interface FitNotesImportOptions {
  exercises: boolean;
  setsAndReps: boolean;
  weightAndTime: boolean;
  completionStatus: boolean;
}

export const ALL_IMPORT_OPTIONS: FitNotesImportOptions = {
  exercises: true,
  setsAndReps: true,
  weightAndTime: true,
  completionStatus: true,
};

export interface FitNotesSummary {
  workoutCount: number;
  exerciseCount: number;
  setCount: number;
  dateRange: { earliest: string; latest: string } | null;
}

export interface ParsedFitNotesData {
  rows: FitNotesRow[];
  summary: FitNotesSummary;
}

// Unique exercises found in the CSV
export interface FitNotesExercise {
  name: string;
  type: ExerciseType;
}

function determineExerciseType(row: FitNotesRow): ExerciseType {
  const hasReps = row.Reps !== '' && row.Reps !== undefined;
  const hasWeight = row.Weight !== '' && row.Weight !== undefined;
  const hasTime = row.Time !== '' && row.Time !== undefined;
  const hasDistance = row.Distance !== '' && row.Distance !== undefined;

  if (hasReps && hasWeight) return 'reps_weight';
  if (hasReps && hasTime) return 'reps_time';
  if (hasTime && hasDistance) return 'time_distance';
  if (hasTime) return 'time_only';
  return 'reps_only';
}

/**
 * Parse the FitNotes CSV string into typed rows + a summary.
 */
export function parseFitNotesCSV(csvString: string): ParsedFitNotesData {
  const result = Papa.parse<FitNotesRow>(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = result.data;

  // Build summary
  const workoutKeys = new Set<string>();
  const exerciseNames = new Set<string>();
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const row of rows) {
    workoutKeys.add(`${row.StartTime}|${row.EndTime}`);
    exerciseNames.add(row.Exercise);
    const start = new Date(row.StartTime);
    if (!earliest || start < earliest) earliest = start;
    if (!latest || start > latest) latest = start;
  }

  return {
    rows,
    summary: {
      workoutCount: workoutKeys.size,
      exerciseCount: exerciseNames.size,
      setCount: rows.length,
      dateRange:
        earliest && latest
          ? {
              earliest: earliest.toISOString(),
              latest: latest.toISOString(),
            }
          : null,
    },
  };
}

/**
 * Convert parsed FitNotes rows into WorkoutLog objects.
 * exerciseResolver maps exercise name → exerciseId (from exercise library store).
 */
export function buildWorkoutLogs(
  rows: FitNotesRow[],
  options: FitNotesImportOptions,
  exerciseResolver: (name: string, type: ExerciseType) => string
): WorkoutLog[] {
  // Group rows by workout (StartTime+EndTime identifies a single workout)
  const workoutMap = new Map<string, FitNotesRow[]>();
  for (const row of rows) {
    const key = `${row.StartTime}|${row.EndTime}`;
    if (!workoutMap.has(key)) {
      workoutMap.set(key, []);
    }
    workoutMap.get(key)!.push(row);
  }

  const logs: WorkoutLog[] = [];

  for (const [, workoutRows] of workoutMap) {
    const first = workoutRows[0];
    const startedAt = first.StartTime;
    const completedAt = first.EndTime;
    const durationSeconds = Math.round(
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
    );

    let exercises: WorkoutLogExercise[] = [];

    if (options.exercises) {
      // Group rows by exercise name within this workout (preserving order)
      const exerciseMap = new Map<string, FitNotesRow[]>();
      for (const row of workoutRows) {
        if (!exerciseMap.has(row.Exercise)) {
          exerciseMap.set(row.Exercise, []);
        }
        exerciseMap.get(row.Exercise)!.push(row);
      }

      let exerciseOrder = 0;
      for (const [exerciseName, setRows] of exerciseMap) {
        const exerciseType = determineExerciseType(setRows[0]);
        const exerciseId = exerciseResolver(exerciseName, exerciseType);

        const sets: WorkoutSet[] = setRows.map((row) => {
          const type = determineExerciseType(row);
          const completed = options.completionStatus
            ? row.Status === 'Done'
            : true;

          return buildSet(type, row, completed, options);
        });

        exercises.push({
          id: generateId(),
          exerciseId,
          name: exerciseName,
          type: exerciseType,
          order: exerciseOrder++,
          restTimeSeconds: 90,
          sets: options.setsAndReps ? sets : [],
        });
      }
    }

    logs.push({
      id: generateId(),
      templateName: first.Name,
      exercises,
      startedAt,
      completedAt,
      durationSeconds,
    });
  }

  // Sort oldest first for import order
  logs.sort(
    (a, b) =>
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  return logs;
}

/**
 * Parse FitNotes time format (HH:MM:SS or MM:SS) into seconds.
 */
function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(timeStr) || 0;
}

function buildSet(
  type: ExerciseType,
  row: FitNotesRow,
  completed: boolean,
  options: FitNotesImportOptions
): WorkoutSet {
  const id = generateId();
  const reps = row.Reps ? parseInt(row.Reps, 10) : 0;
  const weight = row.Weight ? parseFloat(row.Weight) : 0;
  const time = parseTimeToSeconds(row.Time);
  const distance = row.Distance ? parseFloat(row.Distance) : 0;

  const applyWeight = options.weightAndTime;

  switch (type) {
    case 'reps_weight':
      return {
        id,
        completed,
        type: 'reps_weight',
        reps: reps,
        weight: applyWeight ? weight : 0,
      };
    case 'reps_time':
      return {
        id,
        completed,
        type: 'reps_time',
        reps: reps,
        time: applyWeight ? time : 0,
      };
    case 'time_only':
      return {
        id,
        completed,
        type: 'time_only',
        time: applyWeight ? time : 0,
      };
    case 'time_distance':
      return {
        id,
        completed,
        type: 'time_distance',
        time: applyWeight ? time : 0,
        distance: applyWeight ? distance : 0,
      };
    case 'reps_only':
      return {
        id,
        completed,
        type: 'reps_only',
        reps: reps,
      };
  }
}

// Shared core for workout-history importers (FitNotes, Strong, Hevy, generic
// CSV). Source-specific parsers normalize their rows into `NormalizedSetRow`;
// `buildLogsFromNormalizedRows` then produces `WorkoutLog` objects with the
// exact shape the original FitNotes importer creates, so every source flows
// through the same import/dedup/template pipeline.
import Papa from 'papaparse';
import { generateId } from '@/lib/id';
import { metricsForLegacyType } from '@/lib/metrics';
import { parseLocaleNumber } from '@/lib/format';
import type {
  ExerciseType,
  WorkoutLog,
  WorkoutLogExercise,
  WorkoutSet,
} from '@/lib/types';

// What the user chose to import. Shared by every source screen.
export interface ImportOptions {
  exercises: boolean;
  setsAndReps: boolean;
  weightAndTime: boolean;
  completionStatus: boolean;
}

export const ALL_IMPORT_OPTIONS: ImportOptions = {
  exercises: true,
  setsAndReps: true,
  weightAndTime: true,
  completionStatus: true,
};

export interface ImportSummary {
  workoutCount: number;
  exerciseCount: number;
  setCount: number;
  dateRange: { earliest: string; latest: string } | null;
}

// The app's configured display units. Weights/distances are stored in these
// units, so parsers convert when (and only when) the source declares its own.
export interface ImportUnits {
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'mi';
}

// One set, normalized. `workoutKey` groups rows into a session; startedAt /
// completedAt are ISO strings and double as the dedup key.
export interface NormalizedSetRow {
  workoutKey: string;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  exercise: string;
  completed: boolean;
  reps?: number;
  weight?: number;
  timeSeconds?: number;
  distance?: number;
}

export interface ParsedImport {
  rows: NormalizedSetRow[];
  summary: ImportSummary;
}

export type ExerciseResolver = (name: string, type: ExerciseType) => string;

// Source-agnostic handle the import flow UI works with. Each source screen's
// `parse` returns one of these (see toParsedCsvImport / toFitNotesImport).
export interface ParsedCsvImport {
  setCount: number;
  summary: ImportSummary;
  /** Distinct "startedAt|completedAt" keys, for duplicate detection. */
  sessionKeys: string[];
  buildLogs: (options: ImportOptions, resolver: ExerciseResolver) => WorkoutLog[];
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Parse a CSV string into header-keyed records. Delimiter is auto-detected
 * (Strong's Android export is semicolon-separated). */
export function parseCsvRecords(csvString: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

/** "Workout Name" → "workoutname". Used so header matching survives case,
 * spacing, and underscore differences between exports. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Re-key a record by normalized header names, trimming values. When two
 * headers normalize to the same key the first one wins. */
export function normalizeRecord(
  record: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const norm = normalizeHeader(key);
    if (!(norm in out) && typeof value === 'string') {
      out[norm] = value.trim();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

/** Numeric cell, accepting both "82.5" and "82,5". Null on empty/invalid. */
export function parseNumericCell(value: string | undefined): number | null {
  if (value === undefined) return null;
  return parseLocaleNumber(value);
}

/** Exports write 0 for "not tracked" — treat non-positive values as absent. */
export function positiveOrUndefined(n: number | null): number | undefined {
  return n !== null && n > 0 ? n : undefined;
}

/** Parse an ISO-ish timestamp ("YYYY-MM-DD HH:MM:SS" or full ISO). Null when
 * unparseable — callers skip the row rather than invent a date. */
export function tryParseIsoLike(ts: string | undefined): Date | null {
  if (!ts) return null;
  const trimmed = ts.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

/** Parse "2h 38m", "1h 5m 30s", "45m", "90s" style durations to seconds.
 * A bare number is treated as seconds. Returns 0 when unparseable. */
export function parseHmsDuration(value: string | undefined): number {
  if (!value) return 0;
  let total = 0;
  let matched = false;
  for (const m of value.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|m|s)/gi)) {
    matched = true;
    const n = parseLocaleNumber(m[1]) ?? 0;
    const unit = m[2].toLowerCase();
    total += unit === 'h' ? n * 3600 : unit === 'm' ? n * 60 : n;
  }
  if (matched) return Math.round(total);
  const n = parseLocaleNumber(value);
  return n !== null ? Math.round(n) : 0;
}

/** Parse "HH:MM:SS" or "MM:SS" clock strings to seconds. */
export function parseClockDuration(value: string): number {
  const parts = value.split(':').map((p) => parseLocaleNumber(p) ?? 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Math.round(parseLocaleNumber(value) ?? 0);
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

const KG_PER_LB = 0.45359237;
const KM_PER_MILE = 1.609344;

export type SourceWeightUnit = 'kg' | 'lbs';
export type SourceDistanceUnit = 'km' | 'mi' | 'm';

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function convertWeight(
  value: number,
  from: SourceWeightUnit,
  to: 'kg' | 'lbs'
): number {
  if (from === to) return value;
  const kg = from === 'kg' ? value : value * KG_PER_LB;
  return roundTo(to === 'kg' ? kg : kg / KG_PER_LB, 2);
}

export function convertDistance(
  value: number,
  from: SourceDistanceUnit,
  to: 'km' | 'mi'
): number {
  if (from === to) return value;
  const km = from === 'km' ? value : from === 'm' ? value / 1000 : value * KM_PER_MILE;
  return roundTo(to === 'km' ? km : km / KM_PER_MILE, 3);
}

// ---------------------------------------------------------------------------
// Normalized rows → summary / session keys / WorkoutLogs
// ---------------------------------------------------------------------------

export function summarizeRows(rows: NormalizedSetRow[]): ImportSummary {
  const workoutKeys = new Set<string>();
  const exerciseNames = new Set<string>();
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const row of rows) {
    workoutKeys.add(row.workoutKey);
    exerciseNames.add(row.exercise);
    const start = new Date(row.startedAt);
    if (!isNaN(start.getTime())) {
      if (!earliest || start < earliest) earliest = start;
      if (!latest || start > latest) latest = start;
    }
  }

  return {
    workoutCount: workoutKeys.size,
    exerciseCount: exerciseNames.size,
    setCount: rows.length,
    dateRange:
      earliest && latest
        ? { earliest: earliest.toISOString(), latest: latest.toISOString() }
        : null,
  };
}

export function sessionKeysFromRows(rows: NormalizedSetRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) keys.add(`${row.startedAt}|${row.completedAt}`);
  return [...keys];
}

// The five legacy exercise shapes an import row can map onto.
type LegacyRowType =
  | 'reps_weight'
  | 'reps_time'
  | 'time_only'
  | 'time_distance'
  | 'reps_only';

function determineRowType(row: NormalizedSetRow): LegacyRowType {
  const hasReps = row.reps !== undefined;
  const hasWeight = row.weight !== undefined;
  const hasTime = row.timeSeconds !== undefined;
  const hasDistance = row.distance !== undefined;

  if (hasReps && hasWeight) return 'reps_weight';
  if (hasReps && hasTime) return 'reps_time';
  if (hasTime && hasDistance) return 'time_distance';
  if (hasTime) return 'time_only';
  return 'reps_only';
}

function buildSet(
  type: LegacyRowType,
  row: NormalizedSetRow,
  completed: boolean,
  options: ImportOptions
): WorkoutSet {
  const id = generateId();
  const applyValues = options.weightAndTime;
  const reps = row.reps ?? 0;
  const weight = row.weight ?? 0;
  const time = row.timeSeconds ?? 0;
  const distance = row.distance ?? 0;

  switch (type) {
    case 'reps_weight':
      return { id, completed, type, reps, weight: applyValues ? weight : 0 };
    case 'reps_time':
      return { id, completed, type, reps, time: applyValues ? time : 0 };
    case 'time_only':
      return { id, completed, type, time: applyValues ? time : 0 };
    case 'time_distance':
      return {
        id,
        completed,
        type,
        time: applyValues ? time : 0,
        distance: applyValues ? distance : 0,
      };
    case 'reps_only':
      return { id, completed, type, reps };
  }
}

/**
 * Convert normalized rows into WorkoutLog objects — same grouping semantics
 * as the FitNotes importer: rows sharing `workoutKey` form one workout; within
 * it, rows are grouped by exercise name in first-seen order.
 */
export function buildLogsFromNormalizedRows(
  rows: NormalizedSetRow[],
  options: ImportOptions,
  exerciseResolver: ExerciseResolver
): WorkoutLog[] {
  const workoutMap = new Map<string, NormalizedSetRow[]>();
  for (const row of rows) {
    const group = workoutMap.get(row.workoutKey);
    if (group) group.push(row);
    else workoutMap.set(row.workoutKey, [row]);
  }

  const logs: WorkoutLog[] = [];

  for (const [, workoutRows] of workoutMap) {
    const first = workoutRows[0];
    const durationSeconds = Math.max(
      0,
      Math.round(
        (new Date(first.completedAt).getTime() -
          new Date(first.startedAt).getTime()) /
          1000
      )
    );

    const exercises: WorkoutLogExercise[] = [];

    if (options.exercises) {
      const exerciseMap = new Map<string, NormalizedSetRow[]>();
      for (const row of workoutRows) {
        const group = exerciseMap.get(row.exercise);
        if (group) group.push(row);
        else exerciseMap.set(row.exercise, [row]);
      }

      let exerciseOrder = 0;
      for (const [exerciseName, setRows] of exerciseMap) {
        const exerciseType = determineRowType(setRows[0]);
        const exerciseId = exerciseResolver(exerciseName, exerciseType);

        const sets: WorkoutSet[] = setRows.map((row) => {
          const type = determineRowType(row);
          const completed = options.completionStatus ? row.completed : true;
          return buildSet(type, row, completed, options);
        });

        exercises.push({
          id: generateId(),
          exerciseId,
          name: exerciseName,
          type: exerciseType,
          metrics: metricsForLegacyType(exerciseType),
          order: exerciseOrder++,
          restTimeSeconds: 90,
          sets: options.setsAndReps ? sets : [],
        });
      }
    }

    logs.push({
      id: generateId(),
      templateName: first.workoutName,
      exercises,
      startedAt: first.startedAt,
      completedAt: first.completedAt,
      durationSeconds,
    });
  }

  logs.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  return logs;
}

/** Wrap a normalized parse result in the source-agnostic flow handle. */
export function toParsedCsvImport(parsed: ParsedImport): ParsedCsvImport {
  return {
    setCount: parsed.rows.length,
    summary: parsed.summary,
    sessionKeys: sessionKeysFromRows(parsed.rows),
    buildLogs: (options, resolver) =>
      buildLogsFromNormalizedRows(parsed.rows, options, resolver),
  };
}

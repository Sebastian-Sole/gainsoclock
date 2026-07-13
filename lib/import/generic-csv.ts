// Generic CSV fallback importer — for exports from apps or spreadsheets we
// don't explicitly support. Column roles are auto-detected from the header.
//
// Heuristics (deliberately simple):
// 1. Headers are lowercased and stripped of non-alphanumerics before matching
//    ("Exercise Name", "exercise_name" and "exerciseName" all match).
// 2. The first header found in each candidate list (listed priority order)
//    claims that role:
//      date:     date, workoutdate, starttime, start, datetime, day
//      exercise: exercise, exercisename, exercisetitle, movement, lift
//      weight:   weight, weightkg, weightlbs, load, loadkg
//      reps:     reps, rep, repetitions, repcount
//      duration: durationseconds, seconds, duration, time
//      distance: distance, distancekm, distancemiles, km, miles
//      name:     workoutname, workout, title, routine, session
// 3. A file is importable when a date column, an exercise column, and at
//    least one of weight/reps/duration are detected; otherwise parsing
//    returns zero rows and the UI reports "no data found".
// 4. A weight/distance header containing "kg"/"km" or "lb"/"mi" fixes the
//    source unit and values are converted to the app's configured unit;
//    otherwise values pass through unchanged.
// 5. Dates: ISO-ish strings ("YYYY-MM-DD HH:MM:SS", full ISO) parse directly.
//    Date-only values are pinned to 12:00 local time so re-importing the same
//    file always produces identical session keys. "D/M/YYYY"-style dates are
//    read day-first unless the first number can only be a month.
// 6. Duration cells may be plain seconds, "MM:SS"/"HH:MM:SS" clocks, or
//    "1h 5m" style.
// 7. One CSV row = one set. Rows sharing date + workout name form a session.
// 8. Decimal commas ("82,5") are accepted anywhere a number is expected.
import {
  convertDistance,
  convertWeight,
  normalizeHeader,
  normalizeRecord,
  parseClockDuration,
  parseCsvRecords,
  parseHmsDuration,
  parseNumericCell,
  positiveOrUndefined,
  summarizeRows,
  tryParseIsoLike,
  type ImportUnits,
  type NormalizedSetRow,
  type ParsedImport,
  type SourceDistanceUnit,
  type SourceWeightUnit,
} from './shared';

const DATE_HEADERS = ['date', 'workoutdate', 'starttime', 'start', 'datetime', 'day'];
const EXERCISE_HEADERS = ['exercise', 'exercisename', 'exercisetitle', 'movement', 'lift'];
const WEIGHT_HEADERS = ['weight', 'weightkg', 'weightlbs', 'load', 'loadkg'];
const REPS_HEADERS = ['reps', 'rep', 'repetitions', 'repcount'];
const DURATION_HEADERS = ['durationseconds', 'seconds', 'duration', 'time'];
const DISTANCE_HEADERS = ['distance', 'distancekm', 'distancemiles', 'km', 'miles'];
const NAME_HEADERS = ['workoutname', 'workout', 'title', 'routine', 'session'];

export interface GenericCsvMapping {
  date: string;
  exercise: string;
  weight?: string;
  reps?: string;
  duration?: string;
  distance?: string;
  name?: string;
}

function firstMatch(
  normalized: Set<string>,
  candidates: string[]
): string | undefined {
  return candidates.find((c) => normalized.has(c));
}

/**
 * Detect which normalized headers fill each role. Null when the CSV lacks the
 * minimum (date + exercise + one of weight/reps/duration).
 */
export function detectGenericMapping(
  headers: string[]
): GenericCsvMapping | null {
  const normalized = new Set(headers.map(normalizeHeader));

  const date = firstMatch(normalized, DATE_HEADERS);
  const exercise = firstMatch(normalized, EXERCISE_HEADERS);
  const weight = firstMatch(normalized, WEIGHT_HEADERS);
  const reps = firstMatch(normalized, REPS_HEADERS);
  const duration = firstMatch(normalized, DURATION_HEADERS);
  const distance = firstMatch(normalized, DISTANCE_HEADERS);
  const name = firstMatch(normalized, NAME_HEADERS);

  if (!date || !exercise) return null;
  if (!weight && !reps && !duration) return null;

  return { date, exercise, weight, reps, duration, distance, name };
}

/** Unit implied by the column header itself ("weight_kg" → kg). */
function weightUnitFromHeader(header: string | undefined): SourceWeightUnit | null {
  if (!header) return null;
  if (header.includes('kg')) return 'kg';
  if (header.includes('lb')) return 'lbs';
  return null;
}

function distanceUnitFromHeader(
  header: string | undefined
): SourceDistanceUnit | null {
  if (!header) return null;
  if (header.includes('km')) return 'km';
  if (header.includes('mi')) return 'mi';
  return null;
}

/**
 * Parse a date cell. Date-only values are pinned to 12:00 local time so the
 * derived session key is stable across re-imports.
 */
export function parseGenericDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;

  const isoDateOnly = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDateOnly) {
    const d = new Date(
      Number(isoDateOnly[1]),
      Number(isoDateOnly[2]) - 1,
      Number(isoDateOnly[3]),
      12,
      0,
      0
    );
    return isNaN(d.getTime()) ? null : d;
  }

  const slash = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    // Day-first unless the first number can only be a month position (b > 12
    // forces "a" to be the month).
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const d = new Date(year, month - 1, day, 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  return tryParseIsoLike(t);
}

function parseDurationCell(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const seconds = raw.includes(':')
    ? parseClockDuration(raw)
    : parseHmsDuration(raw);
  return seconds > 0 ? seconds : undefined;
}

export function parseGenericCSV(
  csvString: string,
  units: ImportUnits
): ParsedImport {
  const records = parseCsvRecords(csvString).map(normalizeRecord);
  const first = records[0];
  const mapping = first ? detectGenericMapping(Object.keys(first)) : null;
  if (!mapping) return { rows: [], summary: summarizeRows([]) };

  const sourceWeightUnit = weightUnitFromHeader(mapping.weight);
  const sourceDistanceUnit = distanceUnitFromHeader(mapping.distance);
  const rows: NormalizedSetRow[] = [];

  for (const r of records) {
    const exercise = r[mapping.exercise] ?? '';
    const start = parseGenericDate(r[mapping.date]);
    if (!exercise || !start) continue;

    const startedAt = start.toISOString();
    const workoutName = (mapping.name ? r[mapping.name] : '') ?? '';

    const rawWeight = mapping.weight
      ? positiveOrUndefined(parseNumericCell(r[mapping.weight]))
      : undefined;
    const weight =
      rawWeight !== undefined && sourceWeightUnit
        ? convertWeight(rawWeight, sourceWeightUnit, units.weightUnit)
        : rawWeight;

    const rawDistance = mapping.distance
      ? positiveOrUndefined(parseNumericCell(r[mapping.distance]))
      : undefined;
    const distance =
      rawDistance !== undefined && sourceDistanceUnit
        ? convertDistance(rawDistance, sourceDistanceUnit, units.distanceUnit)
        : rawDistance;

    const reps = mapping.reps
      ? positiveOrUndefined(parseNumericCell(r[mapping.reps]))
      : undefined;
    const timeSeconds = mapping.duration
      ? parseDurationCell(r[mapping.duration])
      : undefined;

    rows.push({
      workoutKey: `${startedAt}|${workoutName}`,
      workoutName,
      startedAt,
      completedAt: startedAt, // no end-time information in a generic CSV
      exercise,
      completed: true,
      reps: reps !== undefined ? Math.round(reps) : undefined,
      weight,
      timeSeconds,
      distance,
    });
  }

  return { rows, summary: summarizeRows(rows) };
}

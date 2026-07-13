// Strong app CSV importer.
//
// Implemented formats (community-documented; Strong publishes no spec):
//
// - iOS export (comma-delimited):
//   Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,
//   Seconds,Notes,Workout Notes,RPE
//   `Date` is "YYYY-MM-DD HH:MM:SS" (workout start), `Duration` is "2h 38m" /
//   "1h 5m 30s" style. Weight/Distance carry no unit column — they're in the
//   account's display unit and are passed through unconverted.
//
// - Android export (semicolon-delimited; delimiter auto-detected): adds
//   "Weight Unit" / "Distance Unit" columns and names the duration column
//   "Workout Duration". When a unit column is present, values are converted
//   to the app's configured unit.
//
// Details:
// - Unused numeric cells are exported as 0 and treated as absent.
// - Rows whose "Set Order" is non-numeric ("Rest Timer", "Note") are skipped.
// - A workout is identified by Date + Workout Name; its end time is start +
//   duration, which also forms the dedup session key.
// - Decimal commas ("82,5") are accepted anywhere a number is expected.
import {
  convertDistance,
  convertWeight,
  normalizeRecord,
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

function weightUnitFromCell(cell: string | undefined): SourceWeightUnit | null {
  const v = (cell ?? '').toLowerCase();
  if (v.startsWith('kg')) return 'kg';
  if (v.startsWith('lb')) return 'lbs';
  return null;
}

function distanceUnitFromCell(
  cell: string | undefined
): SourceDistanceUnit | null {
  const v = (cell ?? '').toLowerCase();
  if (v === 'm' || v.startsWith('meter')) return 'm';
  if (v.startsWith('km') || v.startsWith('kilomet')) return 'km';
  if (v.startsWith('mi')) return 'mi';
  return null;
}

export function parseStrongCSV(
  csvString: string,
  units: ImportUnits
): ParsedImport {
  const records = parseCsvRecords(csvString).map(normalizeRecord);
  const rows: NormalizedSetRow[] = [];

  for (const r of records) {
    const exercise = r['exercisename'] ?? '';
    const start = tryParseIsoLike(r['date']);
    if (!exercise || !start) continue;

    // "Rest Timer" / "Note" pseudo-rows have a non-numeric Set Order.
    const setOrder = r['setorder'];
    if (setOrder && parseNumericCell(setOrder) === null) continue;

    const durationSeconds = parseHmsDuration(
      r['duration'] ?? r['workoutduration']
    );
    const startedAt = start.toISOString();
    const completedAt = new Date(
      start.getTime() + durationSeconds * 1000
    ).toISOString();

    const rawWeight = positiveOrUndefined(parseNumericCell(r['weight']));
    const sourceWeightUnit = weightUnitFromCell(r['weightunit']);
    const weight =
      rawWeight !== undefined && sourceWeightUnit
        ? convertWeight(rawWeight, sourceWeightUnit, units.weightUnit)
        : rawWeight;

    const rawDistance = positiveOrUndefined(parseNumericCell(r['distance']));
    const sourceDistanceUnit = distanceUnitFromCell(r['distanceunit']);
    const distance =
      rawDistance !== undefined && sourceDistanceUnit
        ? convertDistance(rawDistance, sourceDistanceUnit, units.distanceUnit)
        : rawDistance;

    const reps = positiveOrUndefined(parseNumericCell(r['reps']));
    const timeSeconds = positiveOrUndefined(parseNumericCell(r['seconds']));
    const workoutName = r['workoutname'] ?? '';

    rows.push({
      workoutKey: `${startedAt}|${workoutName}`,
      workoutName,
      startedAt,
      completedAt,
      exercise,
      completed: true, // Strong only exports performed sets
      reps: reps !== undefined ? Math.round(reps) : undefined,
      weight,
      timeSeconds: timeSeconds !== undefined ? Math.round(timeSeconds) : undefined,
      distance,
    });
  }

  return { rows, summary: summarizeRows(rows) };
}

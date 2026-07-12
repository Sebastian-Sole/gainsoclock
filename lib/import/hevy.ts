// Hevy CSV importer.
//
// Export header (community-documented; unit-bearing columns vary with the
// account's settings — kg accounts get weight_kg/distance_km, lb accounts get
// weight_lbs/distance_miles):
//
//   title,start_time,end_time,description,exercise_title,superset_id,
//   exercise_notes,set_index,set_type,weight_kg|weight_lbs,reps,
//   distance_km|distance_miles,duration_seconds,rpe
//
// Details:
// - start_time/end_time appear either as "28 Mar 2025, 17:29" or as ISO-ish
//   "YYYY-MM-DD HH:MM:SS" strings; both are handled.
// - Weights/distances are converted from the export's declared unit to the
//   app's configured unit.
// - set_type (normal/warmup/failure/dropset) — all are imported as completed
//   sets; Fitbull has no warmup/dropset flag on sets.
// - superset_id: Fitbull's data model has no superset concept, so grouping is
//   dropped, but exercise order within the workout is preserved (first-seen
//   order of exercise_title).
// - duration_seconds maps to the set's time; a workout is identified by
//   title + start_time + end_time.
// - Decimal commas ("82,5") are accepted anywhere a number is expected.
import {
  convertDistance,
  convertWeight,
  normalizeRecord,
  parseCsvRecords,
  parseNumericCell,
  positiveOrUndefined,
  summarizeRows,
  tryParseIsoLike,
  type ImportUnits,
  type NormalizedSetRow,
  type ParsedImport,
} from './shared';

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse a Hevy timestamp: "28 Mar 2025, 17:29" or an ISO-ish string. */
export function parseHevyDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const d = new Date(
        Number(m[3]),
        month,
        Number(m[1]),
        Number(m[4]),
        Number(m[5])
      );
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return tryParseIsoLike(raw);
}

export function parseHevyCSV(
  csvString: string,
  units: ImportUnits
): ParsedImport {
  const records = parseCsvRecords(csvString).map(normalizeRecord);
  const rows: NormalizedSetRow[] = [];

  for (const r of records) {
    const exercise = r['exercisetitle'] ?? '';
    const start = parseHevyDate(r['starttime']);
    if (!exercise || !start) continue;
    const end = parseHevyDate(r['endtime']) ?? start;

    const startedAt = start.toISOString();
    const completedAt = end.toISOString();
    const title = r['title'] ?? '';

    // The export declares its weight unit via the header it uses.
    let weight: number | undefined;
    const weightKg = positiveOrUndefined(parseNumericCell(r['weightkg']));
    const weightLbs = positiveOrUndefined(parseNumericCell(r['weightlbs']));
    if (weightKg !== undefined) {
      weight = convertWeight(weightKg, 'kg', units.weightUnit);
    } else if (weightLbs !== undefined) {
      weight = convertWeight(weightLbs, 'lbs', units.weightUnit);
    }

    let distance: number | undefined;
    const distanceKm = positiveOrUndefined(parseNumericCell(r['distancekm']));
    const distanceMiles = positiveOrUndefined(
      parseNumericCell(r['distancemiles'])
    );
    if (distanceKm !== undefined) {
      distance = convertDistance(distanceKm, 'km', units.distanceUnit);
    } else if (distanceMiles !== undefined) {
      distance = convertDistance(distanceMiles, 'mi', units.distanceUnit);
    }

    const reps = positiveOrUndefined(parseNumericCell(r['reps']));
    const timeSeconds = positiveOrUndefined(
      parseNumericCell(r['durationseconds'])
    );

    rows.push({
      workoutKey: `${startedAt}|${completedAt}|${title}`,
      workoutName: title,
      startedAt,
      completedAt,
      exercise,
      completed: true, // Hevy only exports performed sets
      reps: reps !== undefined ? Math.round(reps) : undefined,
      weight,
      timeSeconds:
        timeSeconds !== undefined ? Math.round(timeSeconds) : undefined,
      distance,
    });
  }

  return { rows, summary: summarizeRows(rows) };
}

// Pure helpers for deriving a user-facing source name for workouts imported
// from Apple Health. Deliberately separate from lib/healthkit.ts (which
// imports the native HealthKit module and can't be loaded by Vitest) so this
// logic stays unit-testable. See issue #105.

export const DEFAULT_SOURCE_NAME = 'Apple Health';

// HealthKit sometimes surfaces an internal placeholder instead of a real
// source name — most notably "SourceProxy" for samples exposed through a
// proxy source (aggregated/synced data, system-mediated writes). None of
// these should ever reach the UI. Matched case-insensitively after trimming.
const PLACEHOLDER_NAMES = new Set(['sourceproxy', 'hksourceproxy', 'unknown']);

// Well-known bundle-id fragments → friendly names. Matched against the
// lowercased bundle id; first hit wins. Kept intentionally short — anything
// unrecognized falls through to the generic last-segment humanization.
const KNOWN_BUNDLE_SOURCES: readonly (readonly [fragment: string, name: string])[] = [
  ['com.apple.workout', 'Apple Watch'],
  ['strava', 'Strava'],
  ['garmin', 'Garmin Connect'],
];

/**
 * Resolve a display-safe source name for an Apple Health workout.
 *
 * Uses `rawName` when it's usable (non-empty and not a HealthKit internal
 * placeholder such as "SourceProxy"). Otherwise falls back to a friendly name
 * derived from `bundleId` (known apps mapped explicitly, anything else
 * humanized from the last bundle-id segment), and finally to "Apple Health".
 */
export function resolveHealthSourceName(
  rawName: string | null | undefined,
  bundleId?: string | null
): string {
  const name = rawName?.trim() ?? '';
  if (name.length > 0 && !PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    return name;
  }
  return sourceNameFromBundleId(bundleId) ?? DEFAULT_SOURCE_NAME;
}

/** "com.nike.run-club" → "Run Club"; known ids get explicit names. */
function sourceNameFromBundleId(
  bundleId: string | null | undefined
): string | null {
  const id = bundleId?.trim() ?? '';
  if (id.length === 0) return null;
  const lower = id.toLowerCase();

  // Apple Watch device sources carry a per-device suffix
  // ("com.apple.health.<UUID>"); the bare id is the iPhone Health app.
  if (lower.startsWith('com.apple.health.')) return 'Apple Watch';
  if (lower === 'com.apple.health') return DEFAULT_SOURCE_NAME;

  for (const [fragment, name] of KNOWN_BUNDLE_SOURCES) {
    if (lower.includes(fragment)) return name;
  }

  // Generic fallback: humanize the last bundle-id segment.
  // "com.example.polarFlow" → "Polar Flow", "com.example.run-club" → "Run Club".
  const segment = id
    .split('.')
    .filter((s) => s.length > 0)
    .pop();
  if (!segment) return null;
  const words = segment
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length > 0 ? words.join(' ') : null;
}

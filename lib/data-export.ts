// Pure shaping helpers for the "Export my data" feature (issue #107).
//
// Shared by both sides of the export:
// - convex/dataExport.ts sanitizes rows server-side (internal ids and the
//   RevenueCat system fields never leave the server),
// - app/settings/export-data.tsx assembles the paginated pages into the
//   final JSON document on-device.
//
// Everything here is pure and unit-tested (lib/data-export.test.ts).

/**
 * User-owned tables exported as arrays, in output order. This list is the
 * single source of truth: the Convex `exportPage` query derives its `table`
 * argument validator from it, and the client iterates it page by page, so a
 * table added here without a matching server branch fails the Convex
 * typecheck (exhaustive switch) rather than being silently omitted.
 *
 * Single-row tables (userProfile, userSettings, userOnboarding,
 * nutritionGoals, userSubscriptions and the auth `users` doc) are exported
 * via the `user` section instead. Deliberately excluded: auth internals
 * (sessions, refresh tokens, verification codes) and `mealPhotos`
 * (transient storage-ownership pointers with no user-readable content).
 */
export const EXPORT_TABLES = [
  "exercises",
  "templates",
  "templateExercises",
  "workoutLogs",
  "workoutLogExercises",
  "workoutSets",
  "workoutPlans",
  "planDays",
  "recipes",
  "ingredients",
  "mealLogs",
  "chatConversations",
  "chatMessages",
  "externalWorkouts",
  "healthDailyMetrics",
  "weeklyReviews",
  "userConsents",
  "onboardingAha",
  "aiSafetyIncidents",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

/** A sanitized document row: plain JSON-serializable key/value pairs. */
export type ExportRow = Record<string, unknown>;

// Convex system/ownership fields stripped from every exported row. `_id` and
// `userId` are internal references; `_creationTime` is kept because for some
// tables (workoutSets, nutritionGoals, ...) it is the only timestamp.
const INTERNAL_ROW_KEYS = new Set(["_id", "userId"]);

/** Strips Convex-internal ownership fields from a row. */
export function sanitizeExportRow(row: ExportRow): ExportRow {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !INTERNAL_ROW_KEYS.has(key))
  );
}

/**
 * User-meaningful subset of a `userSubscriptions` row. Everything else on
 * that table (RevenueCat app-user id, webhook event ids, email-campaign
 * bookkeeping) is system-internal and stays on the server.
 */
export const SUBSCRIPTION_EXPORT_KEYS = [
  "entitlement",
  "isActive",
  "status",
  "source",
  "productId",
  "store",
  "expiresAt",
  "trialExpiresAt",
  "willAutoRenew",
  "cancelReason",
  "updatedAt",
] as const;

const subscriptionKeySet: ReadonlySet<string> = new Set(
  SUBSCRIPTION_EXPORT_KEYS
);

/** Picks only the user-meaningful fields of a subscription row. */
export function sanitizeSubscriptionRow(
  row: ExportRow | null
): ExportRow | null {
  if (row === null) return null;
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => subscriptionKeySet.has(key))
  );
}

/** Single-row-per-user data, grouped under the `user` key of the export. */
export type ExportUserSection = {
  account: ExportRow | null;
  profile: ExportRow | null;
  settings: ExportRow | null;
  onboarding: ExportRow | null;
  nutritionGoals: ExportRow | null;
  subscription: ExportRow | null;
};

export type ExportDocument = {
  format: "fitbull-data-export";
  formatVersion: 1;
  exportedAt: string;
  appVersion: string;
  user: ExportUserSection;
} & Record<ExportTable, ExportRow[]>;

/**
 * Assembles the final export document. Every table in EXPORT_TABLES is
 * present in the output (empty array when the user has no rows) so consumers
 * can rely on the shape.
 */
export function buildExportDocument(params: {
  exportedAt: string;
  appVersion: string;
  user: ExportUserSection;
  tables: Partial<Record<ExportTable, ExportRow[]>>;
}): ExportDocument {
  const { tables } = params;
  return {
    format: "fitbull-data-export",
    formatVersion: 1,
    exportedAt: params.exportedAt,
    appVersion: params.appVersion,
    user: params.user,
    exercises: tables.exercises ?? [],
    templates: tables.templates ?? [],
    templateExercises: tables.templateExercises ?? [],
    workoutLogs: tables.workoutLogs ?? [],
    workoutLogExercises: tables.workoutLogExercises ?? [],
    workoutSets: tables.workoutSets ?? [],
    workoutPlans: tables.workoutPlans ?? [],
    planDays: tables.planDays ?? [],
    recipes: tables.recipes ?? [],
    ingredients: tables.ingredients ?? [],
    mealLogs: tables.mealLogs ?? [],
    chatConversations: tables.chatConversations ?? [],
    chatMessages: tables.chatMessages ?? [],
    externalWorkouts: tables.externalWorkouts ?? [],
    healthDailyMetrics: tables.healthDailyMetrics ?? [],
    weeklyReviews: tables.weeklyReviews ?? [],
    userConsents: tables.userConsents ?? [],
    onboardingAha: tables.onboardingAha ?? [],
    aiSafetyIncidents: tables.aiSafetyIncidents ?? [],
  };
}

/** `fitbull-export-2026-07-12.json` — keyed by the export day. */
export function exportFileName(exportedAtIso: string): string {
  return `fitbull-export-${exportedAtIso.slice(0, 10)}.json`;
}

/** Pretty-printed JSON so the file is human-readable. */
export function serializeExport(doc: ExportDocument): string {
  return JSON.stringify(doc, null, 2);
}

import { describe, expect, it } from "vitest";
import {
  EXPORT_TABLES,
  buildExportDocument,
  exportFileName,
  sanitizeExportRow,
  sanitizeSubscriptionRow,
  serializeExport,
  type ExportUserSection,
} from "./data-export";

const emptyUser: ExportUserSection = {
  account: null,
  profile: null,
  settings: null,
  onboarding: null,
  nutritionGoals: null,
  subscription: null,
};

describe("sanitizeExportRow", () => {
  it("strips Convex ownership fields but keeps everything else", () => {
    const row = {
      _id: "j57abc",
      userId: "j97xyz",
      _creationTime: 1700000000000,
      clientId: "c-1",
      name: "Bench Press",
      reps: 8,
      nested: { weight: 100 },
    };
    expect(sanitizeExportRow(row)).toEqual({
      _creationTime: 1700000000000,
      clientId: "c-1",
      name: "Bench Press",
      reps: 8,
      nested: { weight: 100 },
    });
  });

  it("leaves rows without internal fields untouched", () => {
    expect(sanitizeExportRow({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("sanitizeSubscriptionRow", () => {
  it("returns null for null input", () => {
    expect(sanitizeSubscriptionRow(null)).toBeNull();
  });

  it("keeps only the user-meaningful allowlist", () => {
    const row = {
      _id: "j5sub",
      userId: "j9user",
      _creationTime: 1700000000000,
      // system-internal fields that must not be exported
      revenuecatAppUserId: "$RCAnonymousID:abc",
      lastEventId: "evt_123",
      lastEventTimestampMs: 1700000000000,
      sourceHistory: [{ source: "promo", grantedAt: "x", reason: "y" }],
      notificationAnchorAt: "2026-01-01T00:00:00Z",
      dcsaNotifiedAt: "2026-01-01T00:00:00Z",
      reminder48hSentAt: "2026-01-01T00:00:00Z",
      graceEmailSentAt: "2026-01-01T00:00:00Z",
      winbackEmailSentAt: "2026-01-01T00:00:00Z",
      emailOptOut: false,
      storefrontCountry: "NO",
      lastVerifiedAt: "2026-01-01T00:00:00Z",
      // user-meaningful fields
      entitlement: "Gainsoclock Pro",
      isActive: true,
      status: "pro",
      source: "apple",
      productId: "pro_monthly",
      store: "app_store",
      expiresAt: "2026-08-01T00:00:00Z",
      trialExpiresAt: "2026-07-15T00:00:00Z",
      willAutoRenew: true,
      cancelReason: "unsubscribe",
      updatedAt: "2026-07-01T00:00:00Z",
    };
    expect(sanitizeSubscriptionRow(row)).toEqual({
      entitlement: "Gainsoclock Pro",
      isActive: true,
      status: "pro",
      source: "apple",
      productId: "pro_monthly",
      store: "app_store",
      expiresAt: "2026-08-01T00:00:00Z",
      trialExpiresAt: "2026-07-15T00:00:00Z",
      willAutoRenew: true,
      cancelReason: "unsubscribe",
      updatedAt: "2026-07-01T00:00:00Z",
    });
  });
});

describe("buildExportDocument", () => {
  it("includes every export table as a key, defaulting to empty arrays", () => {
    const doc = buildExportDocument({
      exportedAt: "2026-07-12T10:00:00.000Z",
      appVersion: "1.1.1",
      user: emptyUser,
      tables: {},
    });
    for (const table of EXPORT_TABLES) {
      expect(doc[table]).toEqual([]);
    }
    expect(doc.format).toBe("fitbull-data-export");
    expect(doc.formatVersion).toBe(1);
    expect(doc.exportedAt).toBe("2026-07-12T10:00:00.000Z");
    expect(doc.appVersion).toBe("1.1.1");
    expect(doc.user).toEqual(emptyUser);
  });

  it("carries provided table rows through untouched", () => {
    const workoutLogs = [{ clientId: "w-1", templateName: "Push Day" }];
    const doc = buildExportDocument({
      exportedAt: "2026-07-12T10:00:00.000Z",
      appVersion: "1.1.1",
      user: emptyUser,
      tables: { workoutLogs },
    });
    expect(doc.workoutLogs).toEqual(workoutLogs);
    expect(doc.mealLogs).toEqual([]);
  });

  it("round-trips through serializeExport as valid JSON", () => {
    const doc = buildExportDocument({
      exportedAt: "2026-07-12T10:00:00.000Z",
      appVersion: "1.1.1",
      user: emptyUser,
      tables: { recipes: [{ title: "Overnight oats", servings: 2 }] },
    });
    const parsed: unknown = JSON.parse(serializeExport(doc));
    expect(parsed).toEqual(doc);
  });
});

describe("exportFileName", () => {
  it("keys the file by the export day", () => {
    expect(exportFileName("2026-07-12T10:34:56.789Z")).toBe(
      "fitbull-export-2026-07-12.json"
    );
  });
});

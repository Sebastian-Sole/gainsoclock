import { describe, it, expect } from "vitest";
import {
  DEFAULT_SOURCE_NAME,
  resolveHealthSourceName,
} from "@/lib/health-source";

// Issue #105: HealthKit sometimes reports the internal placeholder
// "SourceProxy" as a sample's source name. The resolver must never let it
// (or similarly unusable names) reach the UI — fall back to a friendly name
// derived from the bundle id, else "Apple Health".

describe("resolveHealthSourceName", () => {
  describe("usable raw names pass through", () => {
    it("keeps a real source name verbatim", () => {
      expect(resolveHealthSourceName("Strava", "com.strava.stravaride")).toBe(
        "Strava"
      );
    });

    it("keeps a device name even without a bundle id", () => {
      expect(resolveHealthSourceName("Sebastian's Apple Watch")).toBe(
        "Sebastian's Apple Watch"
      );
    });

    it("trims surrounding whitespace", () => {
      expect(resolveHealthSourceName("  Nike Run Club  ")).toBe(
        "Nike Run Club"
      );
    });
  });

  describe("placeholder names are rejected", () => {
    it('"SourceProxy" falls back to the default', () => {
      expect(resolveHealthSourceName("SourceProxy")).toBe(DEFAULT_SOURCE_NAME);
    });

    it("matches placeholders case-insensitively", () => {
      expect(resolveHealthSourceName("sourceproxy")).toBe(DEFAULT_SOURCE_NAME);
      expect(resolveHealthSourceName("SOURCEPROXY")).toBe(DEFAULT_SOURCE_NAME);
      expect(resolveHealthSourceName("HKSourceProxy")).toBe(
        DEFAULT_SOURCE_NAME
      );
    });

    it('"SourceProxy" with a known bundle id maps to the friendly name', () => {
      expect(
        resolveHealthSourceName("SourceProxy", "com.strava.stravaride")
      ).toBe("Strava");
    });

    it("empty and whitespace-only names are unusable", () => {
      expect(resolveHealthSourceName("")).toBe(DEFAULT_SOURCE_NAME);
      expect(resolveHealthSourceName("   ")).toBe(DEFAULT_SOURCE_NAME);
      expect(resolveHealthSourceName(undefined)).toBe(DEFAULT_SOURCE_NAME);
      expect(resolveHealthSourceName(null)).toBe(DEFAULT_SOURCE_NAME);
    });
  });

  describe("bundle-id fallback", () => {
    it("maps Apple Watch device sources (com.apple.health.<UUID>)", () => {
      expect(
        resolveHealthSourceName("SourceProxy", "com.apple.health.0A1B2C3D")
      ).toBe("Apple Watch");
    });

    it("maps the bare Health app bundle id to Apple Health", () => {
      expect(resolveHealthSourceName("SourceProxy", "com.apple.health")).toBe(
        "Apple Health"
      );
    });

    it("maps the watch Workout app to Apple Watch", () => {
      expect(resolveHealthSourceName("SourceProxy", "com.apple.workout")).toBe(
        "Apple Watch"
      );
    });

    it("maps Strava and Garmin bundle ids", () => {
      expect(
        resolveHealthSourceName("SourceProxy", "com.strava.stravaride")
      ).toBe("Strava");
      expect(
        resolveHealthSourceName("SourceProxy", "com.garmin.connect.mobile")
      ).toBe("Garmin Connect");
    });

    it("matches bundle ids case-insensitively", () => {
      expect(resolveHealthSourceName("SourceProxy", "com.Strava.Run")).toBe(
        "Strava"
      );
    });

    it("humanizes the last segment of unknown bundle ids", () => {
      expect(
        resolveHealthSourceName("SourceProxy", "com.example.run-club")
      ).toBe("Run Club");
      expect(
        resolveHealthSourceName("SourceProxy", "com.example.polarFlow")
      ).toBe("Polar Flow");
      expect(resolveHealthSourceName("SourceProxy", "io.fitness.zones")).toBe(
        "Zones"
      );
    });

    it("falls back to the default when the bundle id is unusable", () => {
      expect(resolveHealthSourceName("SourceProxy", "")).toBe(
        DEFAULT_SOURCE_NAME
      );
      expect(resolveHealthSourceName("SourceProxy", "...")).toBe(
        DEFAULT_SOURCE_NAME
      );
      expect(resolveHealthSourceName("SourceProxy", null)).toBe(
        DEFAULT_SOURCE_NAME
      );
    });
  });
});

"use node";

import { v } from "convex/values";
import { PostHog } from "posthog-node";

import { internalAction } from "./_generated/server";

/**
 * Server-side PostHog wrapper. Only callable from other Convex actions
 * (`internalAction` — no public surface). Used by plan-07's aha-moment
 * action so server-emitted events (`plan_first_byte`, `plan_visible`,
 * `plan_generation_failed`) survive the action's boundary.
 *
 * Constraints from Security #7 / Theme B:
 *   - capture is fire-and-forget but bounded by `Promise.race` against a 2s
 *     timeout so analytics never blocks the user-facing action;
 *   - errors are swallowed (warned) — analytics failures must never bubble
 *     up into the action's response;
 *   - `disableGeoip: true`, EU host.
 */

const TIMEOUT_MS = 2000;

const FORBIDDEN_KEYS = new Set<string>([
  "weightKg",
  "heightCm",
  "ageYears",
  "biologicalSex",
  "bodyFatPercent",
  "activityLevel",
  "tdee",
  "bmr",
  "bmi",
  "caloriesBurned",
  "workoutDurationSec",
  "restingHeartRate",
  "activeCalories",
]);

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const captureServer = internalAction({
  args: {
    distinctId: v.string(),
    eventName: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, { distinctId, eventName, properties }) => {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      // Analytics is optional in dev / preview deployments. Don't throw.
      console.warn("[analytics:server] POSTHOG_API_KEY not set; skipping");
      return null;
    }

    // Defence-in-depth: refuse forbidden keys at the wire boundary too.
    if (properties && typeof properties === "object") {
      for (const key of Object.keys(properties)) {
        if (FORBIDDEN_KEYS.has(key)) {
          console.warn(
            `[analytics:server] forbidden key "${key}" in event "${eventName}" — dropping event`
          );
          return null;
        }
      }
    }

    const client = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
      disableGeoip: true,
    });

    try {
      await client.captureImmediate({
        distinctId,
        event: eventName,
        properties: (properties ?? {}) as Record<string, unknown>,
      });
      await Promise.race([client.shutdown(TIMEOUT_MS), timeout(TIMEOUT_MS)]);
    } catch (e) {
      console.warn("[analytics:server] capture failed", e);
    }
    return null;
  },
});

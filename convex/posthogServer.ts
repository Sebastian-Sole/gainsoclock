"use node";

import { v } from "convex/values";

import { internalAction } from "./_generated/server";

// PostHog REST delete API caller. Used by:
//   - `onboarding.deleteAccount` to erase the user from PostHog on Art. 17.
//   - `onboarding.withdrawConsent({ purpose: "analytics" })` to erase any
//     previously-captured data when the user revokes consent.
//
// Best-effort: PostHog deletes are asynchronous on the server side and can
// be rate-limited; failures are warned and not thrown so they never block
// the calling mutation. Retries are lightweight (3× with linear backoff).

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const deletePostHogUser = internalAction({
  args: { distinctId: v.string() },
  handler: async (_ctx, { distinctId }) => {
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;
    const host = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";

    if (!apiKey || !projectId) {
      console.warn(
        "[posthogServer] POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID not set; skipping delete",
      );
      return { ok: false, reason: "missing_env" as const };
    }

    const url = `${host.replace(/\/$/, "")}/api/projects/${projectId}/persons/@${encodeURIComponent(distinctId)}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });
        if (response.status === 204 || response.status === 404) {
          return { ok: true };
        }
        if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_MS * attempt);
          continue;
        }
        const body = await response.text().catch(() => "");
        console.warn(
          `[posthogServer] delete failed: ${response.status} ${body.slice(0, 200)}`,
        );
        return { ok: false, reason: "http_error" as const };
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFF_MS * attempt);
          continue;
        }
        console.warn("[posthogServer] fetch failed:", error);
        return { ok: false, reason: "network_error" as const };
      }
    }
    return { ok: false, reason: "exhausted" as const };
  },
});

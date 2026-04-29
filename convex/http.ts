import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isRevenueCatEvent } from "./revenuecatTypes";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Constant-time string comparison.
 *
 * Convex HTTP actions run in the V8 runtime (no Node `crypto.timingSafeEqual`).
 * We implement the constant-time compare ourselves to avoid leaking token
 * timing over the network. Length mismatch is folded into the same loop so
 * callers get O(max(a.length, b.length)) work regardless of input.
 */
function timingSafeEqualString(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0;
    const bCode = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= aCode ^ bCode;
  }
  return mismatch === 0;
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return header;
}

function isAuthorizedAgainst(
  presented: string | null,
  expected: string | undefined,
): boolean {
  if (!presented || !expected) return false;
  return timingSafeEqualString(presented, expected);
}

// RevenueCat webhook endpoint.
//
// Auth: dual-token compare against REVENUECAT_WEBHOOK_AUTH_TOKEN and
// REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS — see
// docs/revenuecat-webhook-rotation.md.
//
// Note: this endpoint is authenticated by the RC-supplied token, not by an
// end-user session. `getAuthUserId` is intentionally not called.
http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const presented = extractBearer(request.headers.get("Authorization"));
    const current = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;
    const previous = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS;

    if (!current && !previous) {
      console.warn(
        "[RevenueCat] No webhook auth tokens configured — rejecting request",
      );
      return new Response("Unauthorized", { status: 401 });
    }

    const authorized =
      isAuthorizedAgainst(presented, current) ||
      isAuthorizedAgainst(presented, previous);

    if (!authorized) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (!isRevenueCatEvent(payload)) {
      const eventType =
        typeof payload === "object" &&
        payload !== null &&
        "event" in payload &&
        typeof (payload as { event?: { type?: unknown } }).event?.type ===
          "string"
          ? (payload as { event: { type: string } }).event.type
          : "<unknown>";
      console.log(
        `[RevenueCat] unknown_or_unhandled_event type=${eventType} — 200 OK`,
      );
      return new Response("OK", { status: 200 });
    }

    try {
      await ctx.runMutation(internal.subscriptions.updateFromWebhook, {
        event: payload,
      });
    } catch (error) {
      console.error("[RevenueCat] updateFromWebhook failed:", error);
      return new Response("Internal error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  }),
});

// Unsubscribe link from legal/DCSA reminder emails. Idempotent.
http.route({
  path: "/webhooks/email/unsubscribe",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get("user");
    const token = url.searchParams.get("token");
    if (!userId || !token) {
      return new Response("Bad Request", { status: 400 });
    }
    try {
      await ctx.runMutation(internal.subscriptionCrons.markEmailOptOut, {
        userId,
        token,
      });
    } catch (error) {
      console.error("[Email] unsubscribe failed:", error);
    }
    return new Response(
      "You have been unsubscribed from Fitbull legal/billing reminder emails.",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }),
});

export default http;

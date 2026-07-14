import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isRevenueCatEvent } from "./revenuecatTypes";
import { hashEmailChangeToken } from "../lib/email-change";

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

/** HMAC-SHA256(userId) hex — V8-runtime twin of email.ts's node helper
 *  (`unsubscribeTokenNode`). The two implementations MUST produce identical
 *  output; change them in lockstep. */
async function unsubscribeTokenV8(
  userId: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(userId));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
      // A dropped subscription-state update. We return 500 (RC will retry)
      // rather than throw, so the native Sentry integration never sees it —
      // report it explicitly so paywall/entitlement breakage is visible.
      await ctx.scheduler.runAfter(0, internal.errorReporting.reportHandledError, {
        where: "revenuecat.webhook",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        extra: { eventType: payload.event.type },
      });
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
    const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
    if (!secret) {
      // Fail closed: with no secret we cannot verify the HMAC, so no opt-out
      // happens. Return the generic 200 — validity must not leak.
      console.error(
        "[Email] UNSUBSCRIBE_TOKEN_SECRET not set — cannot verify unsubscribe token",
      );
    } else {
      try {
        const expected = await unsubscribeTokenV8(userId, secret);
        if (timingSafeEqualString(expected, token)) {
          await ctx.runMutation(internal.subscriptionCrons.markEmailOptOut, {
            userId,
          });
        }
      } catch (error) {
        console.error("[Email] unsubscribe failed:", error);
      }
    }
    return new Response(
      "You have been unsubscribed from Fitbull legal/billing reminder emails.",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }),
});

// Plain-text confirmation page. text/plain (not HTML) so a reflected address
// can never execute — same choice as the unsubscribe route.
function confirmPage(message: string): Response {
  return new Response(message, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Confirmation link from the verify-before-activate email change (issue #106).
// Clicking it is what actually re-keys the password account and updates
// users.email — nothing changes until this fires. See convex/emailChange.ts.
http.route({
  path: "/webhooks/email/confirm-email-change",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return confirmPage("This confirmation link is missing its token.");
    }

    const tokenHash = await hashEmailChangeToken(token);
    try {
      const result = await ctx.runMutation(
        internal.emailChange.applyPendingChange,
        { tokenHash },
      );
      if (result.status === "ok") {
        // Tell the previous inbox — an account-takeover safety net.
        await ctx.scheduler.runAfter(
          0,
          internal.email.sendEmailChangeNotice,
          { oldEmail: result.oldEmail, newEmail: result.newEmail },
        );
        return confirmPage(
          `Your Fitbull email was changed to ${result.newEmail}. You can close this page and return to the app.`,
        );
      }
      if (result.status === "expired") {
        return confirmPage(
          "This confirmation link has expired. Request a new email change from the app.",
        );
      }
      if (result.status === "taken") {
        return confirmPage(
          "That email address is now in use by another account. Request a different one from the app.",
        );
      }
      return confirmPage(
        "This confirmation link is invalid or has already been used.",
      );
    } catch (error) {
      console.error("[EmailChange] applyPendingChange failed:", error);
      return confirmPage(
        "Something went wrong confirming your email. Try the link again, or contact support@fitbull.app.",
      );
    }
  }),
});

export default http;

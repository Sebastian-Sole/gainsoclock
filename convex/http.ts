import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

// RevenueCat webhook endpoint
http.route({
  path: "/webhooks/revenuecat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    const expectedToken = process.env.REVENUECAT_WEBHOOK_AUTH_TOKEN;

    const isAuthorized =
      !!expectedToken &&
      authHeader !== null &&
      (authHeader === expectedToken || authHeader === `Bearer ${expectedToken}`);
    if (!isAuthorized) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const body = await request.json();
      const event = body.event;

      if (!event) {
        return new Response("No event", { status: 400 });
      }

      const appUserId: string | undefined = event.app_user_id;
      const productId: string | undefined = event.product_id;
      const store: string | undefined = event.store;

      let isActive: boolean | null = null;
      if (
        event.type === "INITIAL_PURCHASE" ||
        event.type === "RENEWAL" ||
        event.type === "PRODUCT_CHANGE" ||
        event.type === "UNCANCELLATION" ||
        event.type === "NON_RENEWING_PURCHASE"
      ) {
        isActive = true;
      } else if (event.type === "EXPIRATION") {
        isActive = false;
      }

      // Certain events don't imply immediate entitlement revocation.
      const shouldProcess = isActive !== null && !!appUserId;
      if (shouldProcess) {
        const expirationAtMsRaw = event.expiration_at_ms;
        const expirationAtMs =
          typeof expirationAtMsRaw === "number"
            ? expirationAtMsRaw
            : typeof expirationAtMsRaw === "string"
              ? Number(expirationAtMsRaw)
              : NaN;
        const eventTimestampRaw = event.event_timestamp_ms;
        const eventTimestampMs =
          typeof eventTimestampRaw === "number"
            ? eventTimestampRaw
            : typeof eventTimestampRaw === "string"
              ? Number(eventTimestampRaw)
              : NaN;

        await ctx.runMutation(internal.subscriptions.updateFromWebhook, {
          revenuecatAppUserId: appUserId,
          isActive: isActive === true,
          productId,
          store,
          expiresAt:
            Number.isFinite(expirationAtMs) && expirationAtMs > 0
              ? new Date(expirationAtMs).toISOString()
              : undefined,
          eventId:
            typeof event.id === "string"
              ? event.id
              : typeof event.event_id === "string"
                ? event.event_id
                : undefined,
          eventTimestampMs: Number.isFinite(eventTimestampMs)
            ? eventTimestampMs
            : undefined,
        });
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Internal error", { status: 500 });
    }
  }),
});

export default http;

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

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const body = await request.json();
      const event = body.event;

      if (!event) {
        return new Response("No event", { status: 400 });
      }

      const appUserId: string = event.app_user_id;
      const productId: string | undefined = event.product_id;
      const store: string | undefined = event.store;

      const activeEvents = [
        "INITIAL_PURCHASE",
        "RENEWAL",
        "PRODUCT_CHANGE",
        "UNCANCELLATION",
      ];

      const inactiveEvents = [
        "CANCELLATION",
        "EXPIRATION",
        "BILLING_ISSUE",
        "SUBSCRIPTION_PAUSED",
      ];

      let isActive: boolean | null = null;

      if (activeEvents.includes(event.type)) {
        isActive = true;
      } else if (inactiveEvents.includes(event.type)) {
        isActive = false;
      }

      if (isActive !== null) {
        await ctx.runMutation(internal.subscriptions.updateFromWebhook, {
          revenuecatAppUserId: appUserId,
          isActive,
          productId,
          store,
          expiresAt: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
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

// Discriminated union covering every RevenueCat webhook event the
// state machine in convex/subscriptions.ts knows how to handle.
//
// Reference: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
//
// Out-of-scope events (e.g. NON_RENEWING_PURCHASE, INVOICE_ISSUANCE,
// VIRTUAL_CURRENCY_TRANSACTION) are tolerated by the handler — it logs
// "unknown_event" and 200-OKs them so RevenueCat does not retry.

export type RevenueCatStore =
  | "APP_STORE"
  | "MAC_APP_STORE"
  | "PLAY_STORE"
  | "STRIPE"
  | "AMAZON"
  | "PROMOTIONAL";

export type RevenueCatEnvironment = "SANDBOX" | "PRODUCTION";

export type RevenueCatCancelReason =
  | "UNSUBSCRIBE"
  | "BILLING_ERROR"
  | "DEVELOPER_INITIATED"
  | "PRICE_INCREASE"
  | "CUSTOMER_SUPPORT"
  | "UNKNOWN"
  | "SUBSCRIPTION_REPLACED";

interface BaseEventPayload {
  id: string;
  event_timestamp_ms: number;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[];
  environment: RevenueCatEnvironment;
  store?: RevenueCatStore;
  expiration_at_ms?: number;
  purchased_at_ms?: number;
}

interface BaseEnvelope {
  api_version: string;
}

export type InitialPurchaseEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "INITIAL_PURCHASE" };
};

export type RenewalEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "RENEWAL" };
};

export type ProductChangeEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "PRODUCT_CHANGE"; new_product_id: string };
};

export type CancellationEvent = BaseEnvelope & {
  event: BaseEventPayload & {
    type: "CANCELLATION";
    cancel_reason: RevenueCatCancelReason;
  };
};

export type UncancellationEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "UNCANCELLATION" };
};

export type SubscriptionPausedEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "SUBSCRIPTION_PAUSED" };
};

export type ExpirationEvent = BaseEnvelope & {
  event: BaseEventPayload & {
    type: "EXPIRATION";
    expiration_reason?: string;
  };
};

export type BillingIssueEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "BILLING_ISSUE" };
};

export type RefundEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "REFUND" };
};

export type RefundReversedEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "REFUND_REVERSED" };
};

export type TempGrantEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "TEMPORARY_ENTITLEMENT_GRANT" };
};

export type TransferEvent = BaseEnvelope & {
  event: BaseEventPayload & {
    type: "TRANSFER";
    transferred_from: string[];
    transferred_to: string[];
  };
};

export type SubscriberAliasEvent = BaseEnvelope & {
  event: BaseEventPayload & {
    type: "SUBSCRIBER_ALIAS";
    original_app_user_id: string;
  };
};

// SUBSCRIPTION_EXTENDED is the documented exception to out-of-order
// protection: it must update trialExpiresAt even when its timestamp is
// older than the row's lastEventTimestampMs (Security #8).
export type SubscriptionExtendedEvent = BaseEnvelope & {
  event: BaseEventPayload & { type: "SUBSCRIPTION_EXTENDED" };
};

export type RevenueCatWebhookEvent =
  | InitialPurchaseEvent
  | RenewalEvent
  | ProductChangeEvent
  | CancellationEvent
  | UncancellationEvent
  | SubscriptionPausedEvent
  | ExpirationEvent
  | BillingIssueEvent
  | RefundEvent
  | RefundReversedEvent
  | TempGrantEvent
  | TransferEvent
  | SubscriberAliasEvent
  | SubscriptionExtendedEvent;

export type RevenueCatEventType = RevenueCatWebhookEvent["event"]["type"];

const KNOWN_EVENT_TYPES: ReadonlySet<RevenueCatEventType> = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "CANCELLATION",
  "UNCANCELLATION",
  "SUBSCRIPTION_PAUSED",
  "EXPIRATION",
  "BILLING_ISSUE",
  "REFUND",
  "REFUND_REVERSED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "TRANSFER",
  "SUBSCRIBER_ALIAS",
  "SUBSCRIPTION_EXTENDED",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRevenueCatEvent(
  payload: unknown,
): payload is RevenueCatWebhookEvent {
  if (!isPlainObject(payload)) return false;
  const event = payload.event;
  if (!isPlainObject(event)) return false;
  if (typeof event.type !== "string") return false;
  if (typeof event.id !== "string") return false;
  if (typeof event.event_timestamp_ms !== "number") return false;
  if (typeof event.app_user_id !== "string") return false;
  if (event.environment !== "SANDBOX" && event.environment !== "PRODUCTION") {
    return false;
  }
  return KNOWN_EVENT_TYPES.has(event.type as RevenueCatEventType);
}

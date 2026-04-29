import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { ENTITLEMENT_ID } from "../lib/subscription-constants";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  isRevenueCatEvent,
  type RevenueCatWebhookEvent,
} from "./revenuecatTypes";

type SubscriptionRow = Doc<"userSubscriptions">;
type SubscriptionStatus = NonNullable<SubscriptionRow["status"]>;
type SubscriptionSource = NonNullable<SubscriptionRow["source"]>;
type SourceHistoryEntry = NonNullable<SubscriptionRow["sourceHistory"]>[number];

const TEMP_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

function isoNow(): string {
  return new Date().toISOString();
}

function toIso(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined;
  return new Date(ms).toISOString();
}

// Fields the state machine produces. Mirrors the row's mutable surface.
interface NextState {
  status: SubscriptionStatus;
  source: SubscriptionSource | null;
  trialExpiresAt: string | null;
  willAutoRenew: boolean;
  sourceHistory: SourceHistoryEntry[];
  cancelReason: string | null;
  notificationAnchorAt: string | null;
  productId: string | null;
  store: string | null;
  expiresAt: string | null;
  // Tells the mutation to skip the status transition (e.g. SUBSCRIPTION_EXTENDED).
  trialExpiresAtOnly?: boolean;
}

function rowToState(row: SubscriptionRow | null): NextState {
  return {
    status: row?.status ?? "free",
    source: row?.source ?? null,
    trialExpiresAt: row?.trialExpiresAt ?? null,
    willAutoRenew: row?.willAutoRenew ?? false,
    sourceHistory: row?.sourceHistory ? [...row.sourceHistory] : [],
    cancelReason: row?.cancelReason ?? null,
    notificationAnchorAt: row?.notificationAnchorAt ?? null,
    productId: row?.productId ?? null,
    store: row?.store ?? null,
    expiresAt: row?.expiresAt ?? null,
  };
}

function appendHistory(
  history: SourceHistoryEntry[],
  source: string,
  reason: string,
  grantedAt: string,
): SourceHistoryEntry[] {
  return [...history, { source, reason, grantedAt }];
}

function lastNonTempSource(
  history: SourceHistoryEntry[],
): SubscriptionSource | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i].source;
    if (s === "rc_paid" || s === "rc_intro") {
      return s;
    }
  }
  return null;
}

/**
 * Pure helper. Given the current row and an incoming event, compute the
 * next subscription state. No side effects — the mutation does the patch.
 *
 * Transition rules are documented in
 * docs/prism/onboarding-flow/plan/sub-plans/plan-02-subscription-state-machine.md.
 */
export function computeNextState(
  row: SubscriptionRow | null,
  event: RevenueCatWebhookEvent["event"],
): NextState {
  const now = isoNow();
  const next = rowToState(row);
  const evtIso = toIso(event.event_timestamp_ms) ?? now;
  const expIso = toIso(event.expiration_at_ms);

  // Carry through the latest product/store metadata when present.
  if (event.product_id) next.productId = event.product_id;
  if (event.store) next.store = event.store;

  switch (event.type) {
    case "INITIAL_PURCHASE": {
      // Trial vs paid is inferred from expiration_at_ms presence + product_id
      // hint. RC webhook doesn't expose `is_trial_period` consistently across
      // stores, so the heuristic is: a short window (≤ 31 days from event ts)
      // on an annual product = trial. Anything else = paid.
      const expMs = event.expiration_at_ms;
      const isTrial =
        typeof expMs === "number" &&
        Number.isFinite(expMs) &&
        expMs - event.event_timestamp_ms <= 31 * 24 * 60 * 60 * 1000 &&
        (event.product_id?.includes("annual") ?? false);
      if (isTrial) {
        next.status = "trial";
        next.source = "rc_intro";
        next.trialExpiresAt = expIso ?? next.trialExpiresAt;
        next.sourceHistory = appendHistory(
          next.sourceHistory,
          "rc_intro",
          "initial_purchase_trial",
          evtIso,
        );
      } else {
        next.status = "pro";
        next.source = "rc_paid";
        next.trialExpiresAt = null;
        next.sourceHistory = appendHistory(
          next.sourceHistory,
          "rc_paid",
          "initial_purchase",
          evtIso,
        );
      }
      next.willAutoRenew = true;
      next.cancelReason = null;
      next.expiresAt = expIso ?? null;
      next.notificationAnchorAt = evtIso;
      return next;
    }
    case "RENEWAL": {
      const wasTrial = next.status === "trial";
      const trialEndedMs = next.trialExpiresAt
        ? Date.parse(next.trialExpiresAt)
        : Number.POSITIVE_INFINITY;
      const leavingTrial =
        wasTrial && event.event_timestamp_ms >= trialEndedMs;
      if (leavingTrial) {
        next.status = "pro";
        next.source = "rc_paid";
        next.trialExpiresAt = null;
        next.sourceHistory = appendHistory(
          next.sourceHistory,
          "rc_paid",
          "renewal_trial_converted",
          evtIso,
        );
      } else if (!wasTrial) {
        next.status = "pro";
        if (next.source !== "rc_paid") {
          next.source = "rc_paid";
          next.sourceHistory = appendHistory(
            next.sourceHistory,
            "rc_paid",
            "renewal",
            evtIso,
          );
        }
      }
      // Stay-in-trial branch: no status change, no source change.
      next.willAutoRenew = true;
      next.cancelReason = null;
      next.expiresAt = expIso ?? next.expiresAt;
      next.notificationAnchorAt = evtIso;
      return next;
    }
    case "PRODUCT_CHANGE": {
      // Upgrade/downgrade. Do NOT reset trialExpiresAt. Do NOT reset
      // notificationAnchorAt (DCSA risk: would restart 6-month clock).
      next.productId = event.new_product_id;
      next.expiresAt = expIso ?? next.expiresAt;
      return next;
    }
    case "CANCELLATION": {
      if (event.cancel_reason === "SUBSCRIPTION_REPLACED") {
        // PRODUCT_CHANGE follows; ignore the implicit cancellation.
        return next;
      }
      next.willAutoRenew = false;
      next.cancelReason = event.cancel_reason;
      // status stays — actual revocation arrives via EXPIRATION.
      return next;
    }
    case "UNCANCELLATION": {
      next.willAutoRenew = true;
      next.cancelReason = null;
      return next;
    }
    case "SUBSCRIPTION_PAUSED": {
      next.status = "paused";
      // Source unchanged — entitlement still implicitly held until
      // expiration (Android-only path; defensive for cross-platform).
      return next;
    }
    case "EXPIRATION": {
      next.status = "lapsed";
      next.willAutoRenew = false;
      return next;
    }
    case "BILLING_ISSUE": {
      next.status = "grace";
      return next;
    }
    case "REFUND": {
      next.status = "free";
      next.source = null;
      next.trialExpiresAt = null;
      next.willAutoRenew = false;
      next.expiresAt = null;
      next.sourceHistory = appendHistory(
        next.sourceHistory,
        "refund",
        "refund",
        evtIso,
      );
      return next;
    }
    case "REFUND_REVERSED": {
      next.status = "pro";
      const restored = lastNonTempSource(next.sourceHistory) ?? "rc_paid";
      next.source = restored;
      next.willAutoRenew = true;
      next.expiresAt = expIso ?? next.expiresAt;
      next.sourceHistory = appendHistory(
        next.sourceHistory,
        restored,
        "refund_reversed",
        evtIso,
      );
      return next;
    }
    case "TEMPORARY_ENTITLEMENT_GRANT": {
      next.status = "pro";
      next.source = "rc_temp";
      next.trialExpiresAt = null;
      next.expiresAt = new Date(
        event.event_timestamp_ms + TEMP_GRANT_TTL_MS,
      ).toISOString();
      next.sourceHistory = appendHistory(
        next.sourceHistory,
        "rc_temp",
        "temp_grant",
        evtIso,
      );
      return next;
    }
    case "TRANSFER": {
      const losing = event.transferred_from?.includes(event.app_user_id);
      const winning = event.transferred_to?.includes(event.app_user_id);
      if (losing) {
        next.status = "free";
        next.source = null;
        next.trialExpiresAt = null;
        next.willAutoRenew = false;
        next.expiresAt = null;
        next.sourceHistory = appendHistory(
          next.sourceHistory,
          "transfer_away",
          "transfer_away",
          evtIso,
        );
      }
      // Winning side requires a cross-row read; handled in the mutation.
      return next;
    }
    case "SUBSCRIBER_ALIAS": {
      // Idempotent — handler ensures the row is reachable by app_user_id.
      return next;
    }
    case "SUBSCRIPTION_EXTENDED": {
      // Documented exception to out-of-order protection: only updates
      // trialExpiresAt; status stays.
      next.trialExpiresAt = expIso ?? next.trialExpiresAt;
      next.expiresAt = expIso ?? next.expiresAt;
      next.trialExpiresAtOnly = true;
      return next;
    }
    default: {
      // Should be unreachable thanks to the discriminated union; defensive.
      const _exhaustive: never = event;
      void _exhaustive;
      return next;
    }
  }
}

function isStaleEvent(
  row: SubscriptionRow | null,
  event: RevenueCatWebhookEvent["event"],
): boolean {
  if (!row) return false;
  if (event.type === "SUBSCRIPTION_EXTENDED") return false;
  if (row.lastEventId && row.lastEventId === event.id) return true;
  if (
    row.lastEventTimestampMs !== undefined &&
    event.event_timestamp_ms < row.lastEventTimestampMs
  ) {
    return true;
  }
  return false;
}

function eventTouchesEntitlement(
  event: RevenueCatWebhookEvent["event"],
): boolean {
  if (!event.entitlement_ids || event.entitlement_ids.length === 0) {
    // RC payloads omit `entitlement_ids` for some lifecycle events
    // (TRANSFER, SUBSCRIBER_ALIAS). Treat as relevant.
    return true;
  }
  return event.entitlement_ids.includes(ENTITLEMENT_ID);
}

function shouldAutoDemoteTempGrant(
  row: SubscriptionRow | null,
  nowMs: number,
): boolean {
  if (!row) return false;
  if (row.status !== "pro") return false;
  if (row.source !== "rc_temp") return false;
  if (!row.expiresAt) return false;
  const expMs = Date.parse(row.expiresAt);
  return Number.isFinite(expMs) && expMs <= nowMs;
}

function autoDemoteTempGrant(state: NextState, nowIso: string): NextState {
  return {
    ...state,
    status: "free",
    source: null,
    trialExpiresAt: null,
    willAutoRenew: false,
    expiresAt: null,
    sourceHistory: appendHistory(
      state.sourceHistory,
      "temp_grant_expired",
      "temp_grant_expired",
      nowIso,
    ),
  };
}

function isProForRead(status?: SubscriptionStatus): boolean {
  return status === "pro" || status === "trial" || status === "grace";
}

// Public query — returns the full state-machine row plus a convenience
// `isPro` boolean. Replaces `getStatus` for new callers; `getStatus` is
// kept as a thin alias for backwards compat until V1.1.
export const getSubscriptionState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        isPro: false,
        status: "free" as SubscriptionStatus,
        source: null,
        productId: null,
        expiresAt: null,
        trialExpiresAt: null,
        willAutoRenew: false,
        cancelReason: null,
        sourceHistory: [],
        lastVerifiedAt: null,
        notificationAnchorAt: null,
        emailOptOut: false,
        storefrontCountry: null,
      };
    }

    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const row = subscriptions[0] ?? null;

    return {
      isPro: isProForRead(row?.status),
      status: (row?.status ?? "free") as SubscriptionStatus,
      source: row?.source ?? null,
      productId: row?.productId ?? null,
      expiresAt: row?.expiresAt ?? null,
      trialExpiresAt: row?.trialExpiresAt ?? null,
      willAutoRenew: row?.willAutoRenew ?? false,
      cancelReason: row?.cancelReason ?? null,
      sourceHistory: row?.sourceHistory ?? [],
      lastVerifiedAt: row?.lastVerifiedAt ?? null,
      notificationAnchorAt: row?.notificationAnchorAt ?? null,
      emailOptOut: row?.emailOptOut ?? false,
      storefrontCountry: row?.storefrontCountry ?? null,
    };
  },
});

// Public query: legacy `getStatus`. Kept for callers that still read
// `{ isActive, productId, expiresAt }`. Internally derived from the
// state machine.
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { isActive: false };

    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const row = subscriptions[0] ?? null;

    return {
      isActive: isProForRead(row?.status),
      productId: row?.productId,
      expiresAt: row?.expiresAt,
    };
  },
});

// Internal query: check subscription for a specific userId (used by actions)
export const checkSubscription = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    if (process.env.DEV_BYPASS_SUBSCRIPTION === "true") return true;

    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return isProForRead(subscriptions[0]?.status);
  },
});

// Public mutation: ensure this user is mapped to RevenueCat app_user_id.
// Non-authoritative for entitlement state.
export const registerCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const now = isoNow();
    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const [primary, ...duplicates] = subscriptions;
    const revenuecatAppUserId = userId;

    if (primary) {
      await ctx.db.patch(primary._id, {
        revenuecatAppUserId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSubscriptions", {
        userId,
        revenuecatAppUserId,
        entitlement: "pro",
        isActive: false,
        status: "free",
        willAutoRenew: false,
        sourceHistory: [],
        emailOptOut: false,
        updatedAt: now,
      });
    }

    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
    }
  },
});

// Public action: verify the caller's subscription via RevenueCat REST API,
// then update the database.  Prevents malicious clients from granting
// themselves Pro access by calling a mutation directly.
export const syncFromClient = action({
  args: {
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    store: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const revenuecatApiKey = process.env.REVENUECAT_API_KEY;

    let verified = false;
    let verifiedProductId: string | undefined;
    let verifiedStore: string | undefined;
    let verifiedExpiresAt: string | undefined;

    if (revenuecatApiKey) {
      const response = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
        { headers: { Authorization: `Bearer ${revenuecatApiKey}` } },
      );

      if (response.ok) {
        const data = await response.json();
        const entitlements = data?.subscriber?.entitlements ?? {};
        const entitlement = entitlements[ENTITLEMENT_ID];

        if (entitlement) {
          const expiresDate = entitlement.expires_date;
          const isExpired =
            expiresDate && Date.parse(expiresDate) <= Date.now();
          verified = !isExpired;
          verifiedProductId = entitlement.product_identifier;
          verifiedStore = entitlement.store;
          verifiedExpiresAt = expiresDate ?? undefined;
        }
      } else {
        const status = response.status;
        if (status >= 500 || status === 429 || status === 408) {
          console.warn(
            `[RevenueCat] API verification failed with transient error (${status}). ` +
              "Preserving current subscription state — will sync on next successful verification.",
          );
          return;
        } else {
          console.error(
            `[RevenueCat] API verification failed (${status}); ` +
              "not trusting client-provided data.",
          );
        }
      }
    } else {
      console.warn(
        "[RevenueCat] REVENUECAT_API_KEY is not set – cannot verify " +
          "subscription server-side. Defaulting to inactive.",
      );
      verified = false;
    }

    await ctx.runMutation(internal.subscriptions.upsertSubscription, {
      userId,
      isActive: verified,
      productId: verifiedProductId,
      store: verifiedStore,
      expiresAt: verifiedExpiresAt,
    });
  },
});

// Internal mutation: upsert subscription record (called by syncFromClient).
// Maps the server-verified entitlement onto the state machine — `isActive`
// becomes `pro` (rc_paid) or `free`.
export const upsertSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
    productId: v.optional(v.string()),
    store: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    subscriptions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const [primary, ...duplicates] = subscriptions;
    const now = isoNow();

    const status: SubscriptionStatus = args.isActive ? "pro" : "free";
    const source: SubscriptionSource | undefined = args.isActive
      ? "rc_paid"
      : undefined;

    if (primary) {
      await ctx.db.patch(primary._id, {
        revenuecatAppUserId: args.userId,
        entitlement: "pro",
        isActive: args.isActive,
        productId: args.productId,
        store: args.store,
        expiresAt: args.expiresAt,
        status,
        source,
        willAutoRenew: args.isActive,
        lastVerifiedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSubscriptions", {
        userId: args.userId,
        revenuecatAppUserId: args.userId,
        entitlement: "pro",
        isActive: args.isActive,
        productId: args.productId,
        store: args.store,
        expiresAt: args.expiresAt,
        status,
        source,
        willAutoRenew: args.isActive,
        sourceHistory: [],
        lastVerifiedAt: now,
        emailOptOut: false,
        updatedAt: now,
      });
    }

    for (const duplicate of duplicates) {
      await ctx.db.delete(duplicate._id);
    }
  },
});

async function findRowByAppUserId(
  ctx: { db: { query: (table: "userSubscriptions") => any } },
  appUserId: string,
): Promise<SubscriptionRow | null> {
  const matches = await ctx.db
    .query("userSubscriptions")
    .withIndex("by_revenuecat_id", (q: any) =>
      q.eq("revenuecatAppUserId", appUserId),
    )
    .collect();
  matches.sort((a: SubscriptionRow, b: SubscriptionRow) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return matches[0] ?? null;
}

// Internal mutation: apply a typed RevenueCat webhook event to the row.
// Idempotent + out-of-order-protected. The HTTP handler in convex/http.ts
// is the only caller.
export const updateFromWebhook = internalMutation({
  // Webhook payloads are validated by `isRevenueCatEvent` in the HTTP
  // handler; we accept v.any() here to avoid duplicating the discriminated
  // union as a Convex validator (no enum support, very large surface).
  args: { event: v.any() },
  handler: async (ctx, { event: rawEvent }) => {
    if (!isRevenueCatEvent(rawEvent)) {
      console.warn(
        "[RevenueCat] updateFromWebhook received non-event payload — ignoring",
      );
      return;
    }
    const event = rawEvent.event;

    if (!eventTouchesEntitlement(event)) {
      console.log(
        `[RevenueCat] event ${event.type} (${event.id}) targets unrelated entitlements ${JSON.stringify(event.entitlement_ids ?? [])} — ignored`,
      );
      return;
    }

    const row = await findRowByAppUserId(ctx, event.app_user_id);

    if (isStaleEvent(row, event)) {
      console.log(
        `[RevenueCat] ignored_stale_event type=${event.type} id=${event.id} ts=${event.event_timestamp_ms} lastTs=${row?.lastEventTimestampMs ?? 0}`,
      );
      return;
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let workingRow = row;

    // Pre-step: auto-demote a stale rc_temp before applying the new event
    // (Risk mitigation in plan-02).
    if (shouldAutoDemoteTempGrant(workingRow, nowMs) && workingRow) {
      const demoted = autoDemoteTempGrant(rowToState(workingRow), nowIso);
      await ctx.db.patch(workingRow._id, {
        status: demoted.status,
        source: demoted.source ?? undefined,
        trialExpiresAt: demoted.trialExpiresAt ?? undefined,
        willAutoRenew: demoted.willAutoRenew,
        expiresAt: demoted.expiresAt ?? undefined,
        sourceHistory: demoted.sourceHistory,
        updatedAt: nowIso,
      });
      workingRow = await ctx.db.get(workingRow._id);
    }

    const next = computeNextState(workingRow, event);

    // SUBSCRIBER_ALIAS: bind the row to original_app_user_id so future
    // events keyed on either ID hit the same row. Idempotent.
    if (event.type === "SUBSCRIBER_ALIAS" && workingRow) {
      const aliased = await findRowByAppUserId(ctx, event.original_app_user_id);
      if (!aliased) {
        await ctx.db.patch(workingRow._id, {
          revenuecatAppUserId: event.original_app_user_id,
          updatedAt: nowIso,
          lastEventId: event.id,
          lastEventTimestampMs: event.event_timestamp_ms,
        });
      }
      return;
    }

    // TRANSFER (winning side): inherit state from one of the source rows.
    let inheritedFromTransfer: NextState | null = null;
    if (event.type === "TRANSFER") {
      const winning = event.transferred_to?.includes(event.app_user_id);
      if (winning) {
        for (const fromId of event.transferred_from ?? []) {
          const sourceRow = await findRowByAppUserId(ctx, fromId);
          if (sourceRow) {
            inheritedFromTransfer = {
              ...rowToState(sourceRow),
              sourceHistory: appendHistory(
                rowToState(workingRow).sourceHistory,
                sourceRow.source ?? "transfer",
                "transfer_in",
                nowIso,
              ),
            };
            break;
          }
        }
      }
    }

    const finalState = inheritedFromTransfer ?? next;

    const patch: Partial<SubscriptionRow> = {
      status: finalState.status,
      source: finalState.source ?? undefined,
      trialExpiresAt: finalState.trialExpiresAt ?? undefined,
      willAutoRenew: finalState.willAutoRenew,
      sourceHistory: finalState.sourceHistory,
      cancelReason: finalState.cancelReason ?? undefined,
      notificationAnchorAt: finalState.notificationAnchorAt ?? undefined,
      productId: finalState.productId ?? undefined,
      store: finalState.store ?? undefined,
      expiresAt: finalState.expiresAt ?? undefined,
      isActive: isProForRead(finalState.status),
      updatedAt: nowIso,
      lastEventId: event.id,
      lastEventTimestampMs: event.event_timestamp_ms,
    };

    // SUBSCRIPTION_EXTENDED is the documented exception: only update
    // trialExpiresAt + expiresAt; do not advance lastEventTimestampMs.
    if (next.trialExpiresAtOnly) {
      if (!workingRow) return;
      await ctx.db.patch(workingRow._id, {
        trialExpiresAt: finalState.trialExpiresAt ?? undefined,
        expiresAt: finalState.expiresAt ?? undefined,
        updatedAt: nowIso,
      });
      return;
    }

    if (workingRow) {
      await ctx.db.patch(workingRow._id, patch);
      return;
    }

    // No row yet — create one. Only possible when app_user_id maps to a
    // Convex user id (the userId === revenuecatAppUserId convention from
    // registerCurrentUser).
    const normalizedUserId = ctx.db.normalizeId("users", event.app_user_id);
    if (!normalizedUserId) {
      console.warn(
        `[RevenueCat] cannot upsert: app_user_id ${event.app_user_id} does not map to a Convex user`,
      );
      return;
    }

    await ctx.db.insert("userSubscriptions", {
      userId: normalizedUserId as Id<"users">,
      revenuecatAppUserId: event.app_user_id,
      entitlement: "pro",
      isActive: isProForRead(finalState.status),
      productId: finalState.productId ?? undefined,
      store: finalState.store ?? undefined,
      expiresAt: finalState.expiresAt ?? undefined,
      status: finalState.status,
      source: finalState.source ?? undefined,
      sourceHistory: finalState.sourceHistory,
      cancelReason: finalState.cancelReason ?? undefined,
      trialExpiresAt: finalState.trialExpiresAt ?? undefined,
      willAutoRenew: finalState.willAutoRenew,
      notificationAnchorAt: finalState.notificationAnchorAt ?? undefined,
      emailOptOut: false,
      updatedAt: nowIso,
      lastEventId: event.id,
      lastEventTimestampMs: event.event_timestamp_ms,
    });
  },
});

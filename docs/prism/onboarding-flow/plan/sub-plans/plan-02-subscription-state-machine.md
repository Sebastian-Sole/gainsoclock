# Sub-Plan 02: Subscription State Machine

## Dependencies
- **Requires:** plan-00 (entitlement constant in `lib/subscription-constants.ts`, rotation doc at `docs/revenuecat-webhook-rotation.md`), plan-01 (extended `userSubscriptions` schema with optional state-machine columns, new indexes, `subscriptionStatusValidator` + `subscriptionSourceValidator`).
- **Blocks:** plan-08 (paywall interstitial reads state-machine status; trial confirmation banner reads `trialExpiresAt`).

## Objective
Replace the current boolean `isPro` model with a first-class subscription state machine that survives every RevenueCat event in the wild — including the ones today's webhook handler silently drops. This phase rewrites `convex/subscriptions.ts` around a pure-function status computation, extends `convex/http.ts` to handle the full RC event set with dual-token webhook auth and out-of-order event protection, introduces Convex crons for the DCSA 6-monthly + 48h-before-charge reminder emails via Resend, ships a one-shot migration for the 2 existing TestFlight rows, and migrates every consumer (`stores/subscription-store.ts`, `hooks/use-purchases.ts`, `components/paywall.tsx`, `app/settings/index.tsx:103`) off `isPro` onto the state machine. No UI surface changes beyond read-site migration — the custom `<NativePaywall>` is explicitly V1.1.

## Context

### Stack facts
- **Convex:** backend typechecks via `pnpm convex:dev`. Webhook handler lives in `convex/http.ts` via Convex's HTTP router. Actions for third-party IO (Resend email).
- **RevenueCat:** `react-native-purchases` + `react-native-purchases-ui` on iOS. The module surfaces as `rnpModule.default ?? rnpModule` due to a known v9 CJS/ESM quirk — preserve that lazy pattern (RC F4).
- **Resend:** email provider — new dependency. Use the Resend REST API via `fetch` in a Convex action; do NOT install a heavy SDK. `EMAIL_SERVICE_API_KEY` in Convex env.
- **Package manager:** pnpm. `pnpm.overrides` pins `react-native-nitro-modules@0.32.2`. Do not bump.

### Coding conventions that apply here
- No `any`. Webhook payload is typed via a shared `RevenueCatWebhookEvent` discriminated union in `convex/revenuecat-types.ts`.
- No `enum`. Use literal unions.
- `getAuthUserId` on every public query/mutation. Webhook endpoint is authenticated by RC signature, not by user — document this explicitly.
- Never import `react-native-purchases` from components. All RC calls funnel through `hooks/use-purchases.ts` + `stores/subscription-store.ts`.
- Timing-safe string compare for the webhook token: use Node's `crypto.timingSafeEqual`. Convex runtime exposes Node built-ins via `"use node"` directive on actions; the webhook handler is an HTTP action and has Node access.

### Gate decisions + themes that apply
- **Theme J (state machine):** all RC events handled; `paused`; `rc_temp` with 24h auto-demote; refund/transfer; `cancelReason`; `sourceHistory`; out-of-order protection. Replaces `isPro`.
- **Theme L (webhook token rotation):** dual-token window with 7d overlap; rotation runbook at `docs/revenuecat-webhook-rotation.md` (shipped in plan-00).
- **Offline-Sync #5 + RC F3:** compare `event_timestamp_ms` vs stored `lastEventTimestampMs`. Ignore stale. Debug-log ignored events.
- **Offline-Sync #10:** client never evaluates `Date.now() > trialExpiresAt`. Server `status` is truth; `trialExpiresAt` is display-only ("2 days left").
- **Convex-Realtime C6:** daily crons with idempotency columns (`reminder48hSentAt`, `dcsaNotifiedAt`).
- **Performance #5:** `configurePurchases()` deferred via `InteractionManager.runAfterInteractions` from the root layout (plan-03 owns the mount order — but this phase must not regress it).
- **RC F10:** RC Experiments disabled dashboard-side in V1. A/B via PostHog.
- **Out of scope:** custom `<NativePaywall>` (V1.1), app-local grace as user-facing trial (primitive built, not exposed), DMA external-purchase, Vipps-on-paywall.

### Files this sub-plan touches
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/subscriptions.ts` — rewrite `upsertSubscription` + `updateFromWebhook`; add `getSubscriptionState` query.
  - `/Users/sebastiansole/Documents/gainsoclock/convex/http.ts` — extend RC webhook handler (dual-token, full event coverage, out-of-order protection).
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-purchases.ts` — add `getOfferings()` + `checkTrialOrIntroDiscountEligibility()`; preserve `rnpModule.default ?? rnpModule`; migrate to state-machine reads; respect out-of-order rule on `syncCustomerInfo`.
  - `/Users/sebastiansole/Documents/gainsoclock/stores/subscription-store.ts` — extend with all new fields; read-sites stop evaluating `trialExpiresAt` as truth.
  - `/Users/sebastiansole/Documents/gainsoclock/providers/convex-sync-provider.tsx` — ensure subscription sync path respects the new state-machine fields (plumbing-only).
  - `/Users/sebastiansole/Documents/gainsoclock/components/paywall.tsx` — migrate to `status`-based gate, not `isPro`.
  - `/Users/sebastiansole/Documents/gainsoclock/app/settings/index.tsx` — line 103 migrate to state-machine read.
  - `/Users/sebastiansole/Documents/gainsoclock/package.json` — pin `react-native-purchases` + `react-native-purchases-ui` to exact versions (drop `^`).
- **New:**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/revenuecat-types.ts` — discriminated union + type guards for webhook payloads.
  - `/Users/sebastiansole/Documents/gainsoclock/convex/crons.ts` — Convex cron declarations.
  - `/Users/sebastiansole/Documents/gainsoclock/convex/subscriptionCrons.ts` — internal handlers called by crons.
  - `/Users/sebastiansole/Documents/gainsoclock/convex/email.ts` — Resend wrapper action (`sendTrialReminder48h`, `sendDcsa6Month`, `sendUnsubscribe`).
  - `/Users/sebastiansole/Documents/gainsoclock/convex/migrations.ts` — `migrateSubscriptionsV2` internal mutation for the 2 TestFlight rows.
- **Env vars added (Convex env, documented in plan-10's enumeration table):**
  - `REVENUECAT_WEBHOOK_AUTH_TOKEN` (exists)
  - `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` (new — 7d rotation)
  - `REVENUECAT_REST_API_KEY` (new — for REST verify on TEMPORARY_ENTITLEMENT_GRANT edge cases)
  - `EMAIL_SERVICE_API_KEY` (new — Resend)

### Data contracts

**`convex/revenuecat-types.ts`** — discriminated union covering every event the handler must accept:

```ts
type BaseEvent = {
  api_version: string;
  event: {
    id: string;
    event_timestamp_ms: number;
    app_user_id: string;
    original_app_user_id?: string;
    product_id?: string;
    entitlement_ids?: string[];
    environment: "SANDBOX" | "PRODUCTION";
    store?: "APP_STORE" | "PLAY_STORE" | "STRIPE" | "AMAZON" | "MAC_APP_STORE";
    expiration_at_ms?: number;
    purchased_at_ms?: number;
  };
};
type InitialPurchase = BaseEvent & { event: { type: "INITIAL_PURCHASE" } & BaseEvent["event"] };
type Renewal       = BaseEvent & { event: { type: "RENEWAL" } & BaseEvent["event"] };
type ProductChange = BaseEvent & { event: { type: "PRODUCT_CHANGE", new_product_id: string } & BaseEvent["event"] };
type Cancellation  = BaseEvent & { event: { type: "CANCELLATION", cancel_reason:
  | "UNSUBSCRIBE" | "BILLING_ERROR" | "DEVELOPER_INITIATED"
  | "PRICE_INCREASE" | "CUSTOMER_SUPPORT" | "UNKNOWN" | "SUBSCRIPTION_REPLACED"
} & BaseEvent["event"] };
type Uncancellation     = BaseEvent & { event: { type: "UNCANCELLATION" } & BaseEvent["event"] };
type SubscriptionPaused = BaseEvent & { event: { type: "SUBSCRIPTION_PAUSED" } & BaseEvent["event"] };
type Expiration    = BaseEvent & { event: { type: "EXPIRATION", expiration_reason?: string } & BaseEvent["event"] };
type BillingIssue  = BaseEvent & { event: { type: "BILLING_ISSUE" } & BaseEvent["event"] };
type Refund        = BaseEvent & { event: { type: "REFUND" } & BaseEvent["event"] };
type RefundReversed= BaseEvent & { event: { type: "REFUND_REVERSED" } & BaseEvent["event"] };
type TempGrant     = BaseEvent & { event: { type: "TEMPORARY_ENTITLEMENT_GRANT" } & BaseEvent["event"] };
type Transfer      = BaseEvent & { event: { type: "TRANSFER",
  transferred_from: string[]; transferred_to: string[];
} & BaseEvent["event"] };
type SubscriberAlias = BaseEvent & { event: { type: "SUBSCRIBER_ALIAS", original_app_user_id: string } & BaseEvent["event"] };

export type RevenueCatWebhookEvent =
  | InitialPurchase | Renewal | ProductChange | Cancellation | Uncancellation
  | SubscriptionPaused | Expiration | BillingIssue | Refund | RefundReversed
  | TempGrant | Transfer | SubscriberAlias;
```

**State computation rules** (implement in `convex/subscriptions.ts` as a pure helper):

| Event | status transition | source mutation | trialExpiresAt | willAutoRenew | sourceHistory append | notes |
|-------|-------------------|-----------------|----------------|----------------|----------------------|-------|
| INITIAL_PURCHASE (trial eligible) | → `trial` | `rc_intro` | set from `expiration_at_ms` | `true` | yes, `reason: "initial_purchase_trial"` | set `notificationAnchorAt` |
| INITIAL_PURCHASE (paid, no trial) | → `pro` | `rc_paid` | clear | `true` | yes | set `notificationAnchorAt` |
| RENEWAL | from `trial` → `pro` if past trial end else stay; else `pro` | `rc_paid` (if changed) | clear if leaving trial | `true` | yes only on source change | reset `notificationAnchorAt` to renewal ts |
| PRODUCT_CHANGE | stay | keep source | **do NOT reset trialExpiresAt on upgrade** | stay | no | update `productId` |
| CANCELLATION | if `cancel_reason === "SUBSCRIPTION_REPLACED"` → stay; else `willAutoRenew = false`, status stays until EXPIRATION | no change | stay | `false` | no | store `cancelReason` |
| UNCANCELLATION | stay | stay | stay | `true` | no | — |
| SUBSCRIPTION_PAUSED | → `paused` | stay | stay | stay | no | keep entitlement (Android-only, defensive) |
| EXPIRATION | → `lapsed` (previously incorrectly "grace → lapsed"; unify on EXPIRATION) | stay | stay | `false` | no | — |
| BILLING_ISSUE | → `grace` | stay | stay | stay | no | user sees "grace" in Settings (plan-08) |
| REFUND | → `free` | `null` | clear | `false` | yes, `reason: "refund"` | audit row |
| REFUND_REVERSED | → `pro` | last non-null from history | restore | `true` | yes, `reason: "refund_reversed"` | — |
| TEMPORARY_ENTITLEMENT_GRANT | → `pro` | `rc_temp` | set `expiresAt = now + 24h` | stay | yes, `reason: "temp_grant"` | cron auto-demotes |
| TRANSFER (losing side) | → `free` | `null` | clear | `false` | yes, `reason: "transfer_away"` | — |
| TRANSFER (winning side) | → inherit from source | inherit | inherit | inherit | yes | — |
| SUBSCRIBER_ALIAS | idempotent no-op | no change | no change | no change | no | just ensure row reachable by `original_app_user_id` |

**Out-of-order protection:** before applying any transition, compare `incomingEvent.event_timestamp_ms` vs `row.lastEventTimestampMs ?? 0`. If incoming is strictly less → log `"ignored_stale_event"` with both timestamps + event type → return 200 OK to RC (do not 4xx; RC retries on 4xx).

**Exception:** `SUBSCRIPTION_EXTENDED` (if RC sends it) with past-timestamp still updates `trialExpiresAt` — this is the documented edge case (Security #8). Treat as opt-in write of `trialExpiresAt` only, no status transition.

**`convex/crons.ts`:**
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("trial-reminder-48h", { hourUTC: 8, minuteUTC: 0 },
  internal.subscriptionCrons.sendTrialReminders);
crons.daily("dcsa-6-monthly", { hourUTC: 9, minuteUTC: 0 },
  internal.subscriptionCrons.sendDcsa6Month);
crons.interval("rc-temp-demote", { hours: 1 },
  internal.subscriptionCrons.demoteExpiredTempGrants);
export default crons;
```

**`convex/subscriptionCrons.ts`:** internal handlers:
- `sendTrialReminders`: scan `by_status_trialExpiresAt` where `status === "trial"` AND `trialExpiresAt ∈ [now + 46h, now + 50h]` AND `reminder48hSentAt IS NULL` → call Resend action → patch `reminder48hSentAt`. `emailOptOut: true` falls back to `expo-notifications` local notification (schedule via Convex-scheduled `internal.subscriptionCrons.scheduleLocalReminder`).
- `sendDcsa6Month`: scan `by_status_notificationAnchorAt` where `status === "pro"` AND `notificationAnchorAt + 183d < now` AND (`dcsaNotifiedAt === null` OR `dcsaNotifiedAt < notificationAnchorAt + 183d`) → Resend → patch `dcsaNotifiedAt`.
- `demoteExpiredTempGrants`: scan `by_status` where `status === "pro"` AND `source === "rc_temp"` AND `expiresAt < now` → patch to `status: "free"`, `source: null`, append `sourceHistory` row `reason: "temp_grant_expired"`.

### Gotchas (from reviews, pulled inline)

- **RC F1:** current handler references `GRACE_PERIOD_EXPIRED` — that event does NOT exist in the RC payload schema. Replace every reference with `EXPIRATION`. The handler's "grace → lapsed" transition happens when an `EXPIRATION` event arrives for a row currently in `grace`.
- **RC F3 / Theme L:** timing-safe compare is mandatory; simple `===` leaks timing info over the network. Use `crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(envToken))` after length-check.
- **RC F4:** `Purchases = rnpModule.default ?? rnpModule` must remain. `getOfferings` is pulled from the same resolved object. Any version bump PR re-validates this.
- **Offline-Sync #10:** `trialExpiresAt` is display-only. Search consumers for `Date.now() > trialExpiresAt` — there must be zero hits after this phase. Client renders "2 days left" from `trialExpiresAt`; the `status` transition is server-authored by the cron.
- **Security #8:** replay tests in exit criteria — old-timestamp `INITIAL_PURCHASE` no-ops; `SUBSCRIPTION_EXTENDED` with past timestamp still updates `trialExpiresAt` (the one exception).
- **RC F2 / Theme K:** `ENTITLEMENT_ID` is imported from `lib/subscription-constants.ts` (shipped plan-00). The webhook accepts events where `entitlement_ids` includes `ENTITLEMENT_ID`; events with unrelated entitlements are logged and 200-OK'd.
- **Performance #5:** `configurePurchases()` mount stays deferred via `InteractionManager.runAfterInteractions`. Do not move the SDK init eager.
- **Out of scope:** `<NativePaywall>` (V1.1). If `RevenueCatUI` is null at runtime, plan-08's interstitial falls back to an in-component `Purchases.purchasePackage(pkg)` button. The state-machine writes that flow through are covered here — the interstitial UI is plan-08.

## Implementation

1. **Pin RC to exact versions.**
   - **File:** `package.json`
   - **What:** change `"react-native-purchases": "^9.x.y"` → `"9.x.y"`; same for `react-native-purchases-ui`.
   - **Approach:** commit `pnpm-lock.yaml` change. Document in PR that bumps require a re-validation PR per RC F4.
   - **Test:** `pnpm install`; app builds on iOS.

2. **Create `convex/revenuecat-types.ts`.**
   - **What:** discriminated union per Data contracts + a type guard `isRevenueCatEvent(payload: unknown): payload is RevenueCatWebhookEvent`.
   - **Approach:** narrow via `event.type` runtime check; throw typed error on unknown type (log + 200 OK to RC — unknown future events should not block the webhook).
   - **Test:** `pnpm convex:dev`.

3. **Rewrite `convex/subscriptions.ts`.**
   - **What:**
     - Replace `upsertSubscription` with a pure helper `computeNextState(row, event): { status, source, trialExpiresAt, willAutoRenew, sourceHistory, cancelReason, notificationAnchorAt }` per the transition table above.
     - Rewrite `updateFromWebhook({ event })` (internal mutation) to: (a) look up row by `revenuecatAppUserId` via `by_revenuecat_id`, (b) out-of-order check, (c) call `computeNextState`, (d) patch row + set `lastEventTimestampMs = event.event_timestamp_ms`, `lastEventId = event.id`.
     - Add `getSubscriptionState` public query — reads `userSubscriptions` by `getAuthUserId`, returns full state. Replaces whatever `isPro` boolean the current query returns; keep a computed `isPro` boolean in the return (`status === "trial" || status === "pro" || status === "grace"`) so consumers can migrate incrementally without breaking the subscription store.
   - **Approach:** pure function + idempotent mutation. Every transition has a unit-of-work pattern: compute → patch → return. No side effects outside Convex.
   - **Test:** `pnpm convex:dev`; unit-test via dev REPL — send a fake `INITIAL_PURCHASE` through `internal.subscriptions.updateFromWebhook`, verify row.

4. **Extend `convex/http.ts` — RC webhook handler.**
   - **What:**
     - Read `Authorization` header; compare via `crypto.timingSafeEqual` against `REVENUECAT_WEBHOOK_AUTH_TOKEN` first, then `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` if present. On both fail → 401. On length mismatch → 401.
     - Parse body; run `isRevenueCatEvent`. If unknown type → log + 200.
     - Call `internal.subscriptions.updateFromWebhook({ event })`.
     - Return 200 within 5s — RC retries on non-200. Heavy work (email via Resend) is scheduled via `ctx.scheduler.runAfter(0, ...)` to keep webhook fast.
   - **Approach:** this is an HTTP action; use Convex's `httpRouter()`. Keep the handler pure and fast.
   - **Test:** `pnpm convex:dev`; `curl` a fake webhook payload at the dev deployment with valid + invalid + stale + unknown-type payloads. All cases logged correctly.

5. **Create `convex/email.ts` (Resend wrapper action).**
   - **What:**
     - `"use node"` directive.
     - Exports `sendTrialReminder48h({ userId, trialExpiresAt, storefrontCountry })`, `sendDcsa6Month({ userId })`, `sendUnsubscribe({ userId })`.
     - Implementation: `fetch("https://api.resend.com/emails", { headers: { Authorization: "Bearer " + process.env.EMAIL_SERVICE_API_KEY } })`. English V1; storefrontCountry hook in place for V1.1 localisation (NB/SV/DA/FI).
     - Include `unsubscribeFromLegalReminders` link in email body; the link hits a Convex HTTP endpoint that flips `userSubscriptions.emailOptOut = true`.
   - **Test:** `pnpm convex:dev`; trigger manually from dashboard with a test recipient.

6. **Create `convex/subscriptionCrons.ts`.**
   - **What:** the three internal handlers per Data contracts (`sendTrialReminders`, `sendDcsa6Month`, `demoteExpiredTempGrants`).
   - **Approach:** each handler scans the relevant index; paginate if needed (`paginationOpts`). Resend action called via `ctx.scheduler.runAfter(0, internal.email.sendTrialReminder48h, {...})` to decouple.
   - **Test:** `pnpm convex:dev`.

7. **Create `convex/crons.ts`.**
   - **What:** per Data contract.
   - **Approach:** `export default crons;` — Convex CLI picks it up automatically.
   - **Test:** `pnpm convex:dev`; Convex dashboard shows the three scheduled jobs.

8. **Create `convex/migrations.ts`.**
   - **What:** `migrateSubscriptionsV2` internal mutation. Scan all `userSubscriptions` rows; for each, derive `status`/`source`/`trialExpiresAt`/`willAutoRenew` from the existing `(isActive, expiresAt, productId)` tuple. Rule:
     - `isActive === false` → `status: "free"`, `source: null`.
     - `isActive === true` AND `productId` contains `"annual"` AND `expiresAt` within 7 days of the row's `updatedAt` → `status: "trial"`, `source: "rc_intro"`, `trialExpiresAt: expiresAt`.
     - `isActive === true` otherwise → `status: "pro"`, `source: "rc_paid"`.
   - **Run:** manually via Convex dashboard for the 2 TestFlight rows. Log affected row count.
   - **Test:** `pnpm convex:dev`; inspect dashboard after manual run.

9. **Extend `stores/subscription-store.ts`.**
   - **What:** add fields mirroring the state-machine row (`status`, `source`, `trialExpiresAt`, `willAutoRenew`, `sourceHistory`, `cancelReason`, `lastVerifiedAt`, `notificationAnchorAt`, `emailOptOut`, `storefrontCountry`). Keep a derived `isPro` selector but mark it `@deprecated — use status === "pro" | "trial" | "grace"`.
   - **Approach:** Zustand state update only. Do not cache Convex results in Zustand — the subscription store receives state pushes from `providers/convex-sync-provider.tsx` on `getSubscriptionState` query changes. Do not duplicate the Convex subscription.
   - **Test:** `npx tsc --noEmit`.

10. **Extend `hooks/use-purchases.ts`.**
    - **What:**
      - Preserve `Purchases = rnpModule.default ?? rnpModule`.
      - Add `getOfferings()` — wraps `Purchases.getOfferings()` with a per-session cache (in-memory, cleared on sign-out).
      - Add `checkTrialOrIntroDiscountEligibility(skus: string[])` — passes through to RC.
      - Update `syncCustomerInfo`: before applying, compare `customerInfo.requestDate` to the store's `lastVerifiedAt`; ignore if stale (Offline-Sync #5).
      - Migrate to reading state-machine fields via `getSubscriptionState` query.
    - **Approach:** do not restructure the hook wholesale — incremental addition + surgical migration.
    - **Test:** `npx tsc --noEmit`; manual — run app with a dev account; confirm `getOfferings` returns; confirm `syncCustomerInfo` no-ops on stale dev payloads (log line appears).

11. **Migrate `components/paywall.tsx` + `app/settings/index.tsx`.**
    - **What:** replace any `if (isPro)` / `subscription.isActive` read with `status === "pro" || status === "trial" || status === "grace"` from the state machine. Specifically at `app/settings/index.tsx:103` — the gate there must respect paused/lapsed/free states distinctly (show "Resume trial" copy in `lapsed`, "Billing issue — update payment" in `grace`, etc. — but the UI copy details are plan-08's responsibility; this phase just migrates the read).
    - **Test:** `npx tsc --noEmit`; manual — boot as a free user, a trialing user (simulated via dashboard patch), a grace user.

12. **Verify `providers/convex-sync-provider.tsx`.**
    - **What:** confirm the provider plumbs `getSubscriptionState` query → `subscription-store.setState`. No logic change expected — just confirm the new fields flow through.
    - **Test:** `npx tsc --noEmit`; manual smoke.

13. **Create/update `docs/revenuecat-webhook-rotation.md`.**
    - **What:** plan-00 shipped the skeleton; this phase fills in the operational steps tied to the dual-token handler above. Add a "how to test rotation" subsection with `curl` examples against the dev webhook URL.
    - **Test:** content review only.

14. **Run the migration on TestFlight rows.**
    - **What:** from Convex dashboard, invoke `internal.migrations.migrateSubscriptionsV2`. Inspect the resulting rows manually — 2 users, state-machine fields populated.
    - **Test:** dashboard inspection; export rows; attach to PR description for audit.

### Test discipline
- Steps 1–3: `pnpm convex:dev` after each.
- Step 4: `curl` replay suite (old INITIAL_PURCHASE → no-op; past-timestamp SUBSCRIPTION_EXTENDED → updates trialExpiresAt; unknown type → 200 logged; wrong token → 401; `_PREVIOUS` token → 200).
- Step 5–6: trigger Resend with a dev recipient; confirm delivery.
- Step 7: dashboard shows crons.
- Step 9–12: `npx tsc --noEmit`.
- Step 14: verified row state.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `react-native-purchases` + `react-native-purchases-ui` pinned to exact versions (no `^`) in `package.json`.
- [ ] Code: `convex/revenuecat-types.ts` exports a discriminated union covering all 13 event types listed in Data contracts.
- [ ] Code: `convex/subscriptions.ts` contains a pure `computeNextState` helper; `updateFromWebhook` is idempotent and out-of-order-protected.
- [ ] Code: `convex/http.ts` webhook handler accepts both `REVENUECAT_WEBHOOK_AUTH_TOKEN` and `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` via `crypto.timingSafeEqual`; unknown event types return 200 with log line.
- [ ] Code: `convex/crons.ts` declares `trial-reminder-48h`, `dcsa-6-monthly`, `rc-temp-demote`.
- [ ] Code: `convex/email.ts` uses `"use node"` + `fetch` to the Resend REST API.
- [ ] Code: `convex/migrations.ts` exports `migrateSubscriptionsV2`.
- [ ] Code: `stores/subscription-store.ts` + `hooks/use-purchases.ts` consume state-machine fields; no `Date.now() > trialExpiresAt` in client code.
- [ ] Code: `components/paywall.tsx` + `app/settings/index.tsx:103` read `status`, not `isPro` directly.
- [ ] Grep: zero hits for `GRACE_PERIOD_EXPIRED` (replaced with `EXPIRATION`).
- [ ] Grep: zero hits for `Date.now() > trialExpiresAt` in client code.
- [ ] `Purchases = rnpModule.default ?? rnpModule` preserved in `hooks/use-purchases.ts`.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys; cron dashboard shows the three jobs.
- [ ] Lint: `pnpm lint` passes.
- [ ] Manual smoke: fake webhook `curl` replay suite passes:
  - Valid `INITIAL_PURCHASE` → row transitions to `trial` with `source: "rc_intro"`.
  - Same event replayed with older `event_timestamp_ms` → no-op, log line emitted.
  - `CANCELLATION` with `cancel_reason: "UNSUBSCRIBE"` → `willAutoRenew: false`, status unchanged until `EXPIRATION`.
  - `TEMPORARY_ENTITLEMENT_GRANT` → status `pro`, `source: "rc_temp"`, `expiresAt` 24h out; cron demotes after simulated TTL.
  - `REFUND` → `free`, sourceHistory appended; `REFUND_REVERSED` restores.
  - `TRANSFER` two-sided behaves per transition table.
  - Wrong token → 401; `_PREVIOUS` token → 200.
- [ ] Manual: `migrateSubscriptionsV2` run against the 2 TestFlight rows — both have `status`, `source`, `trialExpiresAt` populated.
- [ ] Manual: Resend sends a test trial-reminder email end-to-end.
- [ ] Out-of-scope (explicitly): custom `<NativePaywall>` (V1.1), app-local grace user-facing surface, Vipps, DMA external-purchase, Bokmål/SV/DA/FI email copy (English V1).

## Risks

- **Risk:** webhook handler takes >5s and RC marks the endpoint unhealthy.
  - **Detect:** RC dashboard reports 5xx/timeout rate.
  - **Mitigate:** `ctx.scheduler.runAfter(0, ...)` any work heavier than a patch. The webhook is mutation + enqueue only.
  - **Escalate:** if Convex action scheduling itself is slow, revisit architecture.

- **Risk:** timing-safe compare throws on length mismatch because `Buffer.from(a).length !== Buffer.from(b).length`.
  - **Detect:** 401 on every request.
  - **Mitigate:** length-check before `timingSafeEqual`; on mismatch, still run `timingSafeEqual` against a dummy same-length buffer to avoid timing-side-channel on length.
  - **Escalate:** if Convex Node runtime lacks `crypto.timingSafeEqual`, fall back to `node:crypto` import under `"use node"`.

- **Risk:** transition table has an off-by-one on `trial → pro` boundary (renewal at exactly trial expiry).
  - **Detect:** manual replay test.
  - **Mitigate:** use `>=` on the comparison; `RENEWAL` is always considered to move us out of trial if `trialExpiresAt <= event_timestamp_ms`.
  - **Escalate:** if RC sends RENEWAL before trial end on edge reinstall cases, prefer `RENEWAL.event_timestamp_ms > trialExpiresAt` as the disambiguator. Document the edge case.

- **Risk:** DCSA anchor reset on upgrade (PRODUCT_CHANGE) resets the 6-month clock inappropriately.
  - **Detect:** dashboard audit of `notificationAnchorAt` changes per user.
  - **Mitigate:** `PRODUCT_CHANGE` must NOT reset `notificationAnchorAt`. Only `INITIAL_PURCHASE` and `RENEWAL` set it. Add explicit comment in the transition handler.
  - **Escalate:** Nordic DCSA pivot is a legal requirement — if uncertain, consult Sebastian before shipping.

- **Risk:** `rc_temp` grant never expires because the cron missed a window.
  - **Detect:** `rc-temp-demote` runs hourly; a stuck row shows up after 24h.
  - **Mitigate:** at `updateFromWebhook` entry, if incoming event affects a row whose `source === "rc_temp"` and `expiresAt < now`, demote first then apply the new event.
  - **Escalate:** add a one-off reconciliation task in plan-10 pre-ship.

- **Risk:** migration-v2 row count mismatch.
  - **Detect:** expected 2 rows; script logs differ.
  - **Mitigate:** dry-run first — add a `logOnly: true` arg that prints without patching. Once verified, re-run with `logOnly: false`.
  - **Escalate:** if there are >2 rows, investigate before running — may indicate orphan subscription rows from old builds.

- **Risk:** `react-native-purchases` v9 `rnpModule.default ?? rnpModule` pattern breaks on a version bump.
  - **Detect:** app crashes on import at boot after upgrade.
  - **Mitigate:** the pinned version in step 1 prevents accidental bumps. Any future bump is a dedicated PR with this pattern re-validated.
  - **Escalate:** RC F4 is load-bearing. Ping plan-08 owner before any bump.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green; `convex/crons.ts` jobs visible on dashboard.
4. Maestro: not applicable this phase (no UI surface beyond read-site migration; plan-08 owns the paywall Maestro flow).
5. Manual smoke: run the `curl` webhook replay suite above; run Resend send; verify the two TestFlight subscription rows post-migration.
6. Report diffs. Include the manual webhook `curl` commands and expected vs observed responses in the completion report.

# RevenueCat Webhook Auth Token Rotation

## Why dual-token

Rotating the RevenueCat webhook auth token in a single step drops any event
in flight that was signed with the previous value. The server accepts both
`REVENUECAT_WEBHOOK_AUTH_TOKEN` and `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS`
during a rotation window so no event is lost.

Covers RC F3 / Theme L from the onboarding-flow Prism synthesis.

## How to rotate

1. Copy the current value of `REVENUECAT_WEBHOOK_AUTH_TOKEN` into
   `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` in the Convex dashboard.
2. Generate a new random token (≥ 32 bytes, base64 or hex).
3. Set `REVENUECAT_WEBHOOK_AUTH_TOKEN` to the new value in Convex.
4. In the RevenueCat dashboard, update the webhook Authorization header to
   the new value. Trigger a test event; confirm the server accepts it.
5. Wait 7 days. Any events retried by RevenueCat inside this window still
   carry the old header and are accepted via the `_PREVIOUS` slot.
6. Delete `REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` from Convex.

## What the server does

The webhook handler in `convex/http.ts` compares the incoming
`Authorization` header against both `REVENUECAT_WEBHOOK_AUTH_TOKEN` and
`REVENUECAT_WEBHOOK_AUTH_TOKEN_PREVIOUS` with a constant-time string
comparison (`timingSafeEqualString`). If either matches, the event is
accepted. If neither matches, the event is rejected with 401.

The `Authorization` header is accepted both as a raw token value and as a
`Bearer <token>` form — the handler strips the `Bearer ` prefix before
comparison.

Why constant-time: a naive `===` short-circuits on the first byte mismatch
and leaks token length / prefix bytes through response timing. Convex HTTP
actions run in the V8 runtime (no Node `crypto.timingSafeEqual`), so we
implement the constant-time compare in JS.

## How to test rotation

The Convex dev URL is printed when `pnpm convex:dev` boots
(e.g. `https://abc-123.convex.site`). Replace `$URL` and `$TOKEN` below.

### 1. Confirm current token works

```bash
curl -X POST "$URL/webhooks/revenuecat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_version": "1.0",
    "event": {
      "id": "test-event-1",
      "type": "INITIAL_PURCHASE",
      "event_timestamp_ms": '$(date +%s%3N)',
      "app_user_id": "rc-test-user",
      "environment": "SANDBOX",
      "entitlement_ids": ["fitbull_pro"],
      "product_id": "fitbull_pro_annual",
      "expiration_at_ms": '$(($(date +%s%3N) + 7*86400*1000))'
    }
  }'
# → 200 OK
```

### 2. Confirm wrong token is rejected

```bash
curl -X POST "$URL/webhooks/revenuecat" \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{}'
# → 401 Unauthorized
```

### 3. Confirm `_PREVIOUS` token is accepted during the rotation window

After completing step 1 of the rotation procedure (copying the current
token to `_PREVIOUS` and setting a new value for the primary token):

```bash
# Old token still works (because it's in _PREVIOUS):
curl -X POST "$URL/webhooks/revenuecat" \
  -H "Authorization: Bearer $OLD_TOKEN" \
  -d '{...same payload as step 1, with a new event id...}'
# → 200 OK

# New token also works:
curl -X POST "$URL/webhooks/revenuecat" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -d '{...same payload...}'
# → 200 OK
```

### 4. Confirm out-of-order event is dropped

Send the same payload as step 1 with an `event_timestamp_ms` smaller than
the previously processed value for the same `app_user_id` — the handler
returns 200 OK (RC retries on 4xx/5xx, so we 200 stale events) and emits
an `ignored_stale_event` log line.

### 5. Confirm unknown event types are tolerated

```bash
curl -X POST "$URL/webhooks/revenuecat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_version": "1.0",
    "event": {
      "id": "test-event-x",
      "type": "FUTURE_EVENT_TYPE",
      "event_timestamp_ms": 1700000000000,
      "app_user_id": "rc-test-user",
      "environment": "SANDBOX"
    }
  }'
# → 200 OK with `unknown_or_unhandled_event` log line
```

## Ownership

- Owner: Sebastian (@sebastian.solelt@gmail.com).
- Consumer: plan-02 implementer (webhook handler wiring).

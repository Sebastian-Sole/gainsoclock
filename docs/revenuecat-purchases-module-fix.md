# RevenueCat Purchases Module Import Fix

## Issue

After upgrading to `react-native-purchases` v9.x, all purchase-related functionality broke. Users saw the error:

> **"Purchase Error. Something went wrong while opening purchases. Please try again."**

This occurred when:
- Opening the Chat tab (which shows the paywall for non-subscribers)
- Tapping "View Plans" on the onboarding screen
- Attempting to restore purchases from Settings

## Root Cause

`react-native-purchases` v9.x changed its export structure. Previous versions used a **default export** for the SDK:

```js
// Old (pre-v9) - default export
const Purchases = require("react-native-purchases").default; // SDK object
```

In v9.x, the default export was removed. All SDK functions (`configure`, `logIn`, `getCustomerInfo`, `restorePurchases`, etc.) are now **named exports** directly on the module:

```js
// v9.x - no default export
const module = require("react-native-purchases");
module.default;    // undefined
module.configure;  // function
module.logIn;      // function
```

Because the codebase used `.default`, the `Purchases` variable was silently set to `undefined`. The lazy-load try/catch didn't catch this because the `require()` itself succeeded — it was `.default` that was missing.

This caused `presentPaywall()` to hit the early return at the null-check (`if (!Purchases) return "error"`) before ever reaching the RevenueCat UI.

## Affected Files

- `hooks/use-purchases.ts` — main purchase hook (SDK init + paywall presentation)
- `providers/convex-sync-provider.tsx` — SDK user identification (`Purchases.logIn`)

## Fix

Changed the import pattern to fall back to the module itself when `.default` is not present:

```js
// Before
Purchases = require("react-native-purchases").default;

// After
const rnpModule = require("react-native-purchases");
Purchases = rnpModule.default ?? rnpModule;
```

This is backwards-compatible — if a future version re-introduces a default export, it will be preferred via the nullish coalescing operator.

## How to Verify

1. Run the app on iOS simulator
2. Open the Chat tab as a non-subscriber — the paywall should appear without errors
3. Tap "View Plans" — the RevenueCat paywall UI should open
4. Go to Settings and tap "Restore Purchases" — should attempt restoration without the error alert

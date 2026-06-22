import { api } from "@/convex/_generated/api";
import type {
  CustomerInfo,
  LogLevelMap,
  PaywallResultMap,
  PurchasesShim,
  RevenueCatUIShim,
} from "@/lib/purchases-types";
import { ENTITLEMENT_ID } from "@/lib/subscription-constants";
import { useSubscriptionStore } from "@/stores/subscription-store";
import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { Linking, Platform } from "react-native";

// Lazy-load native modules to avoid crashes when not linked.
//
// RC F4: react-native-purchases v9 ships as CJS but Metro can pick up an
// ESM facade depending on bundler config — `rnpModule.default ?? rnpModule`
// is load-bearing and must be preserved across version bumps.
let Purchases: PurchasesShim | null = null;
let RevenueCatUI: RevenueCatUIShim | null = null;
let PAYWALL_RESULT: PaywallResultMap = {};
let LOG_LEVEL: LogLevelMap = {} as LogLevelMap;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rnpModule = require("react-native-purchases") as {
    default?: PurchasesShim;
    LOG_LEVEL?: LogLevelMap;
  } & PurchasesShim;
  Purchases = (rnpModule.default ?? rnpModule) as PurchasesShim;
  if (rnpModule.LOG_LEVEL) {
    LOG_LEVEL = rnpModule.LOG_LEVEL;
  }
} catch (e) {
  console.warn("[Purchases] react-native-purchases not available:", e);
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rnpUiModule = require("react-native-purchases-ui") as {
    default: RevenueCatUIShim;
    PAYWALL_RESULT: PaywallResultMap;
  };
  RevenueCatUI = rnpUiModule.default;
  PAYWALL_RESULT = rnpUiModule.PAYWALL_RESULT;
} catch (e) {
  console.warn("[Purchases] react-native-purchases-ui not available:", e);
}

/**
 * Log the RevenueCat SDK out of the current app user. Safe to call on web
 * (no-op) and when the native module is unavailable. Never throws.
 */
export async function logOutPurchases(): Promise<void> {
  if (Platform.OS === "web" || !Purchases?.logOut) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn("[Purchases] logOut failed:", err);
  }
}

export type CustomerCenterResult =
  | "opened"
  | "fallback_url"
  | "unavailable"
  | "error";

function getActiveEntitlement(customerInfo: CustomerInfo) {
  const activeEntitlements = customerInfo?.entitlements?.active ?? {};
  const configuredEntitlement = activeEntitlements[ENTITLEMENT_ID];

  if (configuredEntitlement) {
    return {
      activeEntitlement: configuredEntitlement,
      entitlementId: ENTITLEMENT_ID,
      isActive: true,
    };
  }

  return {
    activeEntitlement: undefined,
    entitlementId: null,
    isActive: false,
  };
}

function customerInfoRequestMs(info: CustomerInfo): number | null {
  const raw = info.requestDate;
  if (!raw) return null;
  if (raw instanceof Date) return raw.getTime();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

let isConfigured = false;

export function configurePurchases() {
  if (isConfigured || !Purchases) return;

  const apiKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
    android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID,
  });

  if (!apiKey) {
    console.warn("[Purchases] No RevenueCat API key for this platform");
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey });
  if (__DEV__) {
    Purchases.setLogHandler((level: string, message: string) => {
      if (level === "ERROR") {
        console.warn(`[RevenueCat] ${message}`);
      } else {
        console.log(`[RevenueCat] [${level}] ${message}`);
      }
    });
  }
  isConfigured = true;
}

// Per-session cache of `getOfferings()` so the paywall interstitial doesn't
// re-fetch on every render. Cleared on sign-out via `clearOfferingsCache`.
let cachedOfferings: unknown | null = null;

export function clearOfferingsCache() {
  cachedOfferings = null;
}

export async function getOfferings(): Promise<unknown | null> {
  if (!Purchases) return null;
  if (cachedOfferings) return cachedOfferings;
  try {
    cachedOfferings = await Purchases.getOfferings();
    return cachedOfferings;
  } catch (error) {
    console.warn("[Purchases] getOfferings failed:", error);
    return null;
  }
}

export async function checkTrialOrIntroDiscountEligibility(
  productIds: string[],
): Promise<Record<string, unknown> | null> {
  if (!Purchases) return null;
  try {
    return await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
  } catch (error) {
    console.warn(
      "[Purchases] checkTrialOrIntroductoryPriceEligibility failed:",
      error,
    );
    return null;
  }
}

export function isRevenueCatUIAvailable(): boolean {
  return Boolean(RevenueCatUI);
}

// Low-level wrapper used by the plan-08 fallback when `RevenueCatUI` is null
// at runtime. Callers are expected to refresh the subscription store via
// `checkStatus` after a successful purchase.
export async function purchasePackageRaw(
  pkg: unknown,
): Promise<"purchased" | "cancelled" | "error"> {
  if (!Purchases) return "error";
  try {
    const { userCancelled, customerInfo } =
      await Purchases.purchasePackage(pkg);
    if (userCancelled) return "cancelled";
    const active = customerInfo?.entitlements?.active ?? {};
    return active[ENTITLEMENT_ID] ? "purchased" : "error";
  } catch (error) {
    const err = error as { userCancelled?: boolean } | undefined;
    if (err?.userCancelled) return "cancelled";
    console.warn("[Purchases] purchasePackage failed:", error);
    return "error";
  }
}

export function usePurchases() {
  const [isLoading, setIsLoading] = useState(false);
  const syncToServer = useAction(api.subscriptions.syncFromClient);

  const fetchCustomerInfoWithRetry = useCallback(async () => {
    if (!Purchases) return null;

    let customerInfo = await Purchases.getCustomerInfo();
    let { isActive } = getActiveEntitlement(customerInfo);

    // RevenueCat entitlement state can lag briefly after checkout/restore.
    for (let attempt = 0; attempt < 3 && !isActive; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      customerInfo = await Purchases.getCustomerInfo();
      ({ isActive } = getActiveEntitlement(customerInfo));
    }

    return customerInfo;
  }, []);

  const syncCustomerInfo = useCallback(
    async (customerInfo: CustomerInfo) => {
      const { isActive, activeEntitlement, entitlementId } =
        getActiveEntitlement(customerInfo);

      // Out-of-order protection (Offline-Sync #5): if this customerInfo is
      // older than the last verified payload we successfully synced, drop
      // it. The webhook is authoritative; in-app `syncCustomerInfo` is a
      // best-effort hint that should never overwrite a newer server state.
      const incomingMs = customerInfoRequestMs(customerInfo);
      const lastVerifiedRaw =
        useSubscriptionStore.getState().lastVerifiedAt;
      const lastVerifiedMs = lastVerifiedRaw
        ? Date.parse(lastVerifiedRaw)
        : null;
      if (
        incomingMs !== null &&
        lastVerifiedMs !== null &&
        Number.isFinite(lastVerifiedMs) &&
        incomingMs < lastVerifiedMs
      ) {
        if (__DEV__) {
          console.log(
            `[Purchases] ignored stale customerInfo (incoming=${incomingMs} < lastVerified=${lastVerifiedMs})`,
          );
        }
        return isActive;
      }

      // Snapshot the fields the optimistic update is about to overwrite so we
      // can restore them verbatim if the server sync fails (e.g. offline). The
      // previous behavior hardcoded `free` here, which downgraded a confirmed
      // Pro/trial user locally until the next successful round-trip.
      const prevState = useSubscriptionStore.getState();
      const prevSnapshot = {
        status: prevState.status,
        productId: prevState.productId,
        expiresAt: prevState.expiresAt,
      };

      // Optimistic local update — the server state machine is still the
      // truth, but the client store needs to reflect intent immediately so
      // the UI doesn't flicker.
      useSubscriptionStore.getState().setSubscription({
        status: isActive ? "pro" : "free",
        productId: activeEntitlement?.productIdentifier ?? null,
        expiresAt: activeEntitlement?.expirationDate ?? null,
      });

      try {
        await syncToServer({
          isActive,
          productId: activeEntitlement?.productIdentifier ?? undefined,
          store: activeEntitlement?.store ?? undefined,
          expiresAt: activeEntitlement?.expirationDate ?? undefined,
        });
      } catch (error) {
        // Restore the pre-optimistic state so a failed sync doesn't leave the
        // persisted store reporting Pro access the server can't confirm — and,
        // crucially, doesn't clobber an already-entitled user with `free`.
        useSubscriptionStore.getState().setSubscription(prevSnapshot);
        console.warn(
          "[Purchases] Failed to sync subscription to server:",
          error,
        );
      }

      if (__DEV__ && !entitlementId) {
        const activeIds = Object.keys(customerInfo?.entitlements?.active ?? {});
        if (activeIds.length > 0) {
          console.warn(
            `[Purchases] Active entitlements (${activeIds.join(", ")}) do not match configured ID "${ENTITLEMENT_ID}".`,
          );
        }
      }

      return isActive;
    },
    [syncToServer],
  );

  // Present RevenueCat's native paywall UI.
  //
  // `offeringIdentifier` lets callers explicitly target an offering by its
  // dashboard ID (e.g. `default` for Test Store dev, `fitbull_pro` for
  // production App Store). This decouples the SDK's runtime offering choice
  // from the dashboard's project-wide Default flag — so we don't have to
  // toggle dashboard state when shipping between Test Store and App Store
  // API keys. If omitted, RC falls back to the Default offering.
  const presentPaywall = useCallback(
    async (
      offeringIdentifier?: string
    ): Promise<"purchased" | "cancelled" | "error"> => {
      if (!RevenueCatUI || !Purchases) return "error";
      try {
        // Resolve the requested offering, if specified.
        let presentArgs: Record<string, unknown> | undefined;
        if (offeringIdentifier) {
          const offerings = await Purchases.getOfferings();
          const offering = offerings?.all?.[offeringIdentifier];
          if (!offering) {
            if (__DEV__) {
              console.warn(
                `[Purchases] No offering with identifier "${offeringIdentifier}" — falling back to default.`,
                {
                  available: Object.keys(offerings?.all ?? {}),
                }
              );
            }
          } else {
            presentArgs = { offering };
          }
        }

        const result = presentArgs
          ? await RevenueCatUI.presentPaywall(presentArgs)
          : await RevenueCatUI.presentPaywall();
        if (__DEV__) {
          console.log("[Purchases] presentPaywall result:", result);
        }
        switch (result) {
          case PAYWALL_RESULT.PURCHASED:
          case PAYWALL_RESULT.RESTORED: {
            if (typeof Purchases.syncPurchasesForResult === "function") {
              await Purchases.syncPurchasesForResult();
            }
            const customerInfo = await fetchCustomerInfoWithRetry();
            if (!customerInfo) return "error";
            const isActive = await syncCustomerInfo(customerInfo);
            return isActive ? "purchased" : "error";
          }
          case PAYWALL_RESULT.ERROR:
            return "error";
          case PAYWALL_RESULT.NOT_PRESENTED:
          case PAYWALL_RESULT.CANCELLED:
          default:
            return "cancelled";
        }
      } catch (error) {
        console.error("[Purchases] Paywall presentation failed:", error);
        return "error";
      }
    },
    [fetchCustomerInfoWithRetry, syncCustomerInfo]
  );

  // Present RevenueCat's Customer Center for subscription management
  const openManagementUrl = useCallback(async (): Promise<boolean> => {
    if (!Purchases) return false;
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const managementUrl: string | undefined =
        customerInfo?.managementURL ?? customerInfo?.managementUrl;
      if (!managementUrl) return false;
      const canOpen = await Linking.canOpenURL(managementUrl);
      if (!canOpen) return false;
      await Linking.openURL(managementUrl);
      return true;
    } catch (error) {
      console.error("[Purchases] Failed to open management URL:", error);
      return false;
    }
  }, []);

  const presentCustomerCenter =
    useCallback(async (): Promise<CustomerCenterResult> => {
      if (!Purchases) return "unavailable" as const;
      try {
        if (!RevenueCatUI) {
          const opened = await openManagementUrl();
          return opened ? ("fallback_url" as const) : ("unavailable" as const);
        }

        await RevenueCatUI.presentCustomerCenter();
        const customerInfo = await fetchCustomerInfoWithRetry();
        if (!customerInfo) return "error" as const;
        await syncCustomerInfo(customerInfo);
        return "opened" as const;
      } catch (error) {
        console.error("[Purchases] Customer Center failed:", error);
        const opened = await openManagementUrl();
        return opened ? ("fallback_url" as const) : ("error" as const);
      }
    }, [fetchCustomerInfoWithRetry, openManagementUrl, syncCustomerInfo]);

  const restore = useCallback(async () => {
    if (!Purchases) return false;
    setIsLoading(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (typeof Purchases.syncPurchasesForResult === "function") {
        await Purchases.syncPurchasesForResult();
      }
      const latestCustomerInfo =
        (await fetchCustomerInfoWithRetry()) ?? customerInfo;
      return await syncCustomerInfo(latestCustomerInfo);
    } catch (error) {
      console.error("[Purchases] Restore failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCustomerInfoWithRetry, syncCustomerInfo]);

  const checkStatus = useCallback(async () => {
    if (!Purchases) return;
    try {
      const customerInfo = await fetchCustomerInfoWithRetry();
      if (!customerInfo) return;
      await syncCustomerInfo(customerInfo);
    } catch (error) {
      console.warn("[Purchases] Failed to check status:", error);
    }
  }, [fetchCustomerInfoWithRetry, syncCustomerInfo]);

  return {
    presentPaywall,
    presentCustomerCenter,
    restore,
    checkStatus,
    getOfferings,
    checkTrialOrIntroDiscountEligibility,
    isLoading,
  };
}

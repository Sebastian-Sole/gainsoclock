import { useCallback, useState } from "react";
import { Linking, Platform } from "react-native";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSubscriptionStore } from "@/stores/subscription-store";

// Lazy-load native modules to avoid crashes when not linked
let Purchases: any = null;
let RevenueCatUI: any = null;
let PAYWALL_RESULT: any = {};
let LOG_LEVEL: any = {};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Purchases = require("react-native-purchases").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LOG_LEVEL = require("react-native-purchases").LOG_LEVEL;
} catch (e) {
  console.warn("[Purchases] react-native-purchases not available:", e);
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RevenueCatUI = require("react-native-purchases-ui").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  PAYWALL_RESULT = require("react-native-purchases-ui").PAYWALL_RESULT;
} catch (e) {
  console.warn("[Purchases] react-native-purchases-ui not available:", e);
}

interface EntitlementInfo {
  productIdentifier?: string;
  store?: string;
  expirationDate?: string;
}

interface CustomerInfo {
  entitlements?: {
    active?: Record<string, EntitlementInfo>;
  };
  managementURL?: string;
  managementUrl?: string;
}
export type CustomerCenterResult =
  | "opened"
  | "fallback_url"
  | "unavailable"
  | "error";

const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Gainsoclock Pro";

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

  const firstActiveEntitlementId = Object.keys(activeEntitlements)[0] ?? null;
  const firstActiveEntitlement = firstActiveEntitlementId
    ? activeEntitlements[firstActiveEntitlementId]
    : undefined;
  if (firstActiveEntitlement) {
    return {
      activeEntitlement: firstActiveEntitlement,
      entitlementId: firstActiveEntitlementId,
      isActive: true,
    };
  }

  return {
    activeEntitlement: undefined,
    entitlementId: null,
    isActive: false,
  };
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

      useSubscriptionStore.getState().setSubscription({
        isPro: isActive,
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
        console.warn("[Purchases] Failed to sync subscription to server:", error);
      }

      if (__DEV__ && !entitlementId) {
        const activeIds = Object.keys(customerInfo?.entitlements?.active ?? {});
        if (activeIds.length > 0) {
          console.warn(
            `[Purchases] Active entitlements (${activeIds.join(", ")}) do not match configured ID "${ENTITLEMENT_ID}".`
          );
        }
      }

      return isActive;
    },
    [syncToServer]
  );

  // Present RevenueCat's native paywall UI
  const presentPaywall = useCallback(
    async (): Promise<"purchased" | "cancelled" | "error"> => {
      if (!RevenueCatUI || !Purchases) return "error";
      try {
        const result = await RevenueCatUI.presentPaywall();
        if (__DEV__) {
          console.log("[Purchases] presentPaywall result:", result);
        }
        switch (result) {
          case PAYWALL_RESULT.PURCHASED:
          case PAYWALL_RESULT.RESTORED: {
            // Prompt RevenueCat to refresh backend receipt processing.
            if (typeof Purchases.syncPurchasesForResult === "function") {
              await Purchases.syncPurchasesForResult();
            }
            // Sync updated customer info after purchase/restore
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

  const presentCustomerCenter = useCallback(
    async (): Promise<CustomerCenterResult> => {
      if (!Purchases) return "unavailable" as const;
      try {
        if (!RevenueCatUI) {
          const opened = await openManagementUrl();
          return opened ? ("fallback_url" as const) : ("unavailable" as const);
        }

        await RevenueCatUI.presentCustomerCenter();
        // Re-sync after customer center (user may have cancelled/changed plan)
        const customerInfo = await fetchCustomerInfoWithRetry();
        if (!customerInfo) return "error" as const;
        await syncCustomerInfo(customerInfo);
        return "opened" as const;
      } catch (error) {
        console.error("[Purchases] Customer Center failed:", error);
        const opened = await openManagementUrl();
        return opened ? ("fallback_url" as const) : ("error" as const);
      }
    },
    [fetchCustomerInfoWithRetry, openManagementUrl, syncCustomerInfo]
  );

  const restore = useCallback(async () => {
    if (!Purchases) return false;
    setIsLoading(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (typeof Purchases.syncPurchasesForResult === "function") {
        await Purchases.syncPurchasesForResult();
      }
      const latestCustomerInfo = (await fetchCustomerInfoWithRetry()) ?? customerInfo;
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
    isLoading,
  };
}

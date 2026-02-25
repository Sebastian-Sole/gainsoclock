import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSubscriptionStore } from "@/stores/subscription-store";

// Lazy-load native modules to avoid crashes when not linked
let Purchases: any = null;
let RevenueCatUI: any = null;
let PAYWALL_RESULT: any = {};
let LOG_LEVEL: any = {};

try {
  Purchases = require("react-native-purchases").default;
  LOG_LEVEL = require("react-native-purchases").LOG_LEVEL;
} catch (e) {
  console.warn("[Purchases] react-native-purchases not available:", e);
}

try {
  RevenueCatUI = require("react-native-purchases-ui").default;
  PAYWALL_RESULT = require("react-native-purchases-ui").PAYWALL_RESULT;
} catch (e) {
  console.warn("[Purchases] react-native-purchases-ui not available:", e);
}

type PurchasesPackage = any;
type CustomerInfo = any;

const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "Gainsoclock Pro";

function getActiveEntitlement(customerInfo: CustomerInfo) {
  const activeEntitlements = customerInfo?.entitlements?.active ?? {};
  const configuredEntitlement = activeEntitlements[ENTITLEMENT_ID];
  const configuredEntitlementId = configuredEntitlement ? ENTITLEMENT_ID : null;

  if (configuredEntitlement) {
    return {
      activeEntitlement: configuredEntitlement,
      entitlementId: configuredEntitlementId,
      isActive: true,
    };
  }

  const firstActiveEntitlementId = Object.keys(activeEntitlements)[0] ?? null;
  const firstActiveEntitlement = firstActiveEntitlementId
    ? activeEntitlements[firstActiveEntitlementId]
    : undefined;

  return {
    activeEntitlement: firstActiveEntitlement,
    entitlementId: firstActiveEntitlementId,
    isActive: firstActiveEntitlement !== undefined,
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
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const syncToServer = useMutation(api.subscriptions.syncFromClient);

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
          revenuecatAppUserId: customerInfo.originalAppUserId,
          isActive,
          productId: activeEntitlement?.productIdentifier,
          expiresAt: activeEntitlement?.expirationDate ?? undefined,
        });
        if (__DEV__ && !entitlementId && isActive) {
          console.warn(
            `[Purchases] Active entitlement found but not under configured ID "${ENTITLEMENT_ID}".`
          );
        }
      } catch (error) {
        console.warn("[Purchases] Failed to sync to server:", error);
      }
    },
    [syncToServer]
  );

  const loadOfferings = useCallback(async () => {
    if (!Purchases) return;
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current?.availablePackages) {
        setPackages(offerings.current.availablePackages);
      }
    } catch (error) {
      console.warn("[Purchases] Failed to load offerings:", error);
    }
  }, []);

  const purchase = useCallback(
    async (pkg: PurchasesPackage) => {
      if (!Purchases) return false;
      setIsLoading(true);
      try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        await syncCustomerInfo(customerInfo);
        return true;
      } catch (error: any) {
        if (!error.userCancelled) {
          console.error("[Purchases] Purchase failed:", error);
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [syncCustomerInfo]
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
            // Sync updated customer info after purchase/restore
            const customerInfo = await Purchases.getCustomerInfo();
            await syncCustomerInfo(customerInfo);
            return "purchased";
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
    [syncCustomerInfo]
  );

  // Present paywall only if the user doesn't have the entitlement
  const presentPaywallIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!RevenueCatUI || !Purchases) return false;
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
      });
      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED: {
          const customerInfo = await Purchases.getCustomerInfo();
          await syncCustomerInfo(customerInfo);
          return true;
        }
        default:
          return false;
      }
    } catch (error) {
      console.error("[Purchases] Paywall presentation failed:", error);
      return false;
    }
  }, [syncCustomerInfo]);

  // Present RevenueCat's Customer Center for subscription management
  const presentCustomerCenter = useCallback(async () => {
    if (!RevenueCatUI || !Purchases) return;
    try {
      await RevenueCatUI.presentCustomerCenter();
      // Re-sync after customer center (user may have cancelled/changed plan)
      const customerInfo = await Purchases.getCustomerInfo();
      await syncCustomerInfo(customerInfo);
    } catch (error) {
      console.error("[Purchases] Customer Center failed:", error);
    }
  }, [syncCustomerInfo]);

  const restore = useCallback(async () => {
    if (!Purchases) return false;
    setIsLoading(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      await syncCustomerInfo(customerInfo);
      const { isActive } = getActiveEntitlement(customerInfo);
      return isActive;
    } catch (error) {
      console.error("[Purchases] Restore failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [syncCustomerInfo]);

  const checkStatus = useCallback(async () => {
    if (!Purchases) return;
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      await syncCustomerInfo(customerInfo);
    } catch (error) {
      console.warn("[Purchases] Failed to check status:", error);
    }
  }, [syncCustomerInfo]);

  return {
    packages,
    loadOfferings,
    purchase,
    presentPaywall,
    presentPaywallIfNeeded,
    presentCustomerCenter,
    restore,
    checkStatus,
    isLoading,
  };
}

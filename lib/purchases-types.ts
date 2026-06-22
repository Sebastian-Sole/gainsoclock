// Minimal type shim for `react-native-purchases` and
// `react-native-purchases-ui`.
//
// We can't `import type` from the SDK at module top-level because the modules
// are lazy-required in `hooks/use-purchases.ts` (Metro's CJS/ESM facade —
// see the comment there). Instead, we re-declare the slice of the SDK
// surface we actually call. Pass-through values (`pkg`, `offering`, paywall
// `result`) are typed as `unknown` and narrowed at the call site.

export interface EntitlementInfo {
  productIdentifier?: string;
  store?: string;
  expirationDate?: string;
}

export interface CustomerInfo {
  entitlements?: {
    active?: Record<string, EntitlementInfo>;
  };
  managementURL?: string;
  managementUrl?: string;
  // RC SDK >= v6 sends ISO strings here; older sends Date.
  requestDate?: string | Date;
}

export interface PurchasePackageResult {
  userCancelled: boolean;
  customerInfo: CustomerInfo;
}

export interface Offerings {
  all?: Record<string, unknown>;
}

export interface LogLevelMap {
  DEBUG: string;
  INFO?: string;
  WARN?: string;
  ERROR?: string;
  VERBOSE?: string;
}

export interface PaywallResultMap {
  PURCHASED?: string;
  RESTORED?: string;
  ERROR?: string;
  CANCELLED?: string;
  NOT_PRESENTED?: string;
}

export interface PurchasesShim {
  configure: (options: { apiKey: string }) => void;
  setLogLevel: (level: string) => void;
  setLogHandler: (fn: (level: string, message: string) => void) => void;
  getOfferings: () => Promise<Offerings>;
  getCustomerInfo: () => Promise<CustomerInfo>;
  purchasePackage: (pkg: unknown) => Promise<PurchasePackageResult>;
  restorePurchases: () => Promise<CustomerInfo>;
  checkTrialOrIntroductoryPriceEligibility: (
    productIds: string[],
  ) => Promise<Record<string, unknown>>;
  syncPurchasesForResult?: () => Promise<unknown>;
  logOut?: () => Promise<unknown>;
}

export interface RevenueCatUIShim {
  presentPaywall: (args?: Record<string, unknown>) => Promise<string>;
  presentCustomerCenter: () => Promise<unknown>;
}

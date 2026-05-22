// Must match the entitlement identifier in the RevenueCat dashboard exactly
// (case-sensitive, including the space). Renaming this requires renaming the
// entitlement in RC, which is safe but propagates to existing subscribers'
// `customerInfo.entitlements.active` keys.
export const ENTITLEMENT_ID = "Gainsoclock Pro" as const;
export type EntitlementId = typeof ENTITLEMENT_ID;

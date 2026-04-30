/**
 * Dev-only RevenueCat diagnostics. Pulled out of `app/onboarding/paywall.tsx`
 * so the screen reads as flow logic, not logging scaffolding.
 *
 * IS: a no-op in production builds, console diagnostics in `__DEV__`.
 * IS NOT: a replacement for the load-bearing `Purchases.logIn(userId)` call
 * in `paywall.tsx` — that call must stay in the screen because it gates the
 * production paywall on a non-anonymous customer. This module only logs.
 */

interface RCEntitlements {
  active?: Record<string, unknown>;
}

interface RCCustomerInfo {
  originalAppUserId?: string;
  entitlements?: RCEntitlements;
}

interface RCOffering {
  identifier?: string;
  availablePackages?: unknown[];
}

interface RCOfferings {
  current?: RCOffering;
  all?: Record<string, RCOffering>;
}

type DiagResult<T> = T | { error: string };

function hasError<T>(value: DiagResult<T>): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/**
 * Logs RevenueCat customer + offerings shape for the given user. No-op in
 * production. Swallows all errors — diagnostics must never affect the flow.
 */
export async function logPaywallDiagnostics(userId: string): Promise<void> {
  if (!__DEV__) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rnp = require('react-native-purchases');
    const Purchases = rnp.default ?? rnp;
    if (!Purchases) return;

    try {
      await Purchases.invalidateCustomerInfoCache?.();
    } catch {
      // older SDKs may not expose it — fine
    }

    // `getAppUserID()` returns the CURRENT user — the right thing to check.
    // `originalAppUserId` on customerInfo never changes after logIn, so
    // checking that field for `$RCAnonymousID:` always returns true for users
    // who started anonymous (= every user).
    const [info, offerings, currentAppUserId] = (await Promise.all([
      Purchases.getCustomerInfo?.().catch((e: unknown) => ({
        error: String(e),
      })),
      Purchases.getOfferings?.().catch((e: unknown) => ({ error: String(e) })),
      Purchases.getAppUserID?.().catch(() => null),
    ])) as [
      DiagResult<RCCustomerInfo> | undefined,
      DiagResult<RCOfferings> | undefined,
      string | null,
    ];

    const customerInfo: RCCustomerInfo =
      info && !hasError(info) ? info : {};
    const offeringsInfo: RCOfferings =
      offerings && !hasError(offerings) ? offerings : {};

    // eslint-disable-next-line no-console
    console.log('[paywall:diag] customer', {
      currentAppUserId,
      expectedId: userId,
      isAnonymous: String(currentAppUserId ?? '').startsWith(
        '$RCAnonymousID:'
      ),
      originalAppUserId: customerInfo.originalAppUserId,
      activeEntitlements: Object.keys(
        customerInfo.entitlements?.active ?? {}
      ),
    });

    const all = offeringsInfo.all ?? {};
    // eslint-disable-next-line no-console
    console.log('[paywall:diag] offerings', {
      hasCurrent: Boolean(offeringsInfo.current),
      currentId: offeringsInfo.current?.identifier ?? null,
      allOfferingIds: Object.keys(all),
      currentPackageCount:
        offeringsInfo.current?.availablePackages?.length ?? 0,
      packagesPerOffering: Object.fromEntries(
        Object.entries(all).map(([id, off]) => [
          id,
          off.availablePackages?.length ?? 0,
        ])
      ),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[paywall:diag] failed', e);
  }
}

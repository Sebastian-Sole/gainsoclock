import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/text';
import {
  PaywallInterstitial,
  type SubscriptionPeriodUnit,
} from '@/components/paywall/paywall-interstitial';
import { usePurchases } from '@/hooks/use-purchases';
import { capture } from '@/lib/analytics';
import { lightHaptic } from '@/lib/haptics';
import { logPaywallDiagnostics } from '@/lib/paywall-diag';
import { useAuthCacheStore } from '@/stores/auth-cache-store';

const LOGIN_TIMEOUT_MS = 4000;
const MARK_COMPLETE_MAX_ATTEMPTS = 3;
const MARK_COMPLETE_BASE_BACKOFF_MS = 500;
// After this long on the spinner, surface a manual escape so a paywall that
// never presents (RC UI unavailable / offerings that never resolve) is never
// a dead-end. Guideline 2.1(a): the pricing step must always be exitable.
const MANUAL_ESCAPE_DELAY_MS = 6000;

// Ceiling for the interstitial's own offering/eligibility fetch. Bounded so a
// hung/absent network never traps the user on the "Loading pricing…" spinner
// — the manual escape timer above is the ultimate safety net if this also
// stalls. Distinct from `presentPaywall`'s internal 8s offerings timeout
// (hooks/use-purchases.ts `OFFERINGS_TIMEOUT_MS`), which guards the RC sheet
// itself once the user taps the CTA.
const OFFERING_FETCH_TIMEOUT_MS = 5000;

// Offering selection by build environment. Decoupled from RC dashboard's
// project-wide Default flag so we don't have to toggle dashboard state when
// switching between Test Store (dev) and App Store (production) API keys.
//
//   - `default`     : Test Store offering with mock products `monthly` /
//                     `yearly`. Lets dev iterate on the paywall without
//                     sandbox account or StoreKit Configuration files.
//   - `fitbull_pro` : Production offering bound to real ASC products
//                     `fitbull_pro_monthly_300326` / `_yearly_300326`.
//
// If you wire a third environment (e.g. preview build for QA), pass the
// matching offering identifier via env or a build-time constant.
const ONBOARDING_OFFERING_ID = __DEV__ ? 'default' : 'fitbull_pro';

// --- Offering narrowing ------------------------------------------------
//
// `usePurchases().getOfferings()` / `checkTrialOrIntroDiscountEligibility()`
// return `unknown` because the native SDK is lazy-required (see the comment
// atop hooks/use-purchases.ts) — there's no static type to trust at the
// module boundary. We narrow by hand, mirroring the `offeringHasPackages`
// pattern already used in that file (`typeof === "object"` + `in` guards),
// rather than casting with `as`.
//
// Field shapes below are verified against the installed
// `react-native-purchases@9.10.4` (`@revenuecat/purchases-typescript-internal`)
// type declarations at implementation time — NOT assumed. Notably,
// `PurchasesStoreProduct.subscriptionPeriod` is an ISO 8601 duration STRING
// ("P1M", "P1Y", ...), not an `{ unit, numberOfUnits }` object; it's parsed
// into that shape below to match `PaywallInterstitialProps`.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type NarrowedIntroPrice = {
  priceString: string;
  price: number;
  periodUnit: string;
  periodNumberOfUnits: number;
};

type NarrowedProduct = {
  identifier: string;
  priceString: string;
  subscriptionPeriodIso: string | null;
  introPrice: NarrowedIntroPrice | null;
};

type NarrowedPackage = {
  identifier: string;
  product: NarrowedProduct;
};

function narrowProduct(value: unknown): NarrowedProduct | null {
  if (!isRecord(value)) return null;
  if (typeof value.identifier !== 'string') return null;
  if (typeof value.priceString !== 'string') return null;
  const subscriptionPeriodIso =
    typeof value.subscriptionPeriod === 'string' ? value.subscriptionPeriod : null;

  let introPrice: NarrowedIntroPrice | null = null;
  if (isRecord(value.introPrice)) {
    const ip = value.introPrice;
    if (
      typeof ip.priceString === 'string' &&
      typeof ip.price === 'number' &&
      typeof ip.periodUnit === 'string' &&
      typeof ip.periodNumberOfUnits === 'number'
    ) {
      introPrice = {
        priceString: ip.priceString,
        price: ip.price,
        periodUnit: ip.periodUnit,
        periodNumberOfUnits: ip.periodNumberOfUnits,
      };
    }
  }

  return {
    identifier: value.identifier,
    priceString: value.priceString,
    subscriptionPeriodIso,
    introPrice,
  };
}

function narrowPackage(value: unknown): NarrowedPackage | null {
  if (!isRecord(value)) return null;
  if (typeof value.identifier !== 'string') return null;
  const product = narrowProduct(value.product);
  if (!product) return null;
  return { identifier: value.identifier, product };
}

// Pick the representative package for the single-CTA interstitial: prefer
// the offering's named `annual`, then `monthly`, then the first resolvable
// entry in `availablePackages`. RC's own prebuilt sheet (opened on CTA) is
// where the user actually picks between plans — this is only the
// above-the-fold teaser price.
function pickRepresentativePackage(offering: Record<string, unknown>): NarrowedPackage | null {
  const annual = narrowPackage(offering.annual);
  if (annual) return annual;
  const monthly = narrowPackage(offering.monthly);
  if (monthly) return monthly;
  if (Array.isArray(offering.availablePackages)) {
    for (const candidate of offering.availablePackages) {
      const narrowed = narrowPackage(candidate);
      if (narrowed) return narrowed;
    }
  }
  return null;
}

function findOffering(offerings: unknown, offeringId: string): Record<string, unknown> | null {
  if (!isRecord(offerings)) return null;
  if (!isRecord(offerings.all)) return null;
  const offering = offerings.all[offeringId];
  return isRecord(offering) ? offering : null;
}

const ISO_PERIOD_UNIT_BY_CODE: Record<string, SubscriptionPeriodUnit> = {
  D: 'day',
  W: 'week',
  M: 'month',
  Y: 'year',
};

function parseSubscriptionPeriod(
  iso: string | null
): { unit: SubscriptionPeriodUnit; numberOfUnits: number } | null {
  if (!iso) return null;
  const match = /^P(\d+)([DWMY])$/.exec(iso);
  if (!match) return null;
  const unit = ISO_PERIOD_UNIT_BY_CODE[match[2]];
  if (!unit) return null;
  return { unit, numberOfUnits: Number(match[1]) };
}

// Free-trial length copy. Falls back to the product config's documented
// default (see components/home/trial-confirmation-banner.tsx,
// paywall-fallback.tsx, both hardcode "7 days") when the SDK's intro-price
// period isn't a genuine free trial (price > 0) or can't be read.
function formatTrialLength(introPrice: NarrowedIntroPrice | null): string {
  if (introPrice && introPrice.price === 0 && introPrice.periodNumberOfUnits > 0) {
    const unitWord = introPrice.periodUnit.toLowerCase();
    return introPrice.periodNumberOfUnits > 1
      ? `${introPrice.periodNumberOfUnits} ${unitWord}s`
      : `1 ${unitWord}`;
  }
  return '7 days';
}

// RC's INTRO_ELIGIBILITY_STATUS enum (react-native-purchases@9.10.4 /
// @revenuecat/purchases-typescript-internal, verified at implementation
// time): UNKNOWN=0, INELIGIBLE=1, ELIGIBLE=2, NO_INTRO_OFFER_EXISTS=3. Any
// other/unrecognized shape defaults to "not eligible" — the safer copy
// ("Subscribe") over a false trial promise.
const INTRO_ELIGIBILITY_STATUS_ELIGIBLE = 2;

function isEligibleForTrial(
  eligibility: Record<string, unknown> | null,
  productId: string
): boolean {
  if (!eligibility) return false;
  const entry = eligibility[productId];
  if (!isRecord(entry)) return false;
  return entry.status === INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
}

// Resolve `promise`, but fall back to `fallback` if it hasn't settled within
// `ms`. Mirrors the `withTimeout` helper in hooks/use-purchases.ts (not
// exported there, so duplicated locally rather than reaching into that
// module's internals).
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

type InterstitialData = {
  priceString: string | null;
  introPriceString: string | null;
  trialLength: string;
  trialEligible: boolean;
  subscriptionPeriod: { unit: SubscriptionPeriodUnit; numberOfUnits: number };
};

const DEFAULT_INTERSTITIAL_DATA: InterstitialData = {
  priceString: null,
  introPriceString: null,
  trialLength: '7 days',
  trialEligible: false,
  // Inert placeholder — `PaywallInterstitial` only reads `subscriptionPeriod`
  // when `priceString` is non-null, which is never true alongside this
  // default.
  subscriptionPeriod: { unit: 'month', numberOfUnits: 1 },
};

/**
 * Onboarding paywall — presents the conversion-designed interstitial
 * (`PaywallInterstitial`) with real offering/trial data, then opens
 * RevenueCat's prebuilt paywall via `RevenueCatUI.presentPaywall()` when the
 * user taps its CTA.
 *
 * IMPORTANT: we explicitly call `Purchases.logIn(userId)` and await its
 * completion before fetching offerings or presenting. The shorter post-pivot
 * onboarding flow (sign-up → demo-chat → founder-note → paywall) hits this
 * screen before `convex-sync-provider`'s background `logIn()` finishes,
 * leaving the SDK with the placeholder `$RCAnonymousID:` user. RC's offering
 * targeting filters anonymous customers out of the default offering, which
 * surfaces as "no current offering configured" inside the sheet.
 *
 * Soft paywall: whatever happens (purchased / cancelled / errored / RC UI
 * unavailable / skipped) we route the user to `/(tabs)` afterward. Apple 4.2
 * wants the app usable for non-subscribers; gating happens later
 * per-feature.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { presentPaywall, checkStatus, getOfferings, checkTrialOrIntroDiscountEligibility } =
    usePurchases();
  const userId = useQuery(api.user.me);
  const markOnboardingComplete = useMutation(api.user.markOnboardingComplete);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);
  const [statusCopy, setStatusCopy] = useState('Opening pricing…');
  const [showManualContinue, setShowManualContinue] = useState(false);
  const [phase, setPhase] = useState<'connecting' | 'ready'>('connecting');
  const [ctaBusy, setCtaBusy] = useState(false);
  const [interstitialData, setInterstitialData] = useState<InterstitialData>(
    DEFAULT_INTERSTITIAL_DATA
  );
  const ranRef = useRef(false);
  const finishedRef = useRef(false);
  const impressionFiredRef = useRef(false);

  // Idempotent "leave onboarding" step. Writes the offline auth cache first
  // (the auth-guard treats it as truth while the server query resolves) then
  // best-effort persists to the server with linear backoff — but always
  // navigates, so a failed mutation never traps the user re-looping onboarding.
  // Guarded by a ref so the present-flow's finally and the manual escape can't
  // double-fire it.
  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    useAuthCacheStore.getState().setHasCompletedOnboarding(true);
    for (let attempt = 0; attempt < MARK_COMPLETE_MAX_ATTEMPTS; attempt++) {
      try {
        await markOnboardingComplete();
        break;
      } catch (markErr) {
        if (__DEV__) {
          console.warn(
            `[paywall] markOnboardingComplete attempt ${attempt + 1} failed`,
            markErr
          );
        }
        if (attempt < MARK_COMPLETE_MAX_ATTEMPTS - 1) {
          await new Promise((r) =>
            setTimeout(r, MARK_COMPLETE_BASE_BACKOFF_MS * (attempt + 1))
          );
        }
      }
    }
    router.replace('/(tabs)');
  }, [markOnboardingComplete, router]);

  // Reveal a manual escape after a short delay. When the interstitial/paywall
  // present normally this is never seen (the ready-phase render replaces it);
  // when login or the offering fetch hangs, this is the user's way out.
  useEffect(() => {
    const t = setTimeout(
      () => setShowManualContinue(true),
      MANUAL_ESCAPE_DELAY_MS
    );
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ranRef.current) return;
    // We need a Convex userId before logging into RC. If the query is still
    // resolving, just wait for the next render.
    if (userId === undefined) return;
    if (userId === null) {
      // Not authenticated — soft fall to tabs. Auth-guard will catch it.
      router.replace('/(tabs)');
      return;
    }
    ranRef.current = true;

    (async () => {
      // 1. Ensure RC has the right (non-anonymous) customer before
      //    presenting. Idempotent — re-logging the same id is a no-op.
      //    This is load-bearing for production: RC offering targeting
      //    filters anonymous customers out of the default offering.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const rnp = require('react-native-purchases');
        const Purchases = rnp.default ?? rnp;
        if (Purchases?.logIn) {
          setStatusCopy('Connecting…');
          if (__DEV__) {
            console.log('[paywall:logIn] calling logIn', { userId });
          }
          try {
            const loginResult = await Promise.race([
              Purchases.logIn(userId),
              new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), LOGIN_TIMEOUT_MS)
              ),
            ]);
            if (__DEV__) {
              if (loginResult === null) {
                console.warn(
                  `[paywall:logIn] timed out after ${LOGIN_TIMEOUT_MS}ms — proceeding anyway`
                );
              } else {
                // After logIn, ask the SDK for the *current* app user id.
                // `customerInfo.originalAppUserId` is the historical first id
                // and never changes — checking it would falsely report
                // "still anonymous" for every user who started anonymous.
                const lr = loginResult as { created?: boolean };
                const currentAppUserId = await Purchases.getAppUserID?.()
                  .catch(() => null);
                console.log('[paywall:logIn] result', {
                  created: lr.created,
                  currentAppUserId,
                  expectedId: userId,
                  match: currentAppUserId === userId,
                });
              }
            }
          } catch (loginErr) {
            if (__DEV__) {
              console.warn('[paywall:logIn] threw', loginErr);
            }
          }
        }

        await logPaywallDiagnostics(userId);
      } catch (e) {
        if (__DEV__) {
          console.warn('[paywall] login/diag failed', e);
        }
      }

      // 2. Resolve offering data for the interstitial's above-the-fold price
      //    disclosure. Bounded (OFFERING_FETCH_TIMEOUT_MS) so a hung/absent
      //    network never traps the user before the interstitial's own skip
      //    control is reachable — the manual escape timer is the last-resort
      //    safety net if this also stalls.
      setStatusCopy('Loading pricing…');
      try {
        const offerings = await withTimeout(getOfferings(), OFFERING_FETCH_TIMEOUT_MS, null);
        const offering = findOffering(offerings, ONBOARDING_OFFERING_ID);
        const pkg = offering ? pickRepresentativePackage(offering) : null;

        if (pkg) {
          const eligibility = await withTimeout(
            checkTrialOrIntroDiscountEligibility([pkg.product.identifier]),
            OFFERING_FETCH_TIMEOUT_MS,
            null
          );
          const trialEligible = isEligibleForTrial(eligibility, pkg.product.identifier);
          const subscriptionPeriod =
            parseSubscriptionPeriod(pkg.product.subscriptionPeriodIso) ??
            DEFAULT_INTERSTITIAL_DATA.subscriptionPeriod;

          setInterstitialData({
            priceString: pkg.product.priceString,
            introPriceString:
              pkg.product.introPrice && pkg.product.introPrice.price > 0
                ? `Then ${pkg.product.introPrice.priceString} for your first billing period.`
                : null,
            trialLength: formatTrialLength(pkg.product.introPrice),
            trialEligible,
            subscriptionPeriod,
          });
        }
        // If no package resolved (offline / offerings not configured yet),
        // `interstitialData` stays at `DEFAULT_INTERSTITIAL_DATA` —
        // `priceString: null` — which `PaywallInterstitial` already renders
        // as "Pricing will load when you're back online."
      } catch (e) {
        if (__DEV__) {
          console.warn('[paywall] offering fetch failed', e);
        }
      } finally {
        setPhase('ready');
      }
    })();
  }, [checkTrialOrIntroDiscountEligibility, getOfferings, router, userId]);

  // CTA — presents RevenueCat's prebuilt paywall, explicitly requesting the
  // offering that matches the current API key environment.
  const handleCta = useCallback(async () => {
    if (ctaBusy) return;
    setCtaBusy(true);
    // Funnel note: this now fires at RC-sheet time, after the interstitial's
    // impression event — see plan 050's maintenance notes.
    capture({
      name: 'paywall_presented',
      props: { placementId: 'onboarding_default' },
    });
    try {
      const result = await presentPaywall(ONBOARDING_OFFERING_ID);

      if (result === 'purchased') {
        capture({ name: 'trial_started', props: { source: 'rc_intro' } });
        await checkStatus();
      } else if (result === 'error') {
        capture({ name: 'revenuecat_ui_unavailable', props: {} });
      } else if (result === 'cancelled') {
        capture({ name: 'paywall_dismissed', props: {} });
      }
    } catch (e) {
      if (__DEV__) {
        console.warn('[paywall] presentPaywall threw', e);
      }
      capture({ name: 'revenuecat_ui_unavailable', props: {} });
      setErrorCopy(e instanceof Error ? e.message : 'Unknown');
    } finally {
      setCtaBusy(false);
      // Mark onboarding complete BEFORE navigating away, or the auth-guard
      // sees `hasCompletedOnboarding: false` on /(tabs) and bounces the user
      // straight back into demo-chat → loop. `finish()` is idempotent.
      await finish();
    }
  }, [checkStatus, ctaBusy, finish, presentPaywall]);

  const handleSkip = useCallback(() => {
    lightHaptic();
    capture({ name: 'paywall_dismissed', props: {} });
    void finish();
  }, [finish]);

  const handleMethodology = useCallback(() => {
    router.push('/methodology');
  }, [router]);

  // Impression event — fires exactly once, when the interstitial first
  // becomes visible.
  useEffect(() => {
    if (phase !== 'ready') return;
    if (impressionFiredRef.current) return;
    impressionFiredRef.current = true;
    capture({
      name: 'paywall_interstitial_shown',
      props: { trialEligible: interstitialData.trialEligible },
    });
  }, [phase, interstitialData.trialEligible]);

  if (phase === 'ready') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <PaywallInterstitial
          priceString={interstitialData.priceString}
          introPriceString={interstitialData.introPriceString}
          trialLength={interstitialData.trialLength}
          trialEligible={interstitialData.trialEligible}
          subscriptionPeriod={interstitialData.subscriptionPeriod}
          ctaDisabled={ctaBusy}
          onCta={() => void handleCta()}
          onSkip={handleSkip}
          onMethodology={handleMethodology}
        />
        {errorCopy && __DEV__ ? (
          <Text className="px-6 pb-4 text-center text-xs text-destructive">
            {errorCopy}
          </Text>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <ActivityIndicator />
        <Text className="mt-3 text-sm text-muted-foreground">
          {statusCopy}
        </Text>
        {errorCopy && __DEV__ ? (
          <Text className="mt-2 text-center text-xs text-destructive">
            {errorCopy}
          </Text>
        ) : null}
        {showManualContinue ? (
          <Pressable
            onPress={() => {
              lightHaptic();
              capture({ name: 'paywall_dismissed', props: {} });
              void finish();
            }}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            hitSlop={10}
            className="mt-8 rounded-2xl bg-primary px-8 py-4 active:opacity-80"
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/text';
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

/**
 * Onboarding paywall — thin wrapper that presents RevenueCat's prebuilt
 * paywall via `RevenueCatUI.presentPaywall()`.
 *
 * IMPORTANT: we explicitly call `Purchases.logIn(userId)` and await its
 * completion before presenting. The shorter post-pivot onboarding flow
 * (sign-up → demo-chat → founder-note → paywall) hits this screen before
 * `convex-sync-provider`'s background `logIn()` finishes, leaving the SDK
 * with the placeholder `$RCAnonymousID:` user. RC's offering targeting
 * filters anonymous customers out of the default offering, which surfaces
 * as "no current offering configured" inside the sheet.
 *
 * Soft paywall: whatever happens (purchased / cancelled / errored / RC UI
 * unavailable) we route the user to `/(tabs)` afterward. Apple 4.2 wants
 * the app usable for non-subscribers; gating happens later per-feature.
 */
export default function PaywallScreen() {
  const router = useRouter();
  const { presentPaywall, checkStatus } = usePurchases();
  const userId = useQuery(api.user.me);
  const markOnboardingComplete = useMutation(api.user.markOnboardingComplete);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);
  const [statusCopy, setStatusCopy] = useState('Opening pricing…');
  const [showManualContinue, setShowManualContinue] = useState(false);
  const ranRef = useRef(false);
  const finishedRef = useRef(false);

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

  // Reveal a manual escape after a short delay. When the paywall presents
  // normally the RC sheet sits on top of this and it's never seen; when the
  // present hangs, this is the user's way out.
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
      capture({
        name: 'paywall_presented',
        props: { placementId: 'onboarding_default' },
      });

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

      // 2. Present the paywall — explicitly request the offering that
      //    matches the current API key environment.
      setStatusCopy('Opening pricing…');
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
        // Mark onboarding complete BEFORE navigating away, or the auth-guard
        // sees `hasCompletedOnboarding: false` on /(tabs) and bounces the user
        // straight back into demo-chat → loop. `finish()` is idempotent.
        await finish();
      }
    })();
  }, [checkStatus, finish, presentPaywall, router, userId]);

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

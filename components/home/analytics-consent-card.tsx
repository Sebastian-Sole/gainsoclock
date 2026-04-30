import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useConvexAuth } from 'convex/react';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useConsent } from '@/hooks/use-consent';
import { capture } from '@/lib/analytics';

/**
 * Inline one-time analytics consent prompt for the Today tab. Existing
 * TestFlight users (and any user reaching the app shell without a row in
 * `userConsents` for `analytics`) see this card until they choose. Writing
 * `false` records a "denied" row, which is enough to permanently dismiss the
 * card — `useConsent` returns the latest row, so `consents.analytics` flips
 * from `null` to a snapshot in either direction.
 *
 * PostHog opt-in/out is wired in `providers/convex-sync-provider.tsx`; this
 * component only writes the consent row and lets that subscription flip the
 * SDK state.
 */
export function AnalyticsConsentCard(): React.JSX.Element | null {
  const { isAuthenticated } = useConvexAuth();
  const { consents, setConsent, isLoading } = useConsent();
  const router = useRouter();
  const [pending, setPending] = useState<'allow' | 'deny' | null>(null);
  const shownRef = useRef(false);

  const shouldRender =
    isAuthenticated && !isLoading && consents.analytics === null;

  useEffect(() => {
    if (!shouldRender || shownRef.current) return;
    shownRef.current = true;
    capture({ name: 'analytics_consent_prompt_shown', props: {} });
  }, [shouldRender]);

  const handleAllow = useCallback(async () => {
    if (pending !== null) return;
    setPending('allow');
    try {
      await setConsent('analytics', true);
      capture({ name: 'analytics_consent_prompt_choice', props: { granted: true } });
    } catch (error) {
      console.warn('[analytics-consent] allow failed', error);
    } finally {
      setPending(null);
    }
  }, [pending, setConsent]);

  const handleDeny = useCallback(async () => {
    if (pending !== null) return;
    setPending('deny');
    try {
      await setConsent('analytics', false);
      capture({ name: 'analytics_consent_prompt_choice', props: { granted: false } });
    } catch (error) {
      console.warn('[analytics-consent] deny failed', error);
    } finally {
      setPending(null);
    }
  }, [pending, setConsent]);

  const handleManage = useCallback(() => {
    router.push('/settings/privacy');
  }, [router]);

  if (!shouldRender) return null;

  return (
    <View
      className="mb-4 gap-3 rounded-2xl border border-border bg-card p-4"
      testID="analytics-consent-card"
    >
      <View>
        <Text className="text-base font-semibold">Help improve Fitbull</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Send anonymous usage analytics so we can find bugs and improve the
          app. We never share your workouts, meals, or personal stats.
        </Text>
      </View>

      <View className="gap-2">
        <Button
          size="onboarding"
          onPress={handleAllow}
          disabled={pending !== null}
          accessibilityRole="button"
          accessibilityLabel="Allow anonymous analytics"
          testID="analytics-consent-allow"
        >
          {pending === 'allow' ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text>Allow analytics</Text>
          )}
        </Button>

        <Pressable
          onPress={handleDeny}
          disabled={pending !== null}
          accessibilityRole="button"
          accessibilityLabel="Decline anonymous analytics"
          hitSlop={8}
          className="h-11 items-center justify-center rounded-md"
          testID="analytics-consent-deny"
        >
          {pending === 'deny' ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-sm font-medium text-muted-foreground">
              Not now
            </Text>
          )}
        </Pressable>
      </View>

      <Pressable
        onPress={handleManage}
        accessibilityRole="link"
        accessibilityLabel="Manage analytics in Privacy settings"
        hitSlop={8}
        className="self-center"
        testID="analytics-consent-manage"
      >
        <Text className="text-xs text-muted-foreground underline">
          Manage in Privacy settings
        </Text>
      </Pressable>
    </View>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { HealthKitPrimerSection } from '@/components/onboarding/healthkit-primer-section';
import { useHealthKit } from '@/hooks/use-healthkit';
import { capture } from '@/lib/analytics';
import { HEALTHKIT_READ_SCOPES } from '@/lib/healthkit';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

export default function OnboardingHealthKitScreen() {
  const router = useRouter();
  const {
    isAvailable,
    enable,
    getAuthorizationStatus,
    getLatestStats,
  } = useHealthKit();
  const setDraftField = useIntakeDraftStore((s) => s.setDraftField);

  const [pending, setPending] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    capture({ name: 'healthkit_primer_shown', props: {} });
  }, []);

  // Android path: HealthKit is iOS-only. We defensively route to manual stats
  // so the flow stays reachable even in debug builds on Android.
  useEffect(() => {
    if (!isAvailable && Platform.OS !== 'ios') {
      router.replace('/onboarding/manual-stats' as never);
    }
  }, [isAvailable, router]);

  const handleDeny = useCallback(() => {
    capture({ name: 'healthkit_denied', props: {} });
    router.push('/onboarding/manual-stats' as never);
  }, [router]);

  const handleGrant = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await enable();
      // Apple's sheet has closed — query the resulting status. Note: Apple
      // will no-op `requestAuthorization` if previously denied. We still
      // consult status after calling so the branch is consistent.
      const status = await getAuthorizationStatus();
      if (status === 'sharingDenied') {
        capture({ name: 'healthkit_denied', props: {} });
        router.push('/onboarding/manual-stats' as never);
        return;
      }

      // Granted or partially granted → prefill what we can and proceed.
      const stats = await getLatestStats();
      if (stats.weightKg != null) setDraftField('weightKg', stats.weightKg);
      if (stats.heightCm != null) setDraftField('heightCm', stats.heightCm);
      if (stats.bodyFatPercent != null)
        setDraftField('bodyFatPercent', stats.bodyFatPercent);

      // Scope names only — never values. HealthKit-Privacy C6.
      capture({
        name: 'healthkit_granted',
        props: { grantedScopes: [...HEALTHKIT_READ_SCOPES] },
      });
      router.push('/onboarding/healthkit-prefill' as never);
    } catch (error) {
      console.warn('[healthkit] grant flow failed', error);
      capture({ name: 'healthkit_denied', props: {} });
      router.push('/onboarding/manual-stats' as never);
    } finally {
      setPending(false);
    }
  }, [
    enable,
    getAuthorizationStatus,
    getLatestStats,
    pending,
    router,
    setDraftField,
  ]);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="pt-4">
        <Text variant="h2" className="border-b-0 pb-0">
          Import from Apple Health (optional).
        </Text>
        <Text className="mt-2 text-muted-foreground">
          A few seconds, and we can skip most of the typing.
        </Text>
      </View>

      <View className="mt-6 gap-3">
        <HealthKitPrimerSection
          kind="wont-read"
          heading="We won't read"
          body="We don't read your sleep, heart rate, cycle, lab results, or workout history."
        />
        <HealthKitPrimerSection
          kind="read"
          heading="We'll read"
          body="Your weight, height, and body fat percentage — so you don't have to type them."
        />
        <HealthKitPrimerSection
          kind="write"
          heading="We'll write"
          body="We'll save workouts you finish to Apple Health so your Fitness rings close."
        />
        <HealthKitPrimerSection
          kind="revocation"
          heading="You're in control"
          body="Change any of this in Settings > Privacy > Health."
        />
      </View>

      <View className="mt-8 gap-3">
        <Button
          size="onboarding"
          onPress={handleGrant}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel="Import from Apple Health"
          testID="onboarding-healthkit-grant"
        >
          {pending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text>Import from Apple Health</Text>
          )}
        </Button>
        <Button
          size="onboarding"
          variant="outline"
          onPress={handleDeny}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel="Not now — enter my details manually"
          testID="onboarding-healthkit-dismiss"
        >
          <Text>Not now</Text>
        </Button>
      </View>
    </ScrollView>
  );
}

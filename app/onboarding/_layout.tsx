import { useMemo } from 'react';
import { View } from 'react-native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressDots } from '@/components/onboarding/progress-dots';
import { useOnboardingStatus } from '@/hooks/use-onboarding-status';
import { useRageQuitTracking } from '@/hooks/use-rage-quit-tracking';

const ONBOARDING_TOTAL = 5;

const STEP_INDEX: Record<string, number> = {
  '/onboarding/goal': 0,
  '/onboarding/experience': 1,
  '/onboarding/days': 2,
  '/onboarding/healthkit': 3,
  '/onboarding/healthkit-prefill': 3,
  '/onboarding/manual-stats': 3,
  '/onboarding/consent': 4,
};

// Routes that run AFTER completeOnboardingV2 flips `hasCompletedOnboarding`.
// Plan-07's aha flow and plan-08's paywall live in `app/onboarding/` but must
// survive the post-consent redirect to `/(tabs)`.
const POST_CONSENT_ROUTES = new Set([
  '/onboarding/analysis',
  '/onboarding/aha',
  '/onboarding/paywall',
]);

export default function OnboardingLayout() {
  const pathname = usePathname();
  const onboarding = useOnboardingStatus();
  useRageQuitTracking(pathname || 'onboarding');

  const stepIndex = useMemo(() => {
    if (!pathname) return 0;
    return STEP_INDEX[pathname] ?? 0;
  }, [pathname]);

  const showDots = pathname in STEP_INDEX;
  const isPostConsent = POST_CONSENT_ROUTES.has(pathname ?? '');

  if (onboarding.status === 'complete' && !isPostConsent) {
    return <Redirect href={'/(tabs)' as never} />;
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {showDots ? (
        <View className="px-6">
          <ProgressDots current={stepIndex} total={ONBOARDING_TOTAL} />
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="demo-chat" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="founder-note"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="goal" />
        <Stack.Screen name="experience" />
        <Stack.Screen name="days" />
        <Stack.Screen name="healthkit" />
        <Stack.Screen
          name="healthkit-prefill"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="manual-stats"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
        <Stack.Screen name="analysis" options={{ gestureEnabled: false }} />
        <Stack.Screen name="aha" options={{ gestureEnabled: false }} />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
      </Stack>
    </SafeAreaView>
  );
}

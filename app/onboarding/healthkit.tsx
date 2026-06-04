import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMutation } from 'convex/react';

import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { useConsent } from '@/hooks/use-consent';
import { useHealthKit } from '@/hooks/use-healthkit';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { capture } from '@/lib/analytics';
import { lightHaptic } from '@/lib/haptics';
import { HEALTHKIT_READ_SCOPES } from '@/lib/healthkit';

/**
 * One-shot onboarding setup screen between the founder note and the paywall.
 * Bundles two preferences that benefit from an explicit moment:
 *   1. Apple Health — an explanatory card whose only action is the shared
 *      Continue CTA. Per App Store Guideline 5.1.1(iv), the priming message
 *      flows straight into the system HealthKit prompt on Continue: there is
 *      no "Skip" exit and no priming verb ("Connect") on the button.
 *   2. Analytics — default ON, single switch the user can flip off.
 *
 * GDPR risk note: pre-checked analytics consent is technically non-compliant
 * under Recital 32 / CJEU Planet49 (consent must be "freely given, specific,
 * informed, unambiguous"). This is a product decision to maximise opt-in
 * rate; legal review may flip the default to off before EU launch.
 *
 * AI-coach consent is intentionally NOT on this screen — it's covered by the
 * Terms acceptance on sign-up (Art. 6(1)(b) performance of contract). The
 * Today-tab analytics card remains the post-onboarding safety net.
 */
export default function OnboardingHealthkitScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { setConsent } = useConsent();
  const { isAvailable, enable, getLatestStats } = useHealthKit();
  const updateHealthStats = useMutation(api.onboarding.updateHealthStats);

  // Default on — user can flip to off before continuing. Either way we always
  // write a consent row at Continue (the user has been shown the toggle and
  // had the chance to decide).
  const [analyticsToggle, setAnalyticsToggle] = useState<boolean>(true);
  const [continuePending, setContinuePending] = useState(false);
  const shownRef = useRef(false);

  // Entry animations — match the founder-note pacing.
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(16);
  const healthOpacity = useSharedValue(0);
  const healthY = useSharedValue(20);
  const analyticsOpacity = useSharedValue(0);
  const analyticsY = useSharedValue(16);
  const ctaOpacity = useSharedValue(0);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    capture({ name: 'onboarding_setup_shown', props: {} });
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      titleOpacity.value = 1;
      titleY.value = 0;
      healthOpacity.value = 1;
      healthY.value = 0;
      analyticsOpacity.value = 1;
      analyticsY.value = 0;
      ctaOpacity.value = 1;
      return;
    }

    const ease = Easing.out(Easing.cubic);
    titleOpacity.value = withTiming(1, { duration: 360, easing: ease });
    titleY.value = withTiming(0, { duration: 360, easing: ease });
    healthOpacity.value = withDelay(
      120,
      withTiming(1, { duration: 420, easing: ease }),
    );
    healthY.value = withDelay(
      120,
      withTiming(0, { duration: 420, easing: ease }),
    );
    analyticsOpacity.value = withDelay(
      260,
      withTiming(1, { duration: 380, easing: ease }),
    );
    analyticsY.value = withDelay(
      260,
      withTiming(0, { duration: 380, easing: ease }),
    );
    ctaOpacity.value = withDelay(
      380,
      withTiming(1, { duration: 380, easing: ease }),
    );

    return () => {
      cancelAnimation(titleOpacity);
      cancelAnimation(titleY);
      cancelAnimation(healthOpacity);
      cancelAnimation(healthY);
      cancelAnimation(analyticsOpacity);
      cancelAnimation(analyticsY);
      cancelAnimation(ctaOpacity);
    };
  }, [
    reduceMotion,
    titleOpacity,
    titleY,
    healthOpacity,
    healthY,
    analyticsOpacity,
    analyticsY,
    ctaOpacity,
  ]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const healthStyle = useAnimatedStyle(() => ({
    opacity: healthOpacity.value,
    transform: [{ translateY: healthY.value }],
  }));
  const analyticsStyle = useAnimatedStyle(() => ({
    opacity: analyticsOpacity.value,
    transform: [{ translateY: analyticsY.value }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

  // Request HealthKit read access. Best-effort: persists the consent row and
  // syncs any available body stats when the user grants. Returns nothing —
  // the user always proceeds to the paywall regardless of the outcome.
  const requestHealthAccess = useCallback(async () => {
    try {
      const granted = await enable();
      if (!granted) return;

      // Persist the consent row before reading values, so the audit trail
      // pre-dates any data we forward to Convex.
      try {
        await setConsent('health_data_personalization', true);
      } catch (error) {
        console.warn('[onboarding-healthkit] setConsent failed', error);
      }

      capture({
        name: 'healthkit_granted',
        props: { grantedScopes: [...HEALTHKIT_READ_SCOPES] },
      });

      const stats = await getLatestStats();
      const hasAny =
        stats.weightKg != null ||
        stats.heightCm != null ||
        stats.bodyFatPercent != null;

      if (hasAny) {
        try {
          await updateHealthStats({
            weightKg: stats.weightKg ?? undefined,
            heightCm: stats.heightCm ?? undefined,
            bodyFatPercent: stats.bodyFatPercent ?? undefined,
            dataSource: 'mixed',
          });
        } catch (error) {
          // Profile may not exist yet for users who skipped earlier prompts.
          console.warn(
            '[onboarding-healthkit] updateHealthStats failed',
            error,
          );
        }
      }
    } catch (error) {
      console.warn('[onboarding-healthkit] health request failed', error);
    }
  }, [enable, getLatestStats, setConsent, updateHealthStats]);

  const handleAnalyticsToggle = useCallback((next: boolean) => {
    lightHaptic();
    setAnalyticsToggle(next);
    capture({
      name: 'onboarding_setup_analytics_toggled',
      props: { granted: next },
    });
  }, []);

  const showHealthCard = isAvailable || Platform.OS === 'ios';

  const handleContinue = useCallback(async () => {
    if (continuePending) return;
    setContinuePending(true);
    lightHaptic();
    capture({ name: 'onboarding_setup_continue', props: {} });

    // Apple 5.1.1(iv): the explanatory card flows straight into the system
    // HealthKit prompt here — no skip, no priming verb on the button. We show
    // the prompt (iOS) and then always advance, whatever the user decides.
    if (showHealthCard) {
      await requestHealthAccess();
    }

    // Always write the consent row — the user saw the toggle and had a chance
    // to flip it. The default is `true` (see GDPR note at file top).
    try {
      await setConsent('analytics', analyticsToggle);
    } catch (error) {
      console.warn(
        '[onboarding-healthkit] analytics setConsent failed',
        error,
      );
    }

    router.replace('/onboarding/paywall');
  }, [
    analyticsToggle,
    continuePending,
    requestHealthAccess,
    router,
    setConsent,
    showHealthCard,
  ]);

  const isContinueDisabled = continuePending;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 px-6 pt-4 pb-8 justify-between">
        {/* Title + subtitle */}
        <Animated.View style={titleStyle} className="items-center">
          <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Almost there
          </Text>
          <Text className="mt-3 text-center text-[26px] font-semibold leading-tight text-foreground">
            One last thing
          </Text>
          <Text className="mt-2 text-center text-[15px] leading-6 text-muted-foreground">
            Set up Fitbull&apos;s data sources so your coach starts smart on
            day one.
          </Text>
        </Animated.View>

        {/* Sections */}
        <View className="gap-4">
          {/* Apple Health card */}
          {showHealthCard ? (
            <Animated.View
              style={healthStyle}
              className="rounded-2xl border border-border bg-card p-5"
              accessibilityLabel="Apple Health"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <Icon as={Heart} size={22} className="text-primary" />
              </View>

              <Text className="mt-4 text-[18px] font-semibold text-foreground">
                Apple Health
              </Text>
              <Text className="mt-1 text-[14px] leading-6 text-muted-foreground">
                Fitbull reads your weight, height, and body-fat percentage to
                personalize your coach. We never read sleep, heart rate, or
                workout history. Tap Continue to choose what to share — you
                stay in control on the next screen.
              </Text>
            </Animated.View>
          ) : null}

          {/* Analytics toggle row */}
          <Animated.View
            style={analyticsStyle}
            className="flex-row items-start gap-4 rounded-2xl border border-border bg-card p-5"
          >
            <View className="flex-1">
              <Text className="text-[16px] font-semibold text-foreground">
                Help improve Fitbull
              </Text>
              <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                Send anonymous usage analytics. We never share workouts,
                meals, or personal stats.
              </Text>
            </View>
            <View className="pt-1">
              <Switch
                checked={analyticsToggle}
                onCheckedChange={handleAnalyticsToggle}
                accessibilityLabel="Send anonymous usage analytics"
                accessibilityRole="switch"
                accessibilityState={{ checked: analyticsToggle }}
                testID="onboarding-analytics-toggle"
              />
            </View>
          </Animated.View>
        </View>

        {/* Continue CTA */}
        <Animated.View style={ctaStyle}>
          <Pressable
            onPress={handleContinue}
            disabled={isContinueDisabled}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityState={{ disabled: isContinueDisabled }}
            testID="onboarding-healthkit-continue"
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 active:opacity-80 ${
              isContinueDisabled ? 'bg-primary/40' : 'bg-primary'
            }`}
          >
            {continuePending ? (
              <ActivityIndicator size="small" color="white" />
            ) : null}
            <Text className="text-base font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

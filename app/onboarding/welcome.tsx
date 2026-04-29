import React, { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { lightHaptic } from '@/lib/haptics';
import { capture } from '@/lib/analytics';

// Apple-style "easeOutExpo" cubic-bezier — long, gentle settle. Slower than
// any of the other onboarding screens to set a reverent pace.
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// iOS native cursive face. Snell Roundhand is the default choice — refined,
// generous loops, looks like a calligrapher wrote it. Falls back to system
// serif elsewhere.
const CURSIVE_FONT_FAMILY = Platform.select({
  ios: 'Snell Roundhand',
  default: 'serif',
});

/**
 * Onboarding "Hello." — Apple-iPhone-setup style brand moment that runs
 * after sign-up and before the demo carousel. Cursive script, reverent
 * pacing (~2s for the word, ~4s total), no springs — just easeOutExpo
 * timings. The intent is to slow the user down, not energise them.
 */
export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  // Cursive word — fades in slowly, drifts up, letter-spacing closes in
  // to suggest a slow draw without needing an actual stroked SVG.
  const helloOpacity = useSharedValue(0);
  const helloY = useSharedValue(20);
  const helloLetterSpacing = useSharedValue(8);

  // Wordmark + subtitle.
  const wordmarkOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  // CTA.
  const ctaOpacity = useSharedValue(0);
  const ctaY = useSharedValue(8);

  useEffect(() => {
    capture({ name: 'welcome_shown', props: {} });

    if (reduceMotion) {
      helloOpacity.value = 1;
      helloY.value = 0;
      helloLetterSpacing.value = 0;
      wordmarkOpacity.value = 1;
      subtitleOpacity.value = 1;
      ctaOpacity.value = 1;
      ctaY.value = 0;
      return;
    }

    helloOpacity.value = withTiming(1, { duration: 1400, easing: EASE });
    helloY.value = withTiming(0, { duration: 1400, easing: EASE });
    helloLetterSpacing.value = withTiming(0, {
      duration: 1600,
      easing: EASE,
    });

    wordmarkOpacity.value = withDelay(
      900,
      withTiming(1, { duration: 700, easing: EASE })
    );

    subtitleOpacity.value = withDelay(
      1500,
      withTiming(1, { duration: 700, easing: EASE })
    );

    ctaOpacity.value = withDelay(
      2200,
      withTiming(1, { duration: 600, easing: EASE })
    );
    ctaY.value = withDelay(
      2200,
      withTiming(0, { duration: 600, easing: EASE })
    );

    return () => {
      cancelAnimation(helloOpacity);
      cancelAnimation(helloY);
      cancelAnimation(helloLetterSpacing);
      cancelAnimation(wordmarkOpacity);
      cancelAnimation(subtitleOpacity);
      cancelAnimation(ctaOpacity);
      cancelAnimation(ctaY);
    };
  }, [
    reduceMotion,
    helloOpacity,
    helloY,
    helloLetterSpacing,
    wordmarkOpacity,
    subtitleOpacity,
    ctaOpacity,
    ctaY,
  ]);

  const helloStyle = useAnimatedStyle(() => ({
    opacity: helloOpacity.value,
    transform: [{ translateY: helloY.value }],
    letterSpacing: helloLetterSpacing.value,
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
  }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaY.value }],
  }));

  const handleContinue = () => {
    capture({ name: 'welcome_continue', props: {} });
    lightHaptic();
    router.replace('/onboarding/demo-chat');
  };

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={['top', 'bottom']}
    >
      <View className="flex-1 justify-between px-6 pb-8">
        {/* Spacer pushes the hero down a bit so it doesn't feel cramped */}
        <View />

        {/* Hello — cursive script, the focal moment */}
        <View className="items-center">
          <Animated.Text
            allowFontScaling={false}
            // Color comes from the NativeWind className so theme tokens
            // resolve correctly. Reanimated cannot parse `hsl(var(...))`
            // inside its worklet style merger — only resolved colors.
            className="text-center font-normal text-foreground"
            style={[
              helloStyle,
              {
                fontFamily: CURSIVE_FONT_FAMILY,
                fontSize: 96,
                lineHeight: 110,
              },
            ]}
            accessibilityRole="header"
            accessibilityLabel="Hello"
          >
            Hello.
          </Animated.Text>

          <Animated.View style={wordmarkStyle} className="mt-7">
            <Text className="text-center text-[18px] font-semibold tracking-tight text-foreground">
              Welcome to Fitbull
            </Text>
          </Animated.View>

          <Animated.View style={subtitleStyle} className="mt-3 px-6">
            <Text className="text-center text-[14px] leading-6 text-muted-foreground">
              Your AI coach for training, nutrition, and progress.
            </Text>
          </Animated.View>
        </View>

        {/* CTA */}
        <Animated.View style={ctaStyle}>
          <Pressable
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            testID="onboarding-welcome-continue"
            className="items-center rounded-2xl bg-primary py-4 active:opacity-80"
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { lightHaptic } from '@/lib/haptics';
import { capture } from '@/lib/analytics';
import { SEBASTIAN_SIGNATURE_SVG } from '@/assets/signatures/sebastian';

const BODY_PARAGRAPHS = [
  "I'm Sebastian. I built Fitbull because I was tired of fitness apps that hide real coaching behind another paywall on top of the one I'd already paid.",
  'Fitbull is what I wanted: a coach in my pocket that actually listens, plans built around my real schedule, and no dark patterns to subscribe.',
  'If something\u2019s broken or stupid, my email is in Settings. I read every message.',
];

export default function FounderNoteScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(24);
  const cardScale = useSharedValue(0.97);
  const sigOpacity = useSharedValue(0);

  useEffect(() => {
    capture({ name: 'founder_note_shown', props: {} });

    if (reduceMotion) {
      cardOpacity.value = 1;
      cardY.value = 0;
      cardScale.value = 1;
      sigOpacity.value = 1;
      return;
    }

    cardOpacity.value = withTiming(1, {
      duration: 380,
      easing: Easing.out(Easing.cubic),
    });
    cardY.value = withSpring(0, {
      damping: 14,
      stiffness: 160,
      mass: 0.7,
    });
    cardScale.value = withSpring(1, {
      damping: 14,
      stiffness: 160,
      mass: 0.7,
    });

    // Signature draws in slightly later, like ink hitting paper.
    sigOpacity.value = withTiming(1, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });

    return () => {
      cancelAnimation(cardOpacity);
      cancelAnimation(cardY);
      cancelAnimation(cardScale);
      cancelAnimation(sigOpacity);
    };
  }, [reduceMotion, cardOpacity, cardY, cardScale, sigOpacity]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }, { scale: cardScale.value }],
  }));

  const sigStyle = useAnimatedStyle(() => ({
    opacity: sigOpacity.value,
  }));

  const handleContinue = () => {
    capture({ name: 'founder_note_continue', props: {} });
    lightHaptic();
    router.replace('/onboarding/paywall');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 px-6 pt-4 pb-8 justify-between">
        {/* Eyebrow */}
        <View className="items-center">
          <Text className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            A note from the founder
          </Text>
        </View>

        {/* Letter card */}
        <Animated.View
          style={[
            cardStyle,
            {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 28,
            },
          ]}
          className="rounded-3xl border border-border bg-card px-6 py-7"
        >
          <Text className="text-[22px] font-semibold leading-tight text-foreground">
            Hey.
          </Text>

          <View className="mt-4 gap-4">
            {BODY_PARAGRAPHS.map((paragraph) => (
              <Text
                key={paragraph}
                className="text-[15px] leading-7 text-foreground"
              >
                {paragraph}
              </Text>
            ))}
          </View>

          {/* Signature */}
          <View className="mt-6">
            <Animated.View
              style={sigStyle}
              accessibilityLabel="Signature: Sebastian"
              accessibilityRole="image"
            >
              <View
                style={{ height: 56, width: 200 }}
                className="text-foreground"
              >
                <SvgXml
                  xml={SEBASTIAN_SIGNATURE_SVG}
                  width="100%"
                  height="100%"
                  color="currentColor"
                />
              </View>
            </Animated.View>
            <Text className="mt-1 text-[13px] text-muted-foreground">
              Sebastian Sole · Founder
            </Text>
          </View>
        </Animated.View>

        {/* CTA */}
        <View className="gap-3">
          <Pressable
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            testID="founder-note-continue"
            className="items-center rounded-2xl bg-primary py-4 active:opacity-80"
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

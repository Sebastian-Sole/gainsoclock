import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';

/**
 * Completion reward: a green medallion pops in with a check and a brief screen
 * flash. Driven by `trigger` — increment it to replay. Purely decorative
 * (pointer-events none); the haptic is fired by the caller.
 */
export function FocusReward({ trigger }: { trigger: number }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    scale.value = 0;
    scale.value = withSequence(
      withSpring(1, { damping: 9, stiffness: 150 }),
      withTiming(1, { duration: 380 }),
      withTiming(0.6, { duration: 200 })
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 90 }),
      withTiming(1, { duration: 420 }),
      withTiming(0, { duration: 220 })
    );
    flash.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 420 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const medalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.16 }));

  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center" style={{ zIndex: 50 }}>
      <Animated.View style={flashStyle} className="absolute inset-0 bg-green-500" />
      <Animated.View
        style={medalStyle}
        className="h-28 w-28 items-center justify-center rounded-full bg-green-500"
      >
        <Check size={58} color="#ffffff" strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

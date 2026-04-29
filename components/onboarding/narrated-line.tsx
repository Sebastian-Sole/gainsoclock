import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/components/ui/text";
import { useReduceMotion } from "@/hooks/use-reduce-motion";

const AnimatedText = Animated.createAnimatedComponent(Text);

type Props = {
  text: string;
  visible: boolean;
  immediate?: boolean;
};

// Reanimated fade-in text used by the S7 narrated-analysis screen. When
// `immediate` is true (VoiceOver active) or Reduce Motion is on, we skip the
// animation entirely and render at full opacity so the screen reader does
// not wait for tweens.
export function NarratedLine({ text, visible, immediate }: Props) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(immediate || reduceMotion ? 1 : 0);

  useEffect(() => {
    if (immediate || reduceMotion) {
      opacity.value = visible ? 1 : 0;
      return;
    }
    opacity.value = withTiming(visible ? 1 : 0, { duration: 500 });
  }, [visible, immediate, reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <AnimatedText
      style={animatedStyle}
      className="text-lg text-foreground"
      accessibilityRole="text"
    >
      {text}
    </AnimatedText>
  );
}

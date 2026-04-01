import React from 'react';
import { View } from 'react-native';
import { ShoppingCart } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useGroceryStore } from '@/stores/grocery-store';
import { lightHaptic } from '@/lib/haptics';
import type { Recipe } from '@/lib/types';

const THRESHOLD = 80;

interface SwipeableRecipeCardProps {
  recipe: Recipe;
  children: React.ReactNode;
}

export function SwipeableRecipeCard({ recipe, children }: SwipeableRecipeCardProps) {
  const translateX = useSharedValue(0);
  const addFromRecipe = useGroceryStore((s) => s.addFromRecipe);

  const onSwipeComplete = () => {
    addFromRecipe(recipe);
    lightHaptic();
  };

  const pan = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // Only allow right swipe, clamp left
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd(() => {
      if (translateX.value > THRESHOLD) {
        runOnJS(onSwipeComplete)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / THRESHOLD, 1),
  }));

  return (
    <View className="overflow-hidden rounded-xl">
      {/* Green background revealed on swipe */}
      <Animated.View
        style={[bgStyle]}
        className="absolute inset-0 flex-row items-center pl-5 rounded-xl bg-green-600"
      >
        <Icon as={ShoppingCart} size={22} className="text-primary-foreground" />
      </Animated.View>
      {/* Card content */}
      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

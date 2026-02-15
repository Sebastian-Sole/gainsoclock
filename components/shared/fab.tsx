import React from 'react';
import { Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { lightHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface FabProps {
  onPress: () => void;
  className?: string;
}

export function Fab({ onPress, className }: FabProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.9);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      onPress={() => {
        lightHaptic();
        onPress();
      }}
      style={animatedStyle}
      className={cn(
        'absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg',
        className
      )}
    >
      <Plus size={24} color="white" />
    </AnimatedPressable>
  );
}

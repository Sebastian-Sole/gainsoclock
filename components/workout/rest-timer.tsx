import React, { useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import Svg, { Circle } from 'react-native-svg';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { formatTime } from '@/lib/format';

const SIZE = 200;
const STROKE_WIDTH = 12;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RestTimerProps {
  remaining: number;
  total: number;
  onSkip: () => void;
}

export function RestTimer({ remaining, total, onSkip }: RestTimerProps) {
  const progress = total > 0 ? remaining / total : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <Animated.View
      entering={SlideInDown.springify()}
      exiting={SlideOutDown}
      className="absolute inset-x-0 bottom-0 items-center rounded-t-3xl bg-card px-6 pb-12 pt-8 shadow-2xl"
    >
      <Text className="mb-6 text-lg font-semibold">Rest Timer</Text>

      <View className="mb-6 items-center justify-center">
        <Svg width={SIZE} height={SIZE}>
          {/* Background circle */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="hsl(20, 5.9%, 90%)"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {/* Progress circle */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke="hsl(24, 95%, 53%)"
            strokeWidth={STROKE_WIDTH}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90, ${SIZE / 2}, ${SIZE / 2})`}
          />
        </Svg>
        <View className="absolute items-center">
          <Text className="text-5xl font-bold">{formatTime(remaining)}</Text>
          <Text className="text-sm text-muted-foreground">remaining</Text>
        </View>
      </View>

      <Pressable
        onPress={onSkip}
        className="items-center rounded-xl bg-secondary px-8 py-3"
      >
        <Text className="font-semibold text-secondary-foreground">Skip</Text>
      </Pressable>
    </Animated.View>
  );
}

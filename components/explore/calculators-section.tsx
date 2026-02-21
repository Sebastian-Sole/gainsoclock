import React from 'react';
import { View } from 'react-native';
import { Target, Flame, CircleDot, ArrowLeftRight, Timer, Gauge } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { Colors } from '@/constants/theme';
import { CalculatorCard } from './calculator-card';

export function CalculatorsSection() {
  const { colorScheme } = useColorScheme();
  const iconColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const iconSize = 20;

  return (
    <View className="gap-3 px-4 pb-8">
      <CalculatorCard
        icon={<Target size={iconSize} color={iconColor} />}
        title="1RM Calculator"
        description="Estimate your one-rep max"
        href="/calculator/one-rm"
      />
      <CalculatorCard
        icon={<Flame size={iconSize} color={iconColor} />}
        title="Calorie Calculator"
        description="TDEE & calorie targets"
        href="/calculator/calorie"
      />
      <CalculatorCard
        icon={<CircleDot size={iconSize} color={iconColor} />}
        title="Plate Calculator"
        description="Plate breakdown per side"
        href="/calculator/plate"
      />
      <CalculatorCard
        icon={<ArrowLeftRight size={iconSize} color={iconColor} />}
        title="Unit Converter"
        description="Convert lbs ↔ kg"
        href="/calculator/converter"
      />
      <CalculatorCard
        icon={<Timer size={iconSize} color={iconColor} />}
        title="Pace Calculator"
        description="Running pace & speed"
        href="/calculator/pace"
      />
      <CalculatorCard
        icon={<Gauge size={iconSize} color={iconColor} />}
        title="Speed Calculator"
        description="Pace to speed conversion"
        href="/calculator/speed"
      />
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';
import { Target, Flame, CircleDot, ArrowLeftRight, Timer, Gauge } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

import { CalculatorCard } from './calculator-card';

export function CalculatorsSection() {
  const iconSize = 20;

  return (
    <View className="gap-3 px-4 pb-8">
      <CalculatorCard
        icon={<Icon as={Target} size={iconSize} className="text-primary" />}
        title="1RM Calculator"
        description="Estimate your one-rep max"
        href="/calculator/one-rm"
      />
      <CalculatorCard
        icon={<Icon as={Flame} size={iconSize} className="text-primary" />}
        title="Calorie Calculator"
        description="TDEE & calorie targets"
        href="/calculator/calorie"
      />
      <CalculatorCard
        icon={<Icon as={CircleDot} size={iconSize} className="text-primary" />}
        title="Plate Calculator"
        description="Plate breakdown per side"
        href="/calculator/plate"
      />
      <CalculatorCard
        icon={<Icon as={ArrowLeftRight} size={iconSize} className="text-primary" />}
        title="Unit Converter"
        description="Convert lbs ↔ kg"
        href="/calculator/converter"
      />
      <CalculatorCard
        icon={<Icon as={Timer} size={iconSize} className="text-primary" />}
        title="Pace Calculator"
        description="Running pace & speed"
        href="/calculator/pace"
      />
      <CalculatorCard
        icon={<Icon as={Gauge} size={iconSize} className="text-primary" />}
        title="Speed Calculator"
        description="Pace to speed conversion"
        href="/calculator/speed"
      />
    </View>
  );
}

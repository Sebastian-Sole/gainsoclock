import React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number;
}

export function StepIndicator({ totalSteps, currentStep }: StepIndicatorProps) {
  return (
    <View className="flex-row items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          className={cn(
            'h-2 rounded-full',
            i === currentStep ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
          )}
        />
      ))}
    </View>
  );
}

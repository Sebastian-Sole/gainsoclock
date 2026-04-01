import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { Dumbbell, PartyPopper } from 'lucide-react-native';
import type { OnboardingStep } from '@/lib/onboarding-steps';
import { TOTAL_STEPS } from '@/lib/onboarding-steps';

const ICONS = {
  Dumbbell,
  PartyPopper,
} as const;

interface OnboardingCardProps {
  step: OnboardingStep;
  stepIndex: number;
  onNext: () => void;
  onSkip: () => void;
}

export function OnboardingCard({ step, stepIndex, onNext, onSkip }: OnboardingCardProps) {
  const IconComponent = step.icon ? ICONS[step.icon] : null;
  const isLastStep = stepIndex === TOTAL_STEPS - 1;

  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-full rounded-2xl bg-card border border-border p-8 items-center">
        {IconComponent && (
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Icon as={IconComponent} size={36} className="text-primary" />
          </View>
        )}

        {step.title && (
          <Text className="text-2xl font-bold text-foreground text-center mb-3">
            {step.title}
          </Text>
        )}

        {step.description && (
          <Text className="text-sm text-muted-foreground text-center leading-5 mb-6">
            {step.description}
          </Text>
        )}

        <Pressable
          onPress={onNext}
          className="w-full items-center rounded-xl bg-primary py-3.5 px-8"
        >
          <Text className="font-semibold text-primary-foreground">
            {step.buttonText ?? 'Next'}
          </Text>
        </Pressable>

        {!isLastStep && (
          <Pressable onPress={onSkip} className="mt-4 py-1">
            <Text className="text-sm text-muted-foreground">Skip Tour</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

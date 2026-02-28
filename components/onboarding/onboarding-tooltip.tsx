import React from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TargetMeasurement } from '@/hooks/use-onboarding-target';
import type { TooltipPosition } from '@/lib/onboarding-steps';
import { TOTAL_STEPS } from '@/lib/onboarding-steps';

const TOOLTIP_MARGIN = 12;
const SCREEN_PADDING = 16;
const ARROW_SIZE = 8;

interface OnboardingTooltipProps {
  title: string;
  description: string;
  preferredPosition: TooltipPosition;
  targetRect: TargetMeasurement;
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function OnboardingTooltip({
  title,
  description,
  preferredPosition,
  targetRect,
  stepIndex,
  onNext,
  onPrev,
  onSkip,
}: OnboardingTooltipProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#fff' : '#000';

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === TOTAL_STEPS - 1;

  // Calculate position
  const spaceAbove = targetRect.y - insets.top;
  const spaceBelow = screenH - (targetRect.y + targetRect.height) - insets.bottom;

  const showAbove =
    preferredPosition === 'top' ? spaceAbove > 160 : spaceBelow < 160;

  // Horizontal: center tooltip on target, clamp to screen
  const tooltipWidth = Math.min(screenW - SCREEN_PADDING * 2, 320);
  const targetCenterX = targetRect.x + targetRect.width / 2;
  let tooltipLeft = targetCenterX - tooltipWidth / 2;
  tooltipLeft = Math.max(SCREEN_PADDING, Math.min(tooltipLeft, screenW - tooltipWidth - SCREEN_PADDING));

  // Vertical
  const tooltipTop = showAbove
    ? targetRect.y - TOOLTIP_MARGIN - ARROW_SIZE
    : targetRect.y + targetRect.height + TOOLTIP_MARGIN + ARROW_SIZE;

  // Arrow horizontal position relative to tooltip
  const arrowLeft = Math.max(
    16,
    Math.min(targetCenterX - tooltipLeft - ARROW_SIZE, tooltipWidth - 32)
  );

  return (
    <View
      style={{
        position: 'absolute',
        left: tooltipLeft,
        top: showAbove ? undefined : tooltipTop,
        bottom: showAbove ? screenH - tooltipTop : undefined,
        width: tooltipWidth,
      }}
    >
      {/* Arrow pointing toward target */}
      {!showAbove && (
        <View
          style={{
            position: 'absolute',
            top: -ARROW_SIZE,
            left: arrowLeft,
            width: 0,
            height: 0,
            borderLeftWidth: ARROW_SIZE,
            borderRightWidth: ARROW_SIZE,
            borderBottomWidth: ARROW_SIZE,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: colorScheme === 'dark' ? '#1c1917' : '#fff',
          }}
        />
      )}

      <View className="rounded-xl bg-card border border-border p-4 shadow-lg shadow-black/10">
        <Text className="text-base font-semibold text-foreground mb-1">
          {title}
        </Text>
        <Text className="text-sm text-muted-foreground leading-5 mb-4">
          {description}
        </Text>

        {/* Navigation row */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {!isFirstStep && (
              <Pressable
                onPress={onPrev}
                className="flex-row items-center rounded-lg border border-border px-3 py-2"
              >
                <ChevronLeft size={16} color={iconColor} />
                <Text className="text-sm font-medium ml-0.5">Back</Text>
              </Pressable>
            )}
          </View>

          <Text className="text-xs text-muted-foreground">
            {stepIndex + 1} of {TOTAL_STEPS}
          </Text>

          <Pressable
            onPress={onNext}
            className="flex-row items-center rounded-lg bg-primary px-3 py-2"
          >
            <Text className="text-sm font-medium text-primary-foreground mr-0.5">
              {isLastStep ? 'Done' : 'Next'}
            </Text>
            <ChevronRight size={16} color="white" />
          </Pressable>
        </View>

        {/* Skip */}
        <Pressable onPress={onSkip} className="mt-3 items-center py-1">
          <Text className="text-xs text-muted-foreground">Skip Tour</Text>
        </Pressable>
      </View>

      {/* Arrow below tooltip */}
      {showAbove && (
        <View
          style={{
            position: 'absolute',
            bottom: -ARROW_SIZE,
            left: arrowLeft,
            width: 0,
            height: 0,
            borderLeftWidth: ARROW_SIZE,
            borderRightWidth: ARROW_SIZE,
            borderTopWidth: ARROW_SIZE,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: colorScheme === 'dark' ? '#1c1917' : '#fff',
          }}
        />
      )}
    </View>
  );
}

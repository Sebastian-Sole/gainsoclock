import React, { useEffect, useState, useCallback } from 'react';
import { View, Text as RNText, useWindowDimensions, Platform, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';
import { router } from 'expo-router';

import { useOnboardingStore } from '@/stores/onboarding-store';
import { ONBOARDING_STEPS, TOTAL_STEPS } from '@/lib/onboarding-steps';
import { OnboardingCard } from './onboarding-card';
import { OnboardingTooltip } from './onboarding-tooltip';
import { Progress } from '@/components/ui/progress';
import type { TargetEntry, TargetMeasurement } from '@/hooks/use-onboarding-target';

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 12;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

interface OnboardingOverlayProps {
  getTarget: (id: string) => TargetEntry | undefined;
}

export function OnboardingOverlay({ getTarget }: OnboardingOverlayProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const currentStep = useOnboardingStore((s) => s.currentStep);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const skipOnboarding = useOnboardingStore((s) => s.skipOnboarding);

  const step = ONBOARDING_STEPS[currentStep];
  const [targetRect, setTargetRect] = useState<TargetMeasurement | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const measureTarget = useCallback(
    async (targetId: string, retries = 3): Promise<TargetMeasurement | null> => {
      for (let i = 0; i < retries; i++) {
        const entry = getTarget(targetId);
        if (entry) {
          try {
            return await entry.measure();
          } catch {
            // Retry after a short delay
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    },
    [getTarget]
  );

  // Handle step changes: navigate if needed, then measure target
  useEffect(() => {
    let cancelled = false;

    async function handleStepChange() {
      setTargetRect(null);

      if (step.type === 'fullscreen') {
        // Navigate back to home for fullscreen steps
        if (step.id === 'completion') {
          router.navigate('/(tabs)' as any);
        }
        return;
      }

      // Navigate to the correct tab if needed
      if (step.navigateTo) {
        setIsNavigating(true);
        router.navigate(step.navigateTo as any);
        await new Promise((r) => setTimeout(r, step.navigateDelay ?? 300));
        if (cancelled) return;
        setIsNavigating(false);
      }

      // Measure the target element
      if (step.targetId) {
        const rect = await measureTarget(step.targetId);
        if (cancelled) return;
        if (rect) {
          setTargetRect(rect);
        } else {
          // Target not found — skip to next step
          nextStep();
        }
      }
    }

    handleStepChange();
    return () => {
      cancelled = true;
    };
  }, [currentStep, step, measureTarget, nextStep]);

  const progressValue = ((currentStep + 1) / TOTAL_STEPS) * 100;

  // Build the SVG spotlight path
  const spotlightPath = targetRect
    ? buildSpotlightPath(screenW, screenH, targetRect)
    : null;

  return (
    <FullWindowOverlay>
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}
        pointerEvents="box-none"
      >
        {step.type === 'fullscreen' ? (
          // Fullscreen card with semi-transparent backdrop
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]}
            onPress={() => {}}
          >
            {/* Progress bar */}
            <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 24 }}>
              <Progress value={progressValue} className="h-1.5" indicatorClassName="bg-primary" />
              <View className="mt-1.5 items-center">
                <View className="rounded-full bg-black/40 px-2.5 py-0.5">
                  <OverlayText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                    {currentStep + 1} of {TOTAL_STEPS}
                  </OverlayText>
                </View>
              </View>
            </View>

            <OnboardingCard
              step={step}
              stepIndex={currentStep}
              onNext={nextStep}
              onSkip={skipOnboarding}
            />
          </Pressable>
        ) : (
          // Spotlight step
          <>
            {/* SVG spotlight mask */}
            {spotlightPath && !isNavigating && (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={nextStep}
              >
                <Svg width={screenW} height={screenH}>
                  <Path
                    d={spotlightPath}
                    fill="rgba(0,0,0,0.75)"
                    fillRule="evenodd"
                  />
                </Svg>
              </Pressable>
            )}

            {/* Loading state while navigating */}
            {(isNavigating || !targetRect) && (
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]}
              />
            )}

            {/* Progress bar */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                paddingTop: insets.top + 8,
                paddingHorizontal: 24,
              }}
              pointerEvents="none"
            >
              <Progress value={progressValue} className="h-1.5" indicatorClassName="bg-primary" />
              <View className="mt-1.5 items-center">
                <View className="rounded-full bg-black/40 px-2.5 py-0.5">
                  <OverlayText style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                    {currentStep + 1} of {TOTAL_STEPS}
                  </OverlayText>
                </View>
              </View>
            </View>

            {/* Tooltip */}
            {targetRect && !isNavigating && step.tooltipTitle && (
              <OnboardingTooltip
                title={step.tooltipTitle}
                description={step.tooltipDescription ?? ''}
                preferredPosition={step.tooltipPosition ?? 'bottom'}
                targetRect={targetRect}
                stepIndex={currentStep}
                onNext={nextStep}
                onPrev={prevStep}
                onSkip={skipOnboarding}
              />
            )}
          </>
        )}
      </Animated.View>
    </FullWindowOverlay>
  );
}

function buildSpotlightPath(
  screenW: number,
  screenH: number,
  target: TargetMeasurement
): string {
  const x = target.x - SPOTLIGHT_PADDING;
  const y = target.y - SPOTLIGHT_PADDING;
  const w = target.width + SPOTLIGHT_PADDING * 2;
  const h = target.height + SPOTLIGHT_PADDING * 2;
  const r = SPOTLIGHT_RADIUS;

  // Outer rect (clockwise) + inner rounded rect (counter-clockwise) = hole
  return [
    // Outer rectangle (full screen)
    `M 0 0 H ${screenW} V ${screenH} H 0 Z`,
    // Inner rounded rectangle (spotlight cutout)
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `Z`,
  ].join(' ');
}

function OverlayText({ style, children }: { style?: any; children: React.ReactNode }) {
  return <RNText style={style}>{children}</RNText>;
}

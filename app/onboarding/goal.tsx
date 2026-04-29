import { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { GoalCard } from '@/components/onboarding/goal-card';
import { capture } from '@/lib/analytics';
import { useIntakeDraftStore, type Goal } from '@/stores/intake-draft-store';

type GoalCardConfig = {
  id: Goal;
  title: string;
  srDescription: string;
  imageSource: number;
  blurhash: string;
};

const BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

const GOAL_CARDS: readonly GoalCardConfig[] = [
  {
    id: 'stronger',
    title: 'Stronger',
    srDescription: 'Stronger — build strength and muscle',
    imageSource: require('@/assets/onboarding/goal-stronger.webp'),
    blurhash: BLURHASH,
  },
  {
    id: 'leaner',
    title: 'Leaner',
    srDescription: 'Leaner — reduce body fat while keeping strength',
    imageSource: require('@/assets/onboarding/goal-leaner.webp'),
    blurhash: BLURHASH,
  },
  {
    id: 'healthier',
    title: 'Healthier',
    srDescription: 'Healthier — general fitness and conditioning',
    imageSource: require('@/assets/onboarding/goal-healthier.webp'),
    blurhash: BLURHASH,
  },
  {
    id: 'routine',
    title: 'Routine',
    srDescription: 'Routine — build a consistent training habit',
    imageSource: require('@/assets/onboarding/goal-routine.webp'),
    blurhash: BLURHASH,
  },
];

export default function OnboardingGoalScreen() {
  const router = useRouter();
  const goals = useIntakeDraftStore((s) => s.goals);
  const primaryGoal = useIntakeDraftStore((s) => s.primaryGoal);
  const setDraftField = useIntakeDraftStore((s) => s.setDraftField);

  useEffect(() => {
    capture({ name: 'intake_started', props: {} });
  }, []);

  const selected = useMemo(() => new Set<Goal>(goals ?? []), [goals]);
  const canContinue = selected.size > 0;

  const toggleGoal = useCallback(
    (id: Goal) => {
      const next = new Set(selected);
      const wasSelected = next.has(id);
      if (wasSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
      const nextArr = Array.from(next);
      setDraftField('goals', nextArr);

      if (wasSelected && primaryGoal === id) {
        setDraftField('primaryGoal', nextArr[0]);
      } else if (!wasSelected && !primaryGoal) {
        setDraftField('primaryGoal', id);
      } else if (nextArr.length === 0) {
        setDraftField('primaryGoal', undefined);
      }
    },
    [selected, primaryGoal, setDraftField],
  );

  const pinPrimary = useCallback(
    (id: Goal) => {
      setDraftField('primaryGoal', id);
    },
    [setDraftField],
  );

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    const selectedArr = Array.from(selected);
    const primary = primaryGoal ?? selectedArr[0];
    if (!primary) return;
    setDraftField('primaryGoal', primary);
    capture({
      name: 'goal_set',
      props: { goals: selectedArr, primaryGoal: primary },
    });
    router.push('/onboarding/experience' as never);
  }, [canContinue, selected, primaryGoal, router, setDraftField]);

  return (
    <View className="flex-1 px-6 pb-8">
      <View className="pt-4">
        <Text variant="h2" className="border-b-0 pb-0">
          Goal.
        </Text>
        <Text className="mt-1 text-muted-foreground">
          Pick one or more.
        </Text>
      </View>

      <View className="mt-6 flex-1 gap-3">
        <View className="flex-row gap-3">
          {GOAL_CARDS.slice(0, 2).map((card) => (
            <GoalCard
              key={card.id}
              id={card.id}
              title={card.title}
              srDescription={card.srDescription}
              selected={selected.has(card.id)}
              isPrimary={primaryGoal === card.id}
              onSelect={() => toggleGoal(card.id)}
              onPinPrimary={() => pinPrimary(card.id)}
              imageSource={card.imageSource}
              blurhash={card.blurhash}
            />
          ))}
        </View>
        <View className="flex-row gap-3">
          {GOAL_CARDS.slice(2, 4).map((card) => (
            <GoalCard
              key={card.id}
              id={card.id}
              title={card.title}
              srDescription={card.srDescription}
              selected={selected.has(card.id)}
              isPrimary={primaryGoal === card.id}
              onSelect={() => toggleGoal(card.id)}
              onPinPrimary={() => pinPrimary(card.id)}
              imageSource={card.imageSource}
              blurhash={card.blurhash}
            />
          ))}
        </View>
      </View>

      <View className="mt-4 gap-2">
        {!canContinue ? (
          <Text className="text-center text-sm text-muted-foreground">
            Pick at least one to continue.
          </Text>
        ) : null}
        <Button
          size="onboarding"
          onPress={handleContinue}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue to experience step"
          accessibilityState={{ disabled: !canContinue }}
          testID="onboarding-goal-continue"
        >
          <Text>Continue</Text>
        </Button>
      </View>
    </View>
  );
}

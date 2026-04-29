import { useCallback, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { DayChip } from '@/components/onboarding/day-chip';
import { capture } from '@/lib/analytics';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

type DayConfig = { weekday: number; short: string; full: string };

const DAYS: readonly DayConfig[] = [
  { weekday: 0, short: 'Sun', full: 'Sunday' },
  { weekday: 1, short: 'Mon', full: 'Monday' },
  { weekday: 2, short: 'Tue', full: 'Tuesday' },
  { weekday: 3, short: 'Wed', full: 'Wednesday' },
  { weekday: 4, short: 'Thu', full: 'Thursday' },
  { weekday: 5, short: 'Fri', full: 'Friday' },
  { weekday: 6, short: 'Sat', full: 'Saturday' },
];

const NARROW_BREAKPOINT = 375;

export default function OnboardingDaysScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const trainingDays = useIntakeDraftStore((s) => s.trainingDaysOfWeek);
  const setDraftField = useIntakeDraftStore((s) => s.setDraftField);

  const selected = useMemo(
    () => new Set<number>(trainingDays ?? []),
    [trainingDays],
  );
  const canContinue = selected.size > 0;

  const toggleDay = useCallback(
    (weekday: number) => {
      const next = new Set(selected);
      if (next.has(weekday)) {
        next.delete(weekday);
      } else {
        next.add(weekday);
      }
      const nextArr = Array.from(next).sort((a, b) => a - b);
      setDraftField('trainingDaysOfWeek', nextArr);
    },
    [selected, setDraftField],
  );

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    const weekdays = Array.from(selected).sort((a, b) => a - b);
    capture({
      name: 'days_set',
      props: { count: weekdays.length, weekdays },
    });
    router.push('/onboarding/healthkit' as never);
  }, [canContinue, selected, router]);

  const narrow = width <= NARROW_BREAKPOINT;
  const firstRow = narrow ? DAYS.slice(0, 4) : DAYS;
  const secondRow = narrow ? DAYS.slice(4) : null;

  return (
    <View className="flex-1 px-6 pb-8">
      <View className="pt-4">
        <Text variant="h2" className="border-b-0 pb-0">
          Which days can you train this week?
        </Text>
        <Text className="mt-2 text-muted-foreground">
          You can change these anytime.
        </Text>
      </View>

      <View className="mt-6 gap-3">
        <View className="flex-row gap-2">
          {firstRow.map((day) => (
            <DayChip
              key={day.weekday}
              weekday={day.weekday}
              short={day.short}
              full={day.full}
              selected={selected.has(day.weekday)}
              onToggle={() => toggleDay(day.weekday)}
            />
          ))}
        </View>
        {secondRow ? (
          <View className="flex-row gap-2">
            {secondRow.map((day) => (
              <DayChip
                key={day.weekday}
                weekday={day.weekday}
                short={day.short}
                full={day.full}
                selected={selected.has(day.weekday)}
                onToggle={() => toggleDay(day.weekday)}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View className="mt-auto gap-2">
        {!canContinue ? (
          <Text className="text-center text-sm text-muted-foreground">
            Pick at least one day to continue.
          </Text>
        ) : null}
        <Button
          size="onboarding"
          onPress={handleContinue}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue to health data step"
          accessibilityState={{ disabled: !canContinue }}
          testID="onboarding-days-continue"
        >
          <Text>Continue</Text>
        </Button>
      </View>
    </View>
  );
}

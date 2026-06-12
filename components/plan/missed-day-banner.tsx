import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import { isYesterday } from 'date-fns';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { mediumHaptic } from '@/lib/haptics';
import { getPlanDayDate } from '@/lib/plan-dates';
import { useHistoryStore } from '@/stores/history-store';
import { usePlanStore } from '@/stores/plan-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTemplateStore } from '@/stores/template-store';
import { useWorkoutStore } from '@/stores/workout-store';

/**
 * Holds the planDay id (`planId:week:dayOfWeek`) of the most recently
 * dismissed missed-day banner. A single key is enough — only one "yesterday"
 * exists at a time, and the id is unique per scheduled day.
 */
const DISMISSED_KEY = 'fitbull:missed-day-banner-dismissed';

/**
 * Dismissible nudge shown on the Plans surface when the active plan had a
 * non-rest workout scheduled YESTERDAY that is still `pending`.
 */
export function MissedDayBanner() {
  const router = useRouter();
  const activePlan = usePlanStore((s) => s.activePlanWithDays);
  const weekStartDay = useSettingsStore((s) => s.weekStartDay);
  const prefillFromLastWorkout = useSettingsStore((s) => s.prefillFromLastWorkout);
  const getTemplate = useTemplateStore((s) => s.getTemplate);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const getLastLogForTemplate = useHistoryStore((s) => s.getLastLogForTemplate);
  const updatePlanDayStatus = useMutation(api.plans.updatePlanDayStatus);

  // undefined = still reading AsyncStorage; null = nothing dismissed yet.
  const [dismissedId, setDismissedId] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => {
        if (!cancelled) setDismissedId(value);
      })
      .catch(() => {
        if (!cancelled) setDismissedId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const missedDay = useMemo(() => {
    if (!activePlan?.days || !activePlan.startDate) return null;
    if (activePlan.status !== 'active') return null;
    for (const day of activePlan.days) {
      if (day.status !== 'pending') continue;
      const date = getPlanDayDate(
        activePlan.startDate,
        day.week,
        day.dayOfWeek,
        weekStartDay
      );
      if (isYesterday(date)) return day;
    }
    return null;
  }, [activePlan, weekStartDay]);

  const dismiss = useCallback((id: string) => {
    setDismissedId(id);
    AsyncStorage.setItem(DISMISSED_KEY, id).catch(() => {
      // Non-fatal: banner stays hidden for this session via state.
    });
  }, []);

  if (dismissedId === undefined) return null;
  if (!activePlan || !missedDay) return null;

  const missedId = `${activePlan.id}:${missedDay.week}:${missedDay.dayOfWeek}`;
  if (dismissedId === missedId) return null;

  const template = missedDay.templateClientId
    ? getTemplate(missedDay.templateClientId)
    : undefined;
  const workoutName = template?.name ?? missedDay.label ?? null;

  const doStart = () => {
    if (!template) return;
    const previousLog = prefillFromLastWorkout
      ? getLastLogForTemplate(template.id)
      : undefined;
    startWorkout(
      template.name,
      template.exercises,
      template.id,
      missedId,
      previousLog
    );
    mediumHaptic();
    dismiss(missedId);
    router.push('/workout/active');
  };

  const handleDoItToday = () => {
    if (!template) return;
    if (activeWorkout) {
      Alert.alert(
        'Workout in Progress',
        'You already have an active workout. Would you like to discard it?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard & Start New', style: 'destructive', onPress: doStart },
        ]
      );
      return;
    }
    doStart();
  };

  const handleSkip = () => {
    dismiss(missedId);
    // `skipped` is a first-class planDay status (convex/validators.ts), so we
    // persist the skip server-side too. Dismissal above keeps the banner
    // hidden immediately and when offline.
    updatePlanDayStatus({
      planClientId: activePlan.id,
      week: missedDay.week,
      dayOfWeek: missedDay.dayOfWeek,
      status: 'skipped',
    }).catch((error) => {
      if (__DEV__) {
        console.warn('[missed-day-banner] skip failed', error);
      }
    });
  };

  return (
    <View
      testID="plan-missed-day-banner"
      className="mx-4 mb-3 gap-3 rounded-xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm leading-5">
          You missed{' '}
          <Text className="text-sm font-semibold">
            {workoutName ?? 'a workout'}
          </Text>{' '}
          yesterday — life happens.
        </Text>
        <Pressable
          onPress={() => dismiss(missedId)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss missed workout banner"
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full"
          testID="plan-missed-day-dismiss"
        >
          <Icon as={X} size={18} className="text-muted-foreground" />
        </Pressable>
      </View>
      <View className="flex-row gap-2">
        {template && (
          <Button
            size="sm"
            onPress={handleDoItToday}
            accessibilityRole="button"
            accessibilityLabel={`Do ${workoutName ?? 'the missed workout'} today`}
            testID="plan-missed-day-do-today"
          >
            <Text>Do it today</Text>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip the missed workout"
          testID="plan-missed-day-skip"
        >
          <Text>Skip it</Text>
        </Button>
      </View>
    </View>
  );
}

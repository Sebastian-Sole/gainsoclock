import React from 'react';
import { View, Pressable, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Check, Plus, Dumbbell } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

import { useWorkoutStore } from '@/stores/workout-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFinishWorkout } from '@/hooks/use-finish-workout';
import { formatDuration } from '@/lib/format';
import { sessionTotals } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { FocusGradient } from '@/components/workout/focus/focus-gradient';

export default function WorkoutSummaryScreen() {
  const router = useRouter();
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const { finishWorkout, discardWorkout } = useFinishWorkout();

  if (!activeWorkout) return null;

  const exercises = activeWorkout.exercises;
  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0);
  const remaining = totalSets - doneSets;
  const allDone = totalSets > 0 && remaining === 0;
  // Third tile: volume for strength sessions (labeled with the user's unit —
  // weights are stored in the display unit), otherwise the most meaningful
  // total the session actually tracked.
  const totals = sessionTotals(exercises);
  const highlight =
    totals.volume > 0
      ? { value: Math.round(totals.volume).toLocaleString(), label: `${weightUnit} volume` }
      : totals.distance > 0
        ? { value: totals.distance.toLocaleString(), label: `${distanceUnit} distance` }
        : totals.reps > 0
          ? { value: totals.reps.toLocaleString(), label: 'reps' }
          : totals.time > 0
            ? { value: formatDuration(totals.time), label: 'exercise time' }
            : { value: '0', label: `${weightUnit} volume` };
  const elapsed = activeWorkout.startedAt
    ? Math.floor((Date.now() - new Date(activeWorkout.startedAt).getTime()) / 1000)
    : 0;

  const confirmDiscard = () => {
    Alert.alert('Discard workout?', 'This workout won’t be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discardWorkout },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <FocusGradient />
      <View className="flex-row items-center gap-2 px-4 py-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to logging"
          className="h-9 w-9 items-center justify-center rounded-xl border border-border"
        >
          <Icon as={ChevronLeft} size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-base font-semibold">Workout summary</Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerClassName="pb-6" showsVerticalScrollIndicator={false}>
        <Text className="mb-1 mt-2 text-2xl font-extrabold text-foreground">
          {allDone ? 'Every set logged' : 'Ready to finish?'}
        </Text>
        <Text className="mb-5 text-sm text-muted-foreground">
          {allDone
            ? 'Nice work. Add another exercise or wrap it up.'
            : `${remaining} set${remaining === 1 ? '' : 's'} still to log — you can finish anyway.`}
        </Text>

        {/* Stat tiles */}
        <View className="mb-5 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-2xl font-extrabold text-foreground">{formatDuration(elapsed)}</Text>
            <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">duration</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-2xl font-extrabold text-foreground">
              {doneSets}
              <Text className="text-base text-muted-foreground"> / {totalSets}</Text>
            </Text>
            <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">sets</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-border bg-card p-4">
            <Text className="text-2xl font-extrabold text-foreground">{highlight.value}</Text>
            <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {highlight.label}
            </Text>
          </View>
        </View>

        {/* Per-exercise */}
        <View className="gap-2">
          {exercises.map((e) => {
            const done = e.sets.filter((s) => s.completed).length;
            const full = e.sets.length > 0 && done === e.sets.length;
            return (
              <View key={e.id} className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <View
                  className={cn(
                    'h-7 w-7 items-center justify-center rounded-full',
                    full ? 'bg-green-500' : 'bg-secondary'
                  )}
                >
                  {full ? <Check size={15} color="#fff" strokeWidth={3} /> : <Icon as={Dumbbell} size={14} className="text-muted-foreground" />}
                </View>
                <Text className="flex-1 font-medium text-foreground">{e.name}</Text>
                <Text className="font-mono text-xs text-muted-foreground">
                  {done}/{e.sets.length} sets
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* CTAs */}
      <View className="gap-3 px-5 pb-2 pt-2">
        <Pressable
          onPress={() => router.push('/exercise/create?source=active&origin=summary')}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-primary bg-accent py-4"
        >
          <Icon as={Plus} size={18} className="text-primary" />
          <Text className="text-base font-semibold text-primary">Add exercise</Text>
        </Pressable>
        <Pressable
          onPress={finishWorkout}
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
          testID="summary-finish"
          className="h-14 items-center justify-center rounded-2xl bg-primary"
        >
          <Text className="text-base font-bold text-primary-foreground">Finish workout</Text>
        </Pressable>
        <Pressable onPress={confirmDiscard} accessibilityRole="button" accessibilityLabel="Discard workout" className="items-center py-1">
          <Text className="text-sm font-medium text-destructive">Discard workout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

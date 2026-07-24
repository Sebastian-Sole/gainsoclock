import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pause, Play, X } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ProgressRing, useRingColors } from '@/components/shared/progress-ring';
import { useStopwatch } from '@/hooks/use-stopwatch';
import { formatTime } from '@/lib/format';
import { lightHaptic, mediumHaptic, successHaptic } from '@/lib/haptics';
import { MIN_EFFORT_MS, effortLogSeconds, effortTarget, formatStopwatch } from '@/lib/stopwatch';
import { useWorkoutStore } from '@/stores/workout-store';

const DIAL_SIZE = 280;

/**
 * Fullscreen stopwatch for timed sets (planks, dead hangs). One Start→Stop
 * cycle records one effort; rest runs while stopped and is shown, not logged.
 * Nothing is written until "Log N sets" commits every recorded effort onto
 * the exercise — filling incomplete sets in order and creating sets beyond
 * the plan — then returns to the logger. Closing keeps the session alive.
 */
export default function StopwatchScreen() {
  const router = useRouter();
  const ring = useRingColors();
  const exercises = useWorkoutStore((s) => s.activeWorkout?.exercises);
  const {
    stopwatch,
    running,
    effortMs,
    restMs,
    effortsMs,
    pendingSeconds,
    start,
    pause,
    startNext,
    discard,
    resetEffort,
    commit,
  } = useStopwatch();

  const exercise = exercises?.find((e) => e.id === stopwatch?.exerciseId);

  // Single-pop dismiss. Logging clears the session, which also trips the
  // session-gone effect below — without this guard the two back() calls pop
  // the stopwatch AND the active screen under it.
  const dismissedRef = useRef(false);
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    router.back();
  }, [router]);

  // Session gone (workout finished elsewhere, exercise removed) — nothing to
  // time. Dismiss instead of rendering a dead screen.
  useEffect(() => {
    if (!stopwatch || !exercise) dismiss();
  }, [stopwatch, exercise, dismiss]);
  if (!stopwatch || !exercise) return null;

  const sets = exercise.sets;
  const idle = !running && effortMs === 0 && effortsMs.length === 0;
  const stopped = !running && !idle;
  const currentFrozen = !running && effortMs >= MIN_EFFORT_MS;
  const pendingCount = pendingSeconds.length;
  const incompleteCount = sets.filter((s) => !s.completed).length;
  const createdCount = Math.max(0, pendingCount - incompleteCount);
  // The set the CURRENT effort will land on (banked efforts claim theirs first).
  const currentTarget = effortTarget(sets, effortsMs.length);

  const handleStart = () => {
    mediumHaptic();
    start();
  };

  const handleStop = () => {
    mediumHaptic();
    pause();
  };

  const handleStartNext = () => {
    successHaptic();
    startNext();
  };

  const handleDiscardEffort = (index: number) => {
    lightHaptic();
    discard(index);
  };

  const handleLog = () => {
    successHaptic();
    commit();
    dismiss();
  };

  // Resets only the current stopped time — recorded sets keep their own ✕.
  const handleReset = () => {
    Alert.alert(
      'Reset current time?',
      `${formatTime(effortLogSeconds(effortMs))} hasn't been logged and will be cleared.${
        effortsMs.length > 0 ? ' Recorded sets are kept.' : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            mediumHaptic();
            resetEffort();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']} testID="stopwatch-screen">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View className="flex-1 pr-3">
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {exercise.name}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {effortsMs.length > 0
              ? `${effortsMs.length} ${effortsMs.length === 1 ? 'effort' : 'efforts'} recorded · nothing logged yet`
              : 'Each start–stop records one set'}
          </Text>
        </View>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={running ? 'Close stopwatch, keeps running' : 'Close stopwatch'}
          testID="stopwatch-close"
          className="h-11 w-11 items-center justify-center rounded-xl border border-border"
        >
          <Icon as={X} size={20} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* Dial — the ring sweeps once per minute like a chronograph hand */}
      <View className="flex-1 items-center justify-center">
        <View style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
          <ProgressRing
            progress={(effortMs % 60_000) / 60_000}
            size={DIAL_SIZE}
            strokeWidth={7}
            color={running ? ring.primary : currentFrozen ? ring.good : ring.track}
            trackColor={ring.track}
          />
          <View className="absolute inset-0 items-center justify-center gap-1">
            <Text
              className="font-mono text-[52px] font-extrabold tracking-tight text-foreground"
              accessibilityLabel={`Set time ${formatStopwatch(effortMs)}`}
              testID="stopwatch-readout"
            >
              {formatStopwatch(effortMs)}
            </Text>
            {running ? (
              <Text className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                set {currentTarget.setNumber}
              </Text>
            ) : stopped ? (
              <Text
                className="font-mono text-xs uppercase tracking-widest text-primary"
                testID="stopwatch-rest"
              >
                rest {formatTime(Math.floor(restMs / 1000))}
              </Text>
            ) : (
              <Text className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                set {currentTarget.setNumber} of {Math.max(sets.length, currentTarget.setNumber)}
              </Text>
            )}
          </View>
        </View>

        {/* Recorded efforts → where they'll land */}
        {pendingCount > 0 && (
          <ScrollView
            className="mt-4 max-h-36 self-stretch"
            contentContainerClassName="gap-1.5 px-10"
            showsVerticalScrollIndicator={false}
          >
            {effortsMs.map((ms, i) => {
              const target = effortTarget(sets, i);
              return (
                <View key={i} className="flex-row items-center justify-between">
                  <Text className="font-mono text-sm text-foreground">
                    {formatTime(effortLogSeconds(ms))}
                    <Text className="text-sm text-muted-foreground">
                      {'  →  Set '}
                      {target.setNumber}
                      {target.isNew ? ' · new' : ''}
                    </Text>
                  </Text>
                  <Pressable
                    onPress={() => handleDiscardEffort(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Discard effort ${i + 1}, ${formatTime(effortLogSeconds(ms))}`}
                    hitSlop={10}
                    testID={`stopwatch-discard-${i}`}
                    className="h-8 w-8 items-center justify-center"
                  >
                    <Icon as={X} size={14} className="text-muted-foreground" />
                  </Pressable>
                </View>
              );
            })}
            {currentFrozen && (
              <View className="flex-row items-center justify-between">
                <Text className="font-mono text-sm text-foreground">
                  {formatTime(effortLogSeconds(effortMs))}
                  <Text className="text-sm text-muted-foreground">
                    {'  →  Set '}
                    {currentTarget.setNumber}
                    {currentTarget.isNew ? ' · new' : ''}
                  </Text>
                </Text>
                <Text className="pr-2 font-mono text-[10px] uppercase text-muted-foreground">
                  on the clock
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Controls */}
      <View className="gap-3 px-5 pb-4">
        {/* Big Start: fresh session, or ready for the next set after a Reset. */}
        {(idle || (stopped && !currentFrozen)) && (
          <Pressable
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Start timing this set"
            testID="stopwatch-start"
            className="h-20 items-center justify-center rounded-3xl bg-primary"
          >
            <View className="flex-row items-center gap-2">
              <Icon as={Play} size={22} className="text-primary-foreground" />
              <Text className="text-xl font-bold text-primary-foreground">Start</Text>
            </View>
          </Pressable>
        )}

        {running && (
          <Pressable
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Stop — ends this set's time"
            testID="stopwatch-stop"
            className="h-20 items-center justify-center rounded-3xl border border-destructive bg-destructive/10"
          >
            <View className="flex-row items-center gap-2">
              <Icon as={Pause} size={22} className="text-destructive" />
              <Text className="text-xl font-bold text-destructive">Stop</Text>
            </View>
          </Pressable>
        )}

        {stopped && (
          <>
            {currentFrozen && (
              <View className="flex-row gap-3">
                <Pressable
                  onPress={handleStart}
                  accessibilityRole="button"
                  accessibilityLabel="Resume — continue this set's time"
                  testID="stopwatch-resume"
                  className="h-16 flex-1 items-center justify-center rounded-2xl border border-border bg-secondary"
                >
                  <Text className="text-base font-bold text-secondary-foreground">Resume</Text>
                </Pressable>
                <Pressable
                  onPress={handleStartNext}
                  accessibilityRole="button"
                  accessibilityLabel={`Record ${formatTime(effortLogSeconds(effortMs))} and start timing the next set`}
                  testID="stopwatch-next"
                  className="h-16 flex-[1.4] items-center justify-center rounded-2xl bg-primary"
                >
                  <Text className="text-base font-bold text-primary-foreground">
                    Start next set ▶
                  </Text>
                </Pressable>
              </View>
            )}
            {pendingCount > 0 && (
              <Pressable
                onPress={handleLog}
                accessibilityRole="button"
                accessibilityLabel={`Log ${pendingCount} ${pendingCount === 1 ? 'set' : 'sets'}${createdCount > 0 ? `, creates ${createdCount} new` : ''}`}
                testID="stopwatch-log"
                className="h-14 items-center justify-center rounded-2xl border border-green-500 bg-card"
              >
                <Text className="text-base font-bold text-green-500">
                  Log {pendingCount} {pendingCount === 1 ? 'set' : 'sets'}
                  {createdCount > 0 ? ` · creates ${createdCount} new` : ''}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {stopped && currentFrozen && (
          <Pressable
            onPress={handleReset}
            accessibilityRole="button"
            accessibilityLabel="Reset current time"
            testID="stopwatch-reset"
            className="min-h-[44px] items-center justify-center"
          >
            <Text className="text-sm font-medium text-muted-foreground">Reset</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

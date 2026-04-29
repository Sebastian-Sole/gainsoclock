import React, { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Check, Dumbbell, TrendingUp } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { lightHaptic, mediumHaptic } from '@/lib/haptics';
import { capture } from '@/lib/analytics';

// ── Demo content (mirrors a real workout active screen) ──────────
const EXERCISE_NAME = 'Barbell back squat';
const EXERCISE_NOTES = '4 working sets · 2 min rest';

type SetRow = { reps: number; weight: number };
const SETS: readonly SetRow[] = [
  { reps: 6, weight: 80 },
  { reps: 6, weight: 82.5 },
  { reps: 6, weight: 85 },
  { reps: 6, weight: 85 },
];

// Last 7 sessions, % of session-volume PR
const PROGRESS_BARS = [38, 52, 60, 71, 78, 84, 92];

// ── Animation timeline (ms) ────────────────────────────────────
const T = {
  titleIn: 0,
  frameIn: 350,
  exerciseIn: 850,
  firstSetAt: 1450,
  setStaggerMs: 380,
  progressIn: 320, // chained after sets
  progressBarStaggerMs: 90,
  settleHold: 700,
  loopGap: 3200,
} as const;

// ── Set row mock — matches `SetRow` (set-row.tsx) ────────────────
function SetRowMock({
  index,
  set,
  rowVisibility,
  completed,
}: {
  index: number;
  set: SetRow;
  rowVisibility: SharedValue<number>; // 0..1
  completed: SharedValue<number>; // 0..1
}) {
  const rowStyle = useAnimatedStyle(() => ({
    opacity: rowVisibility.value,
    transform: [{ translateY: (1 - rowVisibility.value) * 6 }],
  }));

  // Background tints to bg-primary/10 when completed (matches real SetRow).
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor:
      completed.value > 0 ? `rgba(34, 197, 94, ${0.12 * completed.value})` : 'transparent',
  }));

  // Checkbox fills with primary when completed.
  const checkboxStyle = useAnimatedStyle(() => ({
    backgroundColor:
      completed.value > 0
        ? `rgba(34, 197, 94, ${completed.value})`
        : 'transparent',
    borderColor:
      completed.value > 0
        ? `rgba(34, 197, 94, ${completed.value})`
        : '#999',
    transform: [{ scale: 0.9 + 0.1 * completed.value }],
  }));

  const checkIconStyle = useAnimatedStyle(() => ({
    opacity: completed.value,
  }));

  return (
    <Animated.View style={rowStyle}>
      <Animated.View
        style={[
          bgStyle,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
          },
        ]}
      >
        {/* Set index */}
        <View className="w-6 items-center">
          <Text className="text-[13px] text-muted-foreground">{index + 1}</Text>
        </View>

        {/* Weight + reps "inputs" */}
        <View className="flex-1 flex-row items-center gap-2">
          <View className="flex-1 rounded-md border border-input bg-background px-2 py-1.5">
            <Text className="text-center text-[13px] font-medium text-foreground">
              {set.weight}
            </Text>
          </View>
          <Text className="text-[12px] text-muted-foreground">×</Text>
          <View className="flex-1 rounded-md border border-input bg-background px-2 py-1.5">
            <Text className="text-center text-[13px] font-medium text-foreground">
              {set.reps}
            </Text>
          </View>
        </View>

        {/* Checkbox */}
        <Animated.View
          style={[
            checkboxStyle,
            {
              height: 28,
              width: 28,
              borderRadius: 6,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <Animated.View style={checkIconStyle}>
            <Icon as={Check} size={14} className="text-white" />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// ── Progress bar (mini chart) ────────────────────────────────────
function ProgressBar({
  fraction,
  highlight,
}: {
  fraction: SharedValue<number>;
  highlight: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    height: `${fraction.value * 100}%`,
  }));
  return (
    <View className="h-full flex-1 justify-end">
      <Animated.View
        style={style}
        className={`mx-0.5 rounded-t-md ${
          highlight ? 'bg-primary' : 'bg-primary/40'
        }`}
      />
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────
export default function DemoWorkoutsScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(8);
  const frameOpacity = useSharedValue(0);
  const frameY = useSharedValue(28);
  const frameScale = useSharedValue(0.97);

  const exerciseOpacity = useSharedValue(0);
  const exerciseY = useSharedValue(20);
  const exerciseScale = useSharedValue(0.94);

  const setVis = SETS.map(() => useSharedValue(0));
  const setComplete = SETS.map(() => useSharedValue(0));

  const progressOpacity = useSharedValue(0);
  const progressY = useSharedValue(20);
  const barFractions = PROGRESS_BARS.map(() => useSharedValue(0));

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const setTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  };
  const clearAllTimers = () => {
    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current = [];
  };

  const flyIn = (
    opacity: SharedValue<number>,
    y: SharedValue<number>,
    scale?: SharedValue<number>
  ) => {
    opacity.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
    y.value = withSpring(0, { damping: 16, stiffness: 220, mass: 0.55 });
    if (scale) {
      scale.value = withSpring(1, { damping: 16, stiffness: 220, mass: 0.55 });
    }
  };

  const runSequence = () => {
    titleOpacity.value = 0;
    titleY.value = 8;
    frameOpacity.value = 0;
    frameY.value = 28;
    frameScale.value = 0.97;
    exerciseOpacity.value = 0;
    exerciseY.value = 20;
    exerciseScale.value = 0.94;
    for (const v of setVis) v.value = 0;
    for (const c of setComplete) c.value = 0;
    progressOpacity.value = 0;
    progressY.value = 20;
    for (const b of barFractions) b.value = 0;

    if (reduceMotion) {
      titleOpacity.value = 1;
      titleY.value = 0;
      frameOpacity.value = 1;
      frameY.value = 0;
      frameScale.value = 1;
      exerciseOpacity.value = 1;
      exerciseY.value = 0;
      exerciseScale.value = 1;
      for (const v of setVis) v.value = 1;
      for (const c of setComplete) c.value = 1;
      progressOpacity.value = 1;
      progressY.value = 0;
      barFractions.forEach((b, i) => {
        b.value = PROGRESS_BARS[i] / 100;
      });
      return;
    }

    titleOpacity.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
    titleY.value = withTiming(0, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });

    setTimer(() => {
      frameOpacity.value = withTiming(1, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
      });
      frameY.value = withSpring(0, { damping: 14, stiffness: 160, mass: 0.6 });
      frameScale.value = withSpring(1, {
        damping: 14,
        stiffness: 160,
        mass: 0.6,
      });
    }, T.frameIn);

    setTimer(() => {
      flyIn(exerciseOpacity, exerciseY, exerciseScale);
      lightHaptic();
    }, T.exerciseIn);

    // Each set row appears, then ticks complete shortly after.
    for (let i = 0; i < SETS.length; i += 1) {
      const at = T.firstSetAt + i * T.setStaggerMs;
      setTimer(() => {
        setVis[i].value = withTiming(1, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
        setTimer(() => {
          setComplete[i].value = withTiming(1, {
            duration: 280,
            easing: Easing.out(Easing.cubic),
          });
          lightHaptic();
        }, 200);
      }, at);
    }

    const allSetsAt = T.firstSetAt + SETS.length * T.setStaggerMs + 320;

    setTimer(() => {
      flyIn(progressOpacity, progressY);
    }, allSetsAt + T.progressIn);

    PROGRESS_BARS.forEach((p, i) => {
      setTimer(() => {
        barFractions[i].value = withTiming(p / 100, {
          duration: 460,
          easing: Easing.out(Easing.cubic),
        });
        if (i === PROGRESS_BARS.length - 1) {
          mediumHaptic();
        }
      }, allSetsAt + T.progressIn + 140 + i * T.progressBarStaggerMs);
    });

    const totalEnd =
      allSetsAt +
      T.progressIn +
      140 +
      PROGRESS_BARS.length * T.progressBarStaggerMs +
      T.settleHold;
    setTimer(() => runSequence(), totalEnd + T.loopGap);
  };

  useEffect(() => {
    capture({ name: 'demo_workouts_shown', props: {} });
    runSequence();
    return () => {
      clearAllTimers();
      cancelAnimation(titleOpacity);
      cancelAnimation(titleY);
      cancelAnimation(frameOpacity);
      cancelAnimation(frameY);
      cancelAnimation(frameScale);
      cancelAnimation(exerciseOpacity);
      cancelAnimation(exerciseY);
      cancelAnimation(exerciseScale);
      for (const v of setVis) cancelAnimation(v);
      for (const c of setComplete) cancelAnimation(c);
      cancelAnimation(progressOpacity);
      cancelAnimation(progressY);
      for (const b of barFractions) cancelAnimation(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const frameStyle = useAnimatedStyle(() => ({
    opacity: frameOpacity.value,
    transform: [{ translateY: frameY.value }, { scale: frameScale.value }],
  }));
  const exerciseStyle = useAnimatedStyle(() => ({
    opacity: exerciseOpacity.value,
    transform: [
      { translateY: exerciseY.value },
      { scale: exerciseScale.value },
    ],
  }));
  const progressStyle = useAnimatedStyle(() => ({
    opacity: progressOpacity.value,
    transform: [{ translateY: progressY.value }],
  }));

  const handleContinue = () => {
    capture({ name: 'demo_workouts_continue', props: {} });
    mediumHaptic();
    router.replace('/onboarding/founder-note');
  };

  const handleSkip = () => {
    capture({ name: 'demo_workouts_skipped', props: {} });
    lightHaptic();
    router.replace('/onboarding/founder-note');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 justify-between px-6 pt-6 pb-8">
        {/* Title block */}
        <Animated.View style={titleStyle} className="items-center px-2">
          <View className="mb-3 flex-row items-center gap-1.5">
            <Icon as={Dumbbell} size={14} className="text-primary" />
            <Text className="text-xs font-medium uppercase tracking-widest text-primary">
              Every rep counts
            </Text>
          </View>
          <Text
            className="text-center text-[28px] font-bold leading-tight text-foreground"
            accessibilityRole="header"
          >
            Log workouts.{'\n'}Watch your progress.
          </Text>
          <Text className="mt-3 text-center text-[15px] leading-6 text-muted-foreground">
            Tap, log, done. Your numbers compound week over week.
          </Text>
        </Animated.View>

        {/* Demo frame */}
        <View className="items-center">
          <Animated.View
            style={[
              frameStyle,
              {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.18,
                shadowRadius: 28,
              },
            ]}
            className="w-full max-w-md rounded-3xl border border-border bg-card/60 p-4"
            accessibilityLabel="A scripted demo showing workout logging and progress"
          >
            <View className="gap-3">
              {/* Exercise card — matches active workout exercise list */}
              <Animated.View
                style={exerciseStyle}
                className="rounded-xl border border-border bg-card p-3"
              >
                <Text className="text-[15px] font-semibold text-foreground">
                  {EXERCISE_NAME}
                </Text>
                <Text className="mb-2 text-[11px] text-muted-foreground">
                  {EXERCISE_NOTES}
                </Text>

                {/* Header row */}
                <View className="mb-1 flex-row items-center gap-2 px-3">
                  <View className="w-6 items-center">
                    <Text className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Set
                    </Text>
                  </View>
                  <View className="flex-1 flex-row items-center gap-2">
                    <Text className="flex-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                      Kg
                    </Text>
                    <Text className="text-[12px] text-transparent">×</Text>
                    <Text className="flex-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                      Reps
                    </Text>
                  </View>
                  <View style={{ width: 28 }} />
                </View>

                {/* Set rows */}
                <View className="gap-1">
                  {SETS.map((set, i) => (
                    <SetRowMock
                      key={i}
                      index={i}
                      set={set}
                      rowVisibility={setVis[i]}
                      completed={setComplete[i]}
                    />
                  ))}
                </View>
              </Animated.View>

              {/* Progress chart */}
              <Animated.View
                style={progressStyle}
                className="rounded-xl border border-border bg-card p-3"
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <Icon as={TrendingUp} size={14} className="text-primary" />
                  <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Last 7 sessions
                  </Text>
                </View>
                <View
                  style={{ height: 56 }}
                  className="flex-row items-end"
                >
                  {PROGRESS_BARS.map((_, i) => (
                    <ProgressBar
                      key={i}
                      fraction={barFractions[i]}
                      highlight={i === PROGRESS_BARS.length - 1}
                    />
                  ))}
                </View>
                <Text className="mt-2 text-[11px] text-muted-foreground">
                  +14% volume vs. last week
                </Text>
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        {/* CTAs */}
        <View className="gap-3">
          <Pressable
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            testID="demo-workouts-continue"
            className="items-center rounded-2xl bg-primary py-4 active:opacity-80"
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            testID="demo-workouts-skip"
            hitSlop={8}
            className="min-h-[44px] items-center justify-center"
          >
            <Text className="text-sm text-muted-foreground">Skip</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

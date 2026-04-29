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
import { Apple, Plus, UtensilsCrossed } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { lightHaptic, mediumHaptic } from '@/lib/haptics';
import { capture } from '@/lib/analytics';

// ── Demo content (mirrors what the real Today tab shows) ─────────
const CALORIES = 1620;
const CALORIES_GOAL = 2080;
const REMAINING = CALORIES_GOAL - CALORIES;

const MACROS = [
  { label: 'Protein', value: 124, goal: 140, color: '#3b82f6' }, // blue
  { label: 'Carbs', value: 188, goal: 240, color: '#eab308' }, //   yellow
  { label: 'Fat', value: 56, goal: 70, color: '#ef4444' }, //       red
];

type MealRow = {
  title: string;
  time: string;
  cal: number;
  p: number;
  c: number;
  f: number;
};
const MEALS: readonly MealRow[] = [
  { title: 'Greek yogurt + berries', time: '08:14', cal: 320, p: 28, c: 38, f: 6 },
  { title: 'Chicken & sweet potato bowl', time: '12:42', cal: 540, p: 45, c: 62, f: 14 },
];

// ── Animation timeline (ms) ────────────────────────────────────
const T = {
  titleIn: 0,
  frameIn: 350,
  caloriesIn: 850,
  caloriesFillStart: 1050,
  caloriesFillDuration: 900,
  macrosFirstAt: 1450,
  macroStaggerMs: 160,
  logButtonIn: 0, // chained after macros
  mealsHeaderIn: 250, // after log button
  firstMealAt: 0, // chained after meals header
  mealStaggerMs: 220,
  settleHold: 700,
  loopGap: 3200,
} as const;

// ── Horizontal progress bar (matches `MacroProgress` ProgressBar) ─
function HorizontalBar({
  fraction,
  color,
  height = 10,
}: {
  fraction: SharedValue<number>;
  color: string;
  height?: number;
}) {
  const fillStyle = useAnimatedStyle(() => ({
    width: `${fraction.value * 100}%`,
  }));
  return (
    <View
      className="overflow-hidden rounded-full bg-secondary"
      style={{ height }}
    >
      <Animated.View
        style={[
          fillStyle,
          { height: '100%', backgroundColor: color, borderRadius: 999 },
        ]}
      />
    </View>
  );
}

// ── Meal card mock (matches `MealLogCard`) ───────────────────────
function MealCardMock({ meal }: { meal: MealRow }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
        <Icon as={UtensilsCrossed} size={16} className="text-primary" />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-medium" numberOfLines={1}>
          {meal.title}
        </Text>
        <Text className="text-[11px] text-muted-foreground">{meal.time}</Text>
      </View>
      <View className="items-end">
        <Text className="text-[13px] font-semibold">{meal.cal} cal</Text>
        <Text className="text-[10px] text-muted-foreground">
          {meal.p}g P · {meal.c}g C · {meal.f}g F
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────
export default function DemoMealsScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(8);
  const frameOpacity = useSharedValue(0);
  const frameY = useSharedValue(28);
  const frameScale = useSharedValue(0.97);

  const caloriesCardOpacity = useSharedValue(0);
  const caloriesCardY = useSharedValue(20);
  const caloriesCardScale = useSharedValue(0.94);
  const caloriesFraction = useSharedValue(0);

  const macrosOpacity = MACROS.map(() => useSharedValue(0));
  const macrosY = MACROS.map(() => useSharedValue(8));
  const macrosFraction = MACROS.map(() => useSharedValue(0));

  const logButtonOpacity = useSharedValue(0);
  const logButtonY = useSharedValue(10);

  const mealsHeaderOpacity = useSharedValue(0);
  const mealsOpacity = MEALS.map(() => useSharedValue(0));
  const mealsY = MEALS.map(() => useSharedValue(16));

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
    caloriesCardOpacity.value = 0;
    caloriesCardY.value = 20;
    caloriesCardScale.value = 0.94;
    caloriesFraction.value = 0;
    for (const o of macrosOpacity) o.value = 0;
    for (const v of macrosY) v.value = 8;
    for (const f of macrosFraction) f.value = 0;
    logButtonOpacity.value = 0;
    logButtonY.value = 10;
    mealsHeaderOpacity.value = 0;
    for (const o of mealsOpacity) o.value = 0;
    for (const v of mealsY) v.value = 16;

    if (reduceMotion) {
      titleOpacity.value = 1;
      titleY.value = 0;
      frameOpacity.value = 1;
      frameY.value = 0;
      frameScale.value = 1;
      caloriesCardOpacity.value = 1;
      caloriesCardY.value = 0;
      caloriesCardScale.value = 1;
      caloriesFraction.value = CALORIES / CALORIES_GOAL;
      MACROS.forEach((m, i) => {
        macrosOpacity[i].value = 1;
        macrosY[i].value = 0;
        macrosFraction[i].value = m.value / m.goal;
      });
      logButtonOpacity.value = 1;
      logButtonY.value = 0;
      mealsHeaderOpacity.value = 1;
      MEALS.forEach((_, i) => {
        mealsOpacity[i].value = 1;
        mealsY[i].value = 0;
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

    // Calories card flies in, then the bar fills.
    setTimer(() => {
      flyIn(caloriesCardOpacity, caloriesCardY, caloriesCardScale);
      lightHaptic();
    }, T.caloriesIn);

    setTimer(() => {
      caloriesFraction.value = withTiming(CALORIES / CALORIES_GOAL, {
        duration: T.caloriesFillDuration,
        easing: Easing.out(Easing.cubic),
      });
    }, T.caloriesFillStart);

    // Each macro row staggers in, then its bar fills shortly after.
    MACROS.forEach((m, i) => {
      const at = T.macrosFirstAt + i * T.macroStaggerMs;
      setTimer(() => {
        macrosOpacity[i].value = withTiming(1, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
        macrosY[i].value = withSpring(0, {
          damping: 18,
          stiffness: 240,
          mass: 0.5,
        });
        macrosFraction[i].value = withTiming(m.value / m.goal, {
          duration: 700,
          easing: Easing.out(Easing.cubic),
        });
      }, at);
    });

    const macrosEndAt =
      T.macrosFirstAt + MACROS.length * T.macroStaggerMs + 320;

    // Log Meal button.
    setTimer(() => {
      flyIn(logButtonOpacity, logButtonY);
    }, macrosEndAt);

    // "TODAY'S MEALS" small header + meal cards.
    setTimer(() => {
      mealsHeaderOpacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    }, macrosEndAt + T.mealsHeaderIn);

    MEALS.forEach((_, i) => {
      const at = macrosEndAt + T.mealsHeaderIn + 220 + i * T.mealStaggerMs;
      setTimer(() => {
        flyIn(mealsOpacity[i], mealsY[i]);
        if (i === MEALS.length - 1) mediumHaptic();
      }, at);
    });

    const totalEnd =
      macrosEndAt +
      T.mealsHeaderIn +
      220 +
      MEALS.length * T.mealStaggerMs +
      T.settleHold;
    setTimer(() => runSequence(), totalEnd + T.loopGap);
  };

  useEffect(() => {
    capture({ name: 'demo_meals_shown', props: {} });
    runSequence();
    return () => {
      clearAllTimers();
      cancelAnimation(titleOpacity);
      cancelAnimation(titleY);
      cancelAnimation(frameOpacity);
      cancelAnimation(frameY);
      cancelAnimation(frameScale);
      cancelAnimation(caloriesCardOpacity);
      cancelAnimation(caloriesCardY);
      cancelAnimation(caloriesCardScale);
      cancelAnimation(caloriesFraction);
      for (const o of macrosOpacity) cancelAnimation(o);
      for (const v of macrosY) cancelAnimation(v);
      for (const f of macrosFraction) cancelAnimation(f);
      cancelAnimation(logButtonOpacity);
      cancelAnimation(logButtonY);
      cancelAnimation(mealsHeaderOpacity);
      for (const o of mealsOpacity) cancelAnimation(o);
      for (const v of mealsY) cancelAnimation(v);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // ── Animated styles ────────────────────────────────────────────
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const frameStyle = useAnimatedStyle(() => ({
    opacity: frameOpacity.value,
    transform: [{ translateY: frameY.value }, { scale: frameScale.value }],
  }));
  const caloriesCardStyle = useAnimatedStyle(() => ({
    opacity: caloriesCardOpacity.value,
    transform: [
      { translateY: caloriesCardY.value },
      { scale: caloriesCardScale.value },
    ],
  }));
  const logButtonStyle = useAnimatedStyle(() => ({
    opacity: logButtonOpacity.value,
    transform: [{ translateY: logButtonY.value }],
  }));
  const mealsHeaderStyle = useAnimatedStyle(() => ({
    opacity: mealsHeaderOpacity.value,
  }));

  // Per-row macro animated wrapper
  const macroRowStyles = MACROS.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: macrosOpacity[i].value,
      transform: [{ translateY: macrosY[i].value }],
    }))
  );
  const mealRowStyles = MEALS.map((_, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => ({
      opacity: mealsOpacity[i].value,
      transform: [{ translateY: mealsY[i].value }],
    }))
  );

  const handleContinue = () => {
    capture({ name: 'demo_meals_continue', props: {} });
    mediumHaptic();
    router.replace('/onboarding/demo-workouts');
  };

  const handleSkip = () => {
    capture({ name: 'demo_meals_skipped', props: {} });
    lightHaptic();
    router.replace('/onboarding/demo-workouts');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 justify-between px-6 pt-6 pb-8">
        {/* Title block */}
        <Animated.View style={titleStyle} className="items-center px-2">
          <View className="mb-3 flex-row items-center gap-1.5">
            <Icon as={Apple} size={14} className="text-primary" />
            <Text className="text-xs font-medium uppercase tracking-widest text-primary">
              Personalized nutrition
            </Text>
          </View>
          <Text
            className="text-center text-[28px] font-bold leading-tight text-foreground"
            accessibilityRole="header"
          >
            Track meals.{'\n'}Know what works.
          </Text>
          <Text className="mt-3 text-center text-[15px] leading-6 text-muted-foreground">
            Calories, macros, and every meal — all in one place.
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
            accessibilityLabel="A scripted demo showing daily nutrition tracking"
          >
            <View className="gap-3">
              {/* Calories card — mirrors MacroProgress */}
              <Animated.View
                style={caloriesCardStyle}
                className="rounded-xl border border-border bg-card p-4"
              >
                <View className="items-center">
                  <Text className="text-[32px] font-bold leading-none text-foreground">
                    {CALORIES}
                  </Text>
                  <Text className="mt-1 text-[12px] text-muted-foreground">
                    of {CALORIES_GOAL} cal · {REMAINING} remaining
                  </Text>
                  <View className="mt-3 w-full">
                    <HorizontalBar
                      fraction={caloriesFraction}
                      color="#22c55e"
                      height={10}
                    />
                  </View>
                </View>

                {/* Macros row */}
                <View className="mt-4 flex-row gap-3">
                  {MACROS.map((m, i) => (
                    <Animated.View
                      key={m.label}
                      style={macroRowStyles[i]}
                      className="flex-1"
                    >
                      <View className="mb-1 flex-row items-baseline justify-between">
                        <Text className="text-[11px] font-medium text-muted-foreground">
                          {m.label}
                        </Text>
                        <Text className="text-[10px] text-muted-foreground">
                          {m.value}g / {m.goal}g
                        </Text>
                      </View>
                      <HorizontalBar
                        fraction={macrosFraction[i]}
                        color={m.color}
                        height={6}
                      />
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>

              {/* Log Meal button */}
              <Animated.View style={logButtonStyle}>
                <View className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-2.5">
                  <Icon
                    as={Plus}
                    size={16}
                    className="text-primary-foreground"
                  />
                  <Text className="text-[14px] font-semibold text-primary-foreground">
                    Log Meal
                  </Text>
                </View>
              </Animated.View>

              {/* Today's meals */}
              <Animated.View style={mealsHeaderStyle}>
                <Text className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Today's meals
                </Text>
              </Animated.View>

              <View className="gap-2">
                {MEALS.map((meal, i) => (
                  <Animated.View key={meal.title} style={mealRowStyles[i]}>
                    <MealCardMock meal={meal} />
                  </Animated.View>
                ))}
              </View>
            </View>
          </Animated.View>
        </View>

        {/* CTAs */}
        <View className="gap-3">
          <Pressable
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            testID="demo-meals-continue"
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
            testID="demo-meals-skip"
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

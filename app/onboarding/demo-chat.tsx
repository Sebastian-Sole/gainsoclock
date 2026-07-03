import { useRouter } from 'expo-router';
import { Calendar, Sparkles } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
    Easing,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { capture } from '@/lib/analytics';
import { lightHaptic, mediumHaptic } from '@/lib/haptics';

// ── Demo content ────────────────────────────────────────────────
// Hand-authored — this is a scripted demo, not a real chat.

const USER_PROMPT = 'Build me a 4-day plan to gain muscle.';
const AI_REPLY =
  "Here's a 4-day upper/lower split. ~45 min per session, progressive overload built in, based on your current level of activity";
const PLAN_NAME = 'Strength · Upper / Lower';
const PLAN_META = '4 weeks · 4 sessions/week';
// Day-of-week pattern, Mon/Tue/Thu/Fri (1, 2, 4, 5)
const PLAN_DAYS = new Set([1, 2, 4, 5]);
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ── Animation timeline (ms) ────────────────────────────────────
const T = {
  titleIn: 0,
  frameIn: 350,
  userBubbleIn: 850,
  userReadHold: 700, // pause after user bubble lands so eye can read
  typingDotsHold: 800,
  aiBubbleIn: 0, // chained after typing dots
  aiReadHold: 500, // pause after AI bubble lands
  planCardIn: 0, // chained after aiReadHold
  settleHold: 700,
  loopGap: 3200,
} as const;

// ── Typing dots — three pulsing dots, used during "AI thinking" ──
function TypingDots() {
  const reduceMotion = useReduceMotion();
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);

  useEffect(() => {
    if (reduceMotion) {
      d1.value = 1;
      d2.value = 1;
      d3.value = 1;
      return;
    }
    const cycle = (target: ReturnType<typeof useSharedValue<number>>, delay: number) => {
      target.value = withRepeat(
        withDelay(
          delay,
          withSequence(
            withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.3, { duration: 320, easing: Easing.inOut(Easing.quad) })
          )
        ),
        -1,
        false
      );
    };
    cycle(d1, 0);
    cycle(d2, 160);
    cycle(d3, 320);
    return () => {
      cancelAnimation(d1);
      cancelAnimation(d2);
      cancelAnimation(d3);
    };
  }, [reduceMotion, d1, d2, d3]);

  const s1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: d3.value }));

  return (
    <View className="flex-row items-center gap-1.5 self-start rounded-2xl border border-border bg-card px-4 py-3">
      <Animated.View
        style={s1}
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      />
      <Animated.View
        style={s2}
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      />
      <Animated.View
        style={s3}
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      />
    </View>
  );
}

// ── Plan card mock ──────────────────────────────────────────────
function PlanCardMock() {
  return (
    <View className="rounded-2xl border border-border bg-card px-4 py-3">
      <View className="mb-2 flex-row items-center gap-2 border-b border-border pb-2">
        <Icon as={Calendar} size={14} className="text-primary" />
        <Text className="text-[13px] font-semibold">Workout Plan</Text>
      </View>
      <Text className="text-sm font-medium">{PLAN_NAME}</Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">{PLAN_META}</Text>

      <View className="overflow-hidden rounded-md border border-border">
        <View className="flex-row bg-muted/50">
          {DAY_LABELS.map((label, i) => (
            <View key={i} className="flex-1 items-center py-1">
              <Text className="text-[10px] text-muted-foreground">{label}</Text>
            </View>
          ))}
        </View>
        {[0, 1].map((week) => (
          <View
            key={week}
            className={`flex-row ${week === 0 ? '' : 'border-t border-border'}`}
          >
            {DAY_LABELS.map((_, dayIndex) => {
              const isOn = PLAN_DAYS.has(dayIndex);
              return (
                <View key={dayIndex} className="flex-1 items-center py-1.5">
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${
                      isOn ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────
export default function DemoChatScreen() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  // Visibility is driven by Reanimated opacity so the container's layout
  // is stable from first render — no height jumps when elements appear.
  // We track a couple of booleans only for `pointerEvents` accessibility.
  const [planInteractive, setPlanInteractive] = useState(false);

  // Reanimated entry values.
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(8);
  const frameOpacity = useSharedValue(0);
  const frameY = useSharedValue(28);
  const frameScale = useSharedValue(0.97);
  // Bubbles fly in from below with a quick spring + scale.
  const userOpacity = useSharedValue(0);
  const userY = useSharedValue(20);
  const userScale = useSharedValue(0.92);
  const typingOpacity = useSharedValue(0);
  const aiOpacity = useSharedValue(0);
  const aiY = useSharedValue(20);
  const aiScale = useSharedValue(0.92);
  const planOpacity = useSharedValue(0);
  const planY = useSharedValue(24);
  const planScale = useSharedValue(0.94);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const clearAllTimers = () => {
    for (const t of timeoutsRef.current) clearTimeout(t);
    for (const i of intervalsRef.current) clearInterval(i);
    timeoutsRef.current = [];
    intervalsRef.current = [];
  };

  const setTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  const flyInBubble = (
    opacity: ReturnType<typeof useSharedValue<number>>,
    y: ReturnType<typeof useSharedValue<number>>,
    scale: ReturnType<typeof useSharedValue<number>>,
    bigger?: boolean
  ) => {
    opacity.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
    const damping = bigger ? 13 : 16;
    const stiffness = bigger ? 150 : 220;
    const mass = bigger ? 0.7 : 0.55;
    y.value = withSpring(0, { damping, stiffness, mass });
    scale.value = withSpring(1, { damping, stiffness, mass });
  };

  const runSequence = () => {
    setPlanInteractive(false);

    // Reset every value so the loop is idempotent.
    titleOpacity.value = 0;
    titleY.value = 8;
    frameOpacity.value = 0;
    frameY.value = 28;
    frameScale.value = 0.97;
    userOpacity.value = 0;
    userY.value = 20;
    userScale.value = 0.92;
    typingOpacity.value = 0;
    aiOpacity.value = 0;
    aiY.value = 20;
    aiScale.value = 0.92;
    planOpacity.value = 0;
    planY.value = 24;
    planScale.value = 0.94;

    if (reduceMotion) {
      titleOpacity.value = 1;
      titleY.value = 0;
      frameOpacity.value = 1;
      frameY.value = 0;
      frameScale.value = 1;
      userOpacity.value = 1;
      userY.value = 0;
      userScale.value = 1;
      typingOpacity.value = 0;
      aiOpacity.value = 1;
      aiY.value = 0;
      aiScale.value = 1;
      planOpacity.value = 1;
      planY.value = 0;
      planScale.value = 1;
      setPlanInteractive(true);
      return;
    }

    // 0ms — title
    titleOpacity.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
    titleY.value = withTiming(0, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });

    // ~350ms — phone frame
    setTimer(() => {
      frameOpacity.value = withTiming(1, {
        duration: 360,
        easing: Easing.out(Easing.cubic),
      });
      frameY.value = withSpring(0, { damping: 14, stiffness: 160, mass: 0.6 });
      frameScale.value = withSpring(1, { damping: 14, stiffness: 160, mass: 0.6 });
    }, T.frameIn);

    // ~850ms — user bubble flies in
    setTimer(() => {
      flyInBubble(userOpacity, userY, userScale);
      lightHaptic();
    }, T.userBubbleIn);

    // ~1550ms — typing dots fade in (slot already reserved in layout)
    const typingAt = T.userBubbleIn + T.userReadHold;
    setTimer(() => {
      typingOpacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    }, typingAt);

    // ~2350ms — typing dots fade out as AI bubble flies in
    const aiAt = typingAt + T.typingDotsHold + T.aiBubbleIn;
    setTimer(() => {
      typingOpacity.value = withTiming(0, {
        duration: 200,
        easing: Easing.in(Easing.cubic),
      });
      flyInBubble(aiOpacity, aiY, aiScale);
    }, aiAt);

    // ~2850ms — plan card flies in
    const planAt = aiAt + T.aiReadHold + T.planCardIn;
    setTimer(() => {
      flyInBubble(planOpacity, planY, planScale, true);
      mediumHaptic();
      setPlanInteractive(true);
    }, planAt);

    // Loop after a settle
    const totalEnd = planAt + T.settleHold;
    setTimer(() => {
      runSequence();
    }, totalEnd + T.loopGap);
  };

  useEffect(() => {
    capture({ name: 'demo_chat_shown', props: {} });

    runSequence();

    return () => {
      clearAllTimers();
      cancelAnimation(titleOpacity);
      cancelAnimation(titleY);
      cancelAnimation(frameOpacity);
      cancelAnimation(frameY);
      cancelAnimation(frameScale);
      cancelAnimation(userOpacity);
      cancelAnimation(userY);
      cancelAnimation(userScale);
      cancelAnimation(typingOpacity);
      cancelAnimation(aiOpacity);
      cancelAnimation(aiY);
      cancelAnimation(aiScale);
      cancelAnimation(planOpacity);
      cancelAnimation(planY);
      cancelAnimation(planScale);
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

  const userStyle = useAnimatedStyle(() => ({
    opacity: userOpacity.value,
    transform: [{ translateY: userY.value }, { scale: userScale.value }],
  }));

  const typingStyle = useAnimatedStyle(() => ({
    opacity: typingOpacity.value,
  }));

  const aiStyle = useAnimatedStyle(() => ({
    opacity: aiOpacity.value,
    transform: [{ translateY: aiY.value }, { scale: aiScale.value }],
  }));

  const planStyle = useAnimatedStyle(() => ({
    opacity: planOpacity.value,
    transform: [{ translateY: planY.value }, { scale: planScale.value }],
  }));

  const handleContinue = () => {
    capture({ name: 'demo_chat_continue', props: {} });
    mediumHaptic();
    router.replace('/onboarding/demo-meals');
  };

  const handleSkip = () => {
    capture({ name: 'demo_chat_skipped', props: {} });
    lightHaptic();
    // Skip jumps past the remaining demos + founder note to the health
    // integration step (the first real setup screen), not one screen forward.
    router.replace('/onboarding/healthkit');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 justify-between px-6 pt-6 pb-8">
        {/* Title block */}
        <Animated.View style={titleStyle} className="items-center px-2">
          <View className="mb-3 flex-row items-center gap-1.5">
            <Icon as={Sparkles} size={14} className="text-primary" />
            <Text className="text-xs font-medium uppercase tracking-widest text-primary">
              Your AI coach
            </Text>
          </View>
          <Text
            className="text-center text-[28px] font-bold leading-tight text-foreground"
            accessibilityRole="header"
          >
            A personal trainer,{'\n'}in your pocket.
          </Text>
          <Text className="mt-3 text-center text-[15px] leading-6 text-muted-foreground">
            Built around your goals, your schedule, and your data.
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
            className="w-full max-w-md rounded-3xl border border-border bg-card/60 p-5"
            accessibilityLabel="A scripted demo showing a chat with the AI coach"
          >
            {/* Every chat element is always rendered so the container's
                height is set from first render. Visibility is driven by
                Reanimated opacity + transforms (transforms don't affect
                layout). No mid-flow height jumps. */}
            <View className="gap-3">
              {/* User bubble */}
              <Animated.View style={userStyle} className="self-end">
                <View className="max-w-[85%] rounded-2xl bg-primary px-4 py-3">
                  <Text className="text-[15px] leading-6 text-primary-foreground">
                    {USER_PROMPT}
                  </Text>
                </View>
              </Animated.View>

              {/* Typing dots — opacity-gated, layout slot reserved */}
              <Animated.View
                style={typingStyle}
                pointerEvents="none"
                className="self-start"
              >
                <TypingDots />
              </Animated.View>

              {/* AI bubble */}
              <Animated.View style={aiStyle} className="self-start">
                <View className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-3">
                  <Text className="text-[15px] leading-6 text-foreground">
                    {AI_REPLY}
                  </Text>
                </View>
              </Animated.View>

              {/* Plan card */}
              <Animated.View
                style={planStyle}
                pointerEvents={planInteractive ? 'auto' : 'none'}
                className="self-start w-full max-w-[85%]"
              >
                <PlanCardMock />
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
            testID="demo-chat-continue"
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
            testID="demo-chat-skip"
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

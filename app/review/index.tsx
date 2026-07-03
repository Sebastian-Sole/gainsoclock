import { useAction, useQuery } from 'convex/react';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Sparkles,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecommendationCard } from '@/components/review/recommendation-card';
import {
  completedWeekStart,
  formatWeekRange,
  MAX_WEEKS_BACK,
} from '@/components/review/review-dates';
import { ReviewStatsGrid } from '@/components/review/review-stats-grid';
import type { WeeklyReview } from '@/components/review/review-types';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { usePurchases } from '@/hooks/use-purchases';
import { capture } from '@/lib/analytics';
import { useSettingsStore } from '@/stores/settings-store';
import { useSubscriptionStore } from '@/stores/subscription-store';

export default function WeeklyReviewScreen() {
  const router = useRouter();
  const [weeksBack, setWeeksBack] = useState(0);
  const weekStart = useMemo(() => completedWeekStart(weeksBack), [weeksBack]);

  const review: WeeklyReview | null | undefined = useQuery(
    api.weeklyReview.getReview,
    { weekStart }
  );
  const generateReview = useAction(api.weeklyReview.generateReview);

  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const isPro = useSubscriptionStore((s) => s.isPro);
  const { presentPaywall } = usePurchases();

  // Results returned directly by the action, keyed by weekStart. The reactive
  // `getReview` query normally catches up once the server stores the review;
  // this keeps the screen populated either way.
  const [generatedByWeek, setGeneratedByWeek] = useState<
    Record<string, WeeklyReview>
  >({});
  const [generatingWeek, setGeneratingWeek] = useState<string | null>(null);
  const [generateFailed, setGenerateFailed] = useState(false);
  const attemptedWeeksRef = useRef<Set<string>>(new Set());
  const reviewOpenedFiredRef = useRef(false);

  // Fire once per mount, as soon as the initial query resolves (not while
  // `review` is still `undefined`/loading). Subsequent week navigation
  // re-queries `review` but must not re-fire the event.
  useEffect(() => {
    if (reviewOpenedFiredRef.current) return;
    if (review === undefined) return;
    reviewOpenedFiredRef.current = true;
    capture({ name: 'review_opened', props: { hadExistingReview: review !== null } });
  }, [review]);

  const runGenerate = useCallback(
    async (target: string) => {
      setGeneratingWeek(target);
      setGenerateFailed(false);
      try {
        const result: WeeklyReview | null = await generateReview({
          weekStart: target,
        });
        if (result) {
          setGeneratedByWeek((prev) => ({ ...prev, [target]: result }));
        }
      } catch {
        setGenerateFailed(true);
      } finally {
        setGeneratingWeek((current) => (current === target ? null : current));
      }
    },
    [generateReview]
  );

  // Auto-generate once per week when the server has no cached review yet.
  useEffect(() => {
    if (review === null && !attemptedWeeksRef.current.has(weekStart)) {
      attemptedWeeksRef.current.add(weekStart);
      runGenerate(weekStart);
    }
  }, [review, weekStart, runGenerate]);

  const data: WeeklyReview | null | undefined =
    review ?? generatedByWeek[weekStart] ?? review;
  const isGenerating = generatingWeek === weekStart;
  const isLoading = data === undefined || (data === null && isGenerating);

  const handleUpgrade = useCallback(() => {
    presentPaywall();
  }, [presentPaywall]);

  const canGoBack = weeksBack < MAX_WEEKS_BACK;
  const canGoForward = weeksBack > 0;

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={['top']}
      testID="review-screen"
    >
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-1 pt-2">
        <Text className="flex-1 text-lg font-bold">Weekly Review</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close weekly review"
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full"
          testID="review-close-button"
        >
          <Icon as={X} size={22} className="text-foreground" />
        </Pressable>
      </View>

      {/* Week pager */}
      <View className="flex-row items-center justify-between px-4 pb-3">
        <Pressable
          onPress={() => setWeeksBack((w) => Math.min(w + 1, MAX_WEEKS_BACK))}
          disabled={!canGoBack}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          accessibilityState={{ disabled: !canGoBack }}
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full"
          testID="review-week-back"
        >
          <Icon
            as={ChevronLeft}
            size={22}
            className={canGoBack ? 'text-foreground' : 'text-muted-foreground/40'}
          />
        </Pressable>
        <Text className="text-sm font-medium text-muted-foreground">
          {formatWeekRange(weekStart)}
        </Text>
        <Pressable
          onPress={() => setWeeksBack((w) => Math.max(w - 1, 0))}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          accessibilityState={{ disabled: !canGoForward }}
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full"
          testID="review-week-forward"
        >
          <Icon
            as={ChevronRight}
            size={22}
            className={
              canGoForward ? 'text-foreground' : 'text-muted-foreground/40'
            }
          />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isGenerating}
            onRefresh={() => runGenerate(weekStart)}
          />
        }
      >
        {isLoading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator />
            <Text className="mt-3 text-sm text-muted-foreground">
              {isGenerating ? 'Generating your weekly review…' : 'Loading…'}
            </Text>
          </View>
        ) : data === null ? (
          <View className="items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={Sparkles} size={28} className="text-primary" />
            <Text className="text-center text-muted-foreground">
              {generateFailed
                ? "Couldn't generate your review. Check your connection and try again."
                : 'No review for this week yet.'}
            </Text>
            <Button
              size="sm"
              onPress={() => runGenerate(weekStart)}
              accessibilityRole="button"
              accessibilityLabel="Generate weekly review"
              testID="review-generate-button"
            >
              <Text>Generate Review</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-4 pb-8">
            {data.stats.workoutCount === 0 && (
              <View className="items-center rounded-xl border border-dashed border-border px-6 py-8">
                <Icon as={Dumbbell} size={28} className="text-muted-foreground" />
                <Text className="mt-2 text-center font-semibold">
                  No workouts this week
                </Text>
                <Text className="mt-1 text-center text-sm text-muted-foreground">
                  Rest weeks happen — this week is a fresh start.
                </Text>
              </View>
            )}

            <ReviewStatsGrid stats={data.stats} weightUnit={weightUnit} />

            {data.llmUsed && data.narrative ? (
              <>
                <View className="rounded-xl border border-border bg-card p-4">
                  <View className="mb-2 flex-row items-center gap-2">
                    <Icon as={Sparkles} size={16} className="text-primary" />
                    <Text className="text-sm font-semibold text-primary">
                      Coach&apos;s Take
                    </Text>
                  </View>
                  <Text className="text-base leading-6">{data.narrative}</Text>
                </View>
                {data.recommendation && (
                  <RecommendationCard recommendation={data.recommendation} />
                )}
              </>
            ) : (
              <>
                {data.recommendation && (
                  <RecommendationCard recommendation={data.recommendation} />
                )}
                {!data.llmUsed && !isPro && (
                  <Pressable
                    onPress={handleUpgrade}
                    accessibilityRole="button"
                    accessibilityLabel="Upgrade to Pro for AI coach insights"
                    testID="review-upgrade-row"
                    className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <Icon as={Sparkles} size={16} className="text-primary" />
                    <Text className="flex-1 text-sm text-muted-foreground">
                      Upgrade to Pro for AI coach insights
                    </Text>
                    <Icon
                      as={ChevronRight}
                      size={16}
                      className="text-muted-foreground"
                    />
                  </Pressable>
                )}
              </>
            )}

            <Text className="text-center text-xs text-muted-foreground">
              Generated {format(new Date(data.generatedAt), 'MMM d, h:mm a')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

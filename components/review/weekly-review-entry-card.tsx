import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { recommendationKindLabel } from './recommendation-card';
import { completedWeekStart } from './review-dates';
import type { WeeklyReview } from './review-types';

/**
 * Compact entry point into the Weekly Review screen, shown at the top of the
 * Stats > Overview tab. Renders unconditionally — when no review is cached
 * yet (query null/loading) it falls back to a "See your week in review" CTA
 * so the tab never regresses on missing data.
 */
export function WeeklyReviewEntryCard() {
  const router = useRouter();
  const weekStart = completedWeekStart();
  const review: WeeklyReview | null | undefined = useQuery(
    api.weeklyReview.getReview,
    { weekStart }
  );

  let subtitle = 'See your week in review';
  if (review) {
    const count = review.stats.workoutCount;
    subtitle = `${count} workout${count === 1 ? '' : 's'} last week`;
    if (review.recommendation) {
      subtitle += ` · ${recommendationKindLabel(review.recommendation.kind)}`;
    }
  }

  return (
    <Pressable
      onPress={() => router.push('/review')}
      accessibilityRole="button"
      accessibilityLabel={`Weekly review. ${subtitle}`}
      testID="review-entry-card"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon as={Sparkles} size={20} className="text-primary" />
      </View>
      <View className="flex-1">
        <Text className="font-semibold">Weekly Review</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

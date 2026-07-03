import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Flame, Sparkles } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { getAchievementIcon } from '@/components/achievements/achievement-card';
import { completedWeekStart } from '@/components/review/review-dates';
import type { WeeklyReview } from '@/components/review/review-types';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { useAchievements } from '@/hooks/use-achievements';
import { useStats } from '@/hooks/use-stats';
import type { DateRangeFilter } from '@/lib/stats';
import { cn } from '@/lib/utils';

const ALL_TIME: DateRangeFilter = { preset: 'all', from: null, to: null };

/**
 * Compact landing-screen strip composing three engagement signals that are
 * already computed elsewhere: streak status (source of truth for the urgency
 * copy: `components/stats/streaks-section.tsx`), progress toward the next
 * achievement (`useAchievements().groups`), and whether a weekly review is
 * ready (same query usage as `components/review/weekly-review-entry-card.tsx`).
 *
 * Hidden entirely for a brand-new account (no streak, no unlocks, no review)
 * — an empty strip is noise.
 */
export function StatusStrip() {
  const router = useRouter();
  const { streaks } = useStats(ALL_TIME);
  const { groups, unlocked } = useAchievements();
  const weekStart = completedWeekStart();
  const review: WeeklyReview | null | undefined = useQuery(api.weeklyReview.getReview, {
    weekStart,
  });

  const nextAchievement = useMemo(() => {
    let best: (typeof groups)[number] | null = null;
    let bestRatio = -1;
    for (const g of groups) {
      if (!g.progress) continue;
      const ratio = g.progress.target > 0 ? g.progress.current / g.progress.target : 0;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = g;
      }
    }
    return best;
  }, [groups]);

  const atRisk = streaks.currentStreak > 0 && streaks.todayCovered === false;
  const hasStreak = streaks.currentStreak > 0;
  const hasUnlocks = unlocked.size > 0;
  const hasReview = Boolean(review);

  // Brand-new account: nothing earned or at stake yet — an empty strip would
  // just be noise above the template list.
  if (!hasStreak && !hasUnlocks && !hasReview) return null;

  return (
    <View
      className="mx-4 mb-3 flex-row items-stretch rounded-xl border border-border bg-card"
      testID="home-status-strip"
    >
      <Pressable
        onPress={() => router.push('/(tabs)/stats')}
        accessibilityRole="button"
        accessibilityLabel={
          atRisk
            ? `Train today to keep your ${streaks.currentStreak}-day streak`
            : `${streaks.currentStreak} day streak`
        }
        testID="status-strip-streak"
        className="flex-1 items-center justify-center gap-1 px-3 py-3"
      >
        <Icon
          as={Flame}
          size={20}
          className={atRisk ? 'text-primary' : 'text-muted-foreground'}
        />
        <Text className={cn('text-sm font-bold', atRisk && 'text-primary')}>
          {streaks.currentStreak} {streaks.currentStreak === 1 ? 'day' : 'days'}
        </Text>
        <Text
          className={cn(
            'text-center text-xs',
            atRisk ? 'font-medium text-primary' : 'text-muted-foreground',
          )}
          numberOfLines={2}
        >
          {atRisk ? 'Train today to keep it' : 'Current streak'}
        </Text>
      </Pressable>

      {nextAchievement && (
        <>
          <View className="w-px bg-border" />
          <Pressable
            onPress={() => router.push('/achievements')}
            accessibilityRole="button"
            accessibilityLabel={`Next achievement: ${nextAchievement.baseTitle}, ${nextAchievement.progress?.current ?? 0} of ${nextAchievement.progress?.target ?? 0}`}
            testID="status-strip-achievement"
            className="flex-1 items-center justify-center gap-1 px-3 py-3"
          >
            <Icon
              as={getAchievementIcon(nextAchievement.icon)}
              size={20}
              className="text-muted-foreground"
            />
            <Text className="text-sm font-bold" numberOfLines={1}>
              {nextAchievement.baseTitle}
            </Text>
            <Text className="text-center text-xs text-muted-foreground" numberOfLines={1}>
              {nextAchievement.progress?.current ?? 0}/{nextAchievement.progress?.target ?? 0}
            </Text>
          </Pressable>
        </>
      )}

      {hasReview && (
        <>
          <View className="w-px bg-border" />
          <Pressable
            onPress={() => router.push('/review')}
            accessibilityRole="button"
            accessibilityLabel="Weekly review ready"
            testID="status-strip-review"
            className="flex-1 items-center justify-center gap-1 px-3 py-3"
          >
            <Icon as={Sparkles} size={20} className="text-muted-foreground" />
            <Text className="text-sm font-bold" numberOfLines={1}>
              Review
            </Text>
            <Text className="text-center text-xs text-muted-foreground" numberOfLines={1}>
              Ready
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

import {
  Flame,
  MessageCircle,
  Moon,
  Shuffle,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type {
  RecommendationKind,
  WeeklyReviewRecommendation,
} from './review-types';

const KIND_META: Record<RecommendationKind, { icon: LucideIcon; label: string }> = {
  deload: { icon: TrendingDown, label: 'Time to deload' },
  swap: { icon: Shuffle, label: 'Try a swap' },
  volume: { icon: TrendingUp, label: 'Room for more volume' },
  rest: { icon: Moon, label: 'Prioritize rest' },
  keep_going: { icon: Flame, label: 'Keep going' },
};

/** Short label for a recommendation kind ("deload" → "Time to deload"). */
export function recommendationKindLabel(kind: RecommendationKind): string {
  return (KIND_META[kind] ?? KIND_META.keep_going).label;
}

/** Kinds where chatting with the coach about a concrete change makes sense. */
const DISCUSSABLE_KINDS: readonly RecommendationKind[] = ['deload', 'swap', 'volume'];

interface RecommendationCardProps {
  recommendation: WeeklyReviewRecommendation;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const router = useRouter();
  // Runtime guard: the server may add kinds before the app updates.
  const meta = KIND_META[recommendation.kind] ?? KIND_META.keep_going;
  const showDiscuss = DISCUSSABLE_KINDS.includes(recommendation.kind);

  const handleDiscuss = useCallback(() => {
    // The review screen is a modal; `replace` lands on the chat tab the same
    // way the onboarding paywall does (see app/onboarding/paywall.tsx).
    router.replace('/(tabs)/chat');
  }, [router]);

  return (
    <View
      testID="review-recommendation-card"
      className="rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <View className="mb-2 flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <Icon as={meta.icon} size={18} className="text-primary" />
        </View>
        <Text className="flex-1 text-base font-semibold text-primary">
          {meta.label}
        </Text>
      </View>
      <Text className="text-base leading-6">{recommendation.text}</Text>
      {showDiscuss && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 self-start"
          onPress={handleDiscuss}
          accessibilityRole="button"
          accessibilityLabel="Discuss this recommendation with your coach"
          testID="review-discuss-coach-button"
        >
          <Icon as={MessageCircle} size={16} className="text-foreground" />
          <Text>Discuss with Coach</Text>
        </Button>
      )}
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Flame, Trophy } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { format } from 'date-fns';
import { Colors } from '@/constants/theme';
import type { StreakStats } from '@/lib/stats';

interface StreaksSectionProps {
  streaks: StreakStats;
}

export function StreaksSection({ streaks }: StreaksSectionProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const longestRange = streaks.longestStreakStart && streaks.longestStreakEnd
    ? `${format(new Date(streaks.longestStreakStart), 'MMM d')} – ${format(new Date(streaks.longestStreakEnd), 'MMM d, yyyy')}`
    : '';

  return (
    <View>
      <Text className="mb-3 text-sm font-medium uppercase text-muted-foreground">
        Streaks
      </Text>
      <View className="rounded-xl border border-border bg-card">
        {/* Current Streak */}
        <View className="flex-row items-center gap-3 p-4">
          <Flame size={24} color={iconColor} />
          <View className="flex-1">
            <Text className="text-lg font-bold">
              {streaks.currentStreak} {streaks.currentStreak === 1 ? 'day' : 'days'}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {streaks.currentStreak > 0 ? 'Current Streak' : 'No active streak'}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View className="mx-4 h-px bg-border" />

        {/* Longest Streak */}
        <View className="flex-row items-center gap-3 p-4">
          <Trophy size={24} color={iconColor} />
          <View className="flex-1">
            <Text className="text-lg font-bold">
              {streaks.longestStreak} {streaks.longestStreak === 1 ? 'day' : 'days'}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {longestRange ? `Longest Streak · ${longestRange}` : 'Longest Streak'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

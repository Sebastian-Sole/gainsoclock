import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  Calendar,
  CalendarDays,
  ChevronRight,
  Clock,
  Heart,
  Repeat,
  Star,
  Trophy,
} from 'lucide-react-native';

import { getAchievementIcon } from '@/components/achievements/achievement-card';
import { Icon } from '@/components/ui/icon';
import { useAchievements } from '@/hooks/use-achievements';
import type { MonthRecord, YearRecord, FavoriteStats } from '@/lib/stats';

interface RecordsSectionProps {
  bestMonth: MonthRecord | null;
  bestYear: YearRecord | null;
  favorites: FavoriteStats;
}

interface RecordRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}

/**
 * Entry point to the achievements trophy room: unlocked count plus the icons
 * of the 3 most recent unlocks, navigating to the /achievements modal.
 */
function AchievementsEntry() {
  const router = useRouter();
  const { all, unlocked } = useAchievements();

  const recentDefs = useMemo(() => {
    const newestFirst = [...unlocked.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1));
    return newestFirst
      .slice(0, 3)
      .flatMap(([key]) => all.filter((def) => def.key === key));
  }, [all, unlocked]);

  return (
    <Pressable
      onPress={() => router.push('/achievements')}
      accessibilityRole="button"
      accessibilityLabel={`Achievements, ${unlocked.size} of ${all.length} unlocked`}
      accessibilityHint="Opens your trophy room"
      testID="records-achievements-entry"
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
        <Icon as={Trophy} size={20} className="text-primary" />
      </View>
      <View className="flex-1">
        <Text className="font-semibold">Achievements</Text>
        <Text className="text-sm text-muted-foreground">
          {unlocked.size}/{all.length} unlocked
        </Text>
      </View>
      {recentDefs.length > 0 && (
        <View className="flex-row gap-1.5">
          {recentDefs.map((def) => (
            <View
              key={def.key}
              className="h-8 w-8 items-center justify-center rounded-full bg-primary/10"
            >
              <Icon as={getAchievementIcon(def.icon)} size={15} className="text-primary" />
            </View>
          ))}
        </View>
      )}
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

function RecordRow({ icon, label, value, subtitle }: RecordRowProps) {
  return (
    <View className="flex-row items-center gap-3 p-4">
      {icon}
      <View className="flex-1">
        <Text className="text-sm text-muted-foreground">{label}</Text>
        <Text className="font-semibold">{value}</Text>
        {subtitle && (
          <Text className="text-xs text-muted-foreground">{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

export function RecordsSection({ bestMonth, bestYear, favorites }: RecordsSectionProps) {
  const iconSize = 20;

  const rows: { key: string; icon: React.ReactNode; label: string; value: string; subtitle?: string }[] = [];

  if (bestMonth) {
    rows.push({
      key: 'best-month',
      icon: <Icon as={Calendar} size={iconSize} className="text-primary" />,
      label: 'Best Month',
      value: bestMonth.label,
      subtitle: `${bestMonth.workoutDays} workout days`,
    });
  }

  if (bestYear) {
    rows.push({
      key: 'best-year',
      icon: <Icon as={CalendarDays} size={iconSize} className="text-primary" />,
      label: 'Best Year',
      value: `${bestYear.year}`,
      subtitle: `${bestYear.workoutDays} workout days`,
    });
  }

  if (favorites.mostUsedExercise) {
    rows.push({
      key: 'most-used-exercise',
      icon: <Icon as={Star} size={iconSize} className="text-primary" />,
      label: 'Most Used Exercise',
      value: favorites.mostUsedExercise.name,
      subtitle: `${favorites.mostUsedExercise.count} sessions`,
    });
  }

  if (favorites.favoriteTemplate) {
    rows.push({
      key: 'favorite-template',
      icon: <Icon as={Heart} size={iconSize} className="text-primary" />,
      label: 'Favorite Workout',
      value: favorites.favoriteTemplate.name,
      subtitle: `${favorites.favoriteTemplate.count} times`,
    });
  }

  if (favorites.mostActiveWeekday) {
    rows.push({
      key: 'most-active-day',
      icon: <Icon as={Repeat} size={iconSize} className="text-primary" />,
      label: 'Most Active Day',
      value: favorites.mostActiveWeekday.day,
      subtitle: `${favorites.mostActiveWeekday.count} workouts`,
    });
  }

  if (favorites.mostActiveHour) {
    rows.push({
      key: 'most-active-hour',
      icon: <Icon as={Clock} size={iconSize} className="text-primary" />,
      label: 'Preferred Time',
      value: favorites.mostActiveHour.hour,
      subtitle: `${favorites.mostActiveHour.count} workouts`,
    });
  }

  return (
    <View className="gap-6">
      <AchievementsEntry />
      {rows.length > 0 && (
        <View>
          <Text className="mb-3 text-sm font-medium uppercase text-muted-foreground">
            Records
          </Text>
          <View className="rounded-xl border border-border bg-card">
            {rows.map((row, index) => (
              <View key={row.key}>
                {index > 0 && <View className="mx-4 h-px bg-border" />}
                <RecordRow
                  icon={row.icon}
                  label={row.label}
                  value={row.value}
                  subtitle={row.subtitle}
                />
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

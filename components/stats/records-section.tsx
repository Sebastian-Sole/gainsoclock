import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Calendar, CalendarDays, Star, Heart, Clock, Repeat } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

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
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#fb923c' : '#f97316';
  const iconSize = 20;

  const rows: { key: string; icon: React.ReactNode; label: string; value: string; subtitle?: string }[] = [];

  if (bestMonth) {
    rows.push({
      key: 'best-month',
      icon: <Calendar size={iconSize} color={iconColor} />,
      label: 'Best Month',
      value: bestMonth.label,
      subtitle: `${bestMonth.workoutDays} workout days`,
    });
  }

  if (bestYear) {
    rows.push({
      key: 'best-year',
      icon: <CalendarDays size={iconSize} color={iconColor} />,
      label: 'Best Year',
      value: `${bestYear.year}`,
      subtitle: `${bestYear.workoutDays} workout days`,
    });
  }

  if (favorites.mostUsedExercise) {
    rows.push({
      key: 'most-used-exercise',
      icon: <Star size={iconSize} color={iconColor} />,
      label: 'Most Used Exercise',
      value: favorites.mostUsedExercise.name,
      subtitle: `${favorites.mostUsedExercise.count} sessions`,
    });
  }

  if (favorites.favoriteTemplate) {
    rows.push({
      key: 'favorite-template',
      icon: <Heart size={iconSize} color={iconColor} />,
      label: 'Favorite Workout',
      value: favorites.favoriteTemplate.name,
      subtitle: `${favorites.favoriteTemplate.count} times`,
    });
  }

  if (favorites.mostActiveWeekday) {
    rows.push({
      key: 'most-active-day',
      icon: <Repeat size={iconSize} color={iconColor} />,
      label: 'Most Active Day',
      value: favorites.mostActiveWeekday.day,
      subtitle: `${favorites.mostActiveWeekday.count} workouts`,
    });
  }

  if (favorites.mostActiveHour) {
    rows.push({
      key: 'most-active-hour',
      icon: <Clock size={iconSize} color={iconColor} />,
      label: 'Preferred Time',
      value: favorites.mostActiveHour.hour,
      subtitle: `${favorites.mostActiveHour.count} workouts`,
    });
  }

  if (rows.length === 0) return null;

  return (
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
  );
}

import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChartNoAxesCombined } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { isToday, isSameMonth } from 'date-fns';

import { Colors } from '@/constants/theme';
import { useStats } from '@/hooks/use-stats';
import { useSettingsStore } from '@/stores/settings-store';
import { useHistoryStore } from '@/stores/history-store';
import { DateRangePicker } from '@/components/stats/date-range-picker';
import { OverviewTab } from '@/components/stats/overview-tab';
import { ExercisesTab } from '@/components/stats/exercises-tab';
import { RecordsTab } from '@/components/stats/records-tab';
import { HistoryTab } from '@/components/stats/history-tab';
import { SettingsHeaderButton } from '@/components/shared/settings-header-button';
import type { DateRangeFilter } from '@/lib/stats';

const DEFAULT_FILTER: DateRangeFilter = { preset: 'all', from: null, to: null };

export default function StatsScreen() {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const [dateFilter, setDateFilter] = useState<DateRangeFilter>(DEFAULT_FILTER);
  const [activeTab, setActiveTab] = useState('history');

  // History tab date state (lifted up so "Today" button can control it)
  const [historyMonth, setHistoryMonth] = useState(new Date());
  const [historySelectedDate, setHistorySelectedDate] = useState(new Date());

  const showTodayButton =
    activeTab === 'history' &&
    !(isToday(historySelectedDate) && isSameMonth(historyMonth, new Date()));

  const goToToday = useCallback(() => {
    const now = new Date();
    setHistoryMonth(now);
    setHistorySelectedDate(now);
  }, []);

  // Stabilize the filter object for useMemo dependency
  const stableFilter = useMemo(() => dateFilter, [dateFilter.preset, dateFilter.from?.getTime(), dateFilter.to?.getTime()]);

  const stats = useStats(stableFilter);
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const totalLogs = useHistoryStore((s) => s.logs.length);

  const isEmpty = totalLogs === 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Stats</Text>
        <SettingsHeaderButton />
      </View>

      {isEmpty ? (
        <View className="flex-1 items-center justify-center px-4">
          <View className="items-center rounded-xl border border-dashed border-border px-8 py-12">
            <ChartNoAxesCombined size={32} color={primaryColor} />
            <Text className="mt-3 text-center text-muted-foreground">
              Complete your first workout to see stats
            </Text>
          </View>
        </View>
      ) : (
        <View className="flex-1">
          {/* Inner tabs — above date picker */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1"
          >
            <View className="px-4 pb-3">
              <TabsList className="w-full">
                <TabsTrigger value="history" className="flex-1">
                  <Text>History</Text>
                </TabsTrigger>
                <TabsTrigger value="overview" className="flex-1">
                  <Text>Overview</Text>
                </TabsTrigger>
                <TabsTrigger value="exercises" className="flex-1">
                  <Text>Exercises</Text>
                </TabsTrigger>
                <TabsTrigger value="records" className="flex-1">
                  <Text>Records</Text>
                </TabsTrigger>
              </TabsList>
            </View>

            {/* Today button — below tabs, only on history tab */}
            {showTodayButton && (
              <View className="items-end px-4 pb-2">
                <Pressable onPress={goToToday} className="rounded-full px-3 py-1" style={{ backgroundColor: primaryColor }}>
                  <Text className="text-sm font-semibold text-white">Today</Text>
                </Pressable>
              </View>
            )}

            {/* Date range picker — below tabs, hidden on history tab */}
            {activeTab !== 'history' && (
              <View className="px-4 pb-3">
                <DateRangePicker value={dateFilter} onChange={setDateFilter} />
              </View>
            )}

            <TabsContent value="history" className="flex-1">
              <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
                <View className="pb-8">
                  <HistoryTab
                    currentMonth={historyMonth}
                    selectedDate={historySelectedDate}
                    onMonthChange={setHistoryMonth}
                    onSelectDate={setHistorySelectedDate}
                  />
                </View>
              </ScrollView>
            </TabsContent>

            <TabsContent value="overview" className="flex-1">
              <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
                <View className="pb-8">
                  <OverviewTab
                    stats={stats}
                    weightUnit={weightUnit}
                    distanceUnit={distanceUnit}
                  />
                </View>
              </ScrollView>
            </TabsContent>

            <TabsContent value="exercises" className="flex-1">
              <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
                <View className="pb-8">
                  <ExercisesTab
                    exerciseStats={stats.exerciseStats}
                    weightUnit={weightUnit}
                    distanceUnit={distanceUnit}
                  />
                </View>
              </ScrollView>
            </TabsContent>

            <TabsContent value="records" className="flex-1">
              <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
                <View className="pb-8">
                  <RecordsTab stats={stats} />
                </View>
              </ScrollView>
            </TabsContent>
          </Tabs>
        </View>
      )}
    </SafeAreaView>
  );
}

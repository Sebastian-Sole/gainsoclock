import { useRouter } from 'expo-router';
import { Share2, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { AchievementCard } from '@/components/achievements/achievement-card';
import {
  MonthlyRecapCard,
  RECAP_CARD_HEIGHT,
  RECAP_CARD_WIDTH,
  useMonthlyRecap,
} from '@/components/achievements/monthly-recap-card';
import { showToast } from '@/components/achievements/unlock-toast';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAchievements } from '@/hooks/use-achievements';

export default function AchievementsScreen() {
  const router = useRouter();
  const { groups } = useAchievements();
  const recap = useMonthlyRecap();

  const recapRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);

  const unlockedCount = groups.filter((g) => g.level >= 1).length;

  // Sort: started (newest level first) → locked-but-in-progress by % → the
  // rest. Catalog order breaks ties so the list is stable.
  const sorted = useMemo(() => {
    const entries = groups.map((group, index) => {
      const p = group.progress;
      const pct = p && p.target > 0 ? Math.min(p.current / p.target, 1) : 0;
      return { group, index, pct };
    });
    entries.sort((a, b) => {
      const aAt = a.group.unlockedAt;
      const bAt = b.group.unlockedAt;
      if (aAt !== null || bAt !== null) {
        if (aAt === null) return 1;
        if (bAt === null) return -1;
        if (aAt !== bAt) return aAt < bAt ? 1 : -1;
        return a.index - b.index;
      }
      if (a.pct !== b.pct) return b.pct - a.pct;
      return a.index - b.index;
    });
    return entries;
  }, [groups]);

  const handleShareMonth = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const uri = await captureRef(recapRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: RECAP_CARD_WIDTH * 3,
        height: RECAP_CARD_HEIGHT * 3,
      });
      await Share.share({ url: uri });
    } catch {
      showToast("Couldn't create your recap — try again.");
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} testID="achievements-screen">
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-3 pt-2">
        <View className="flex-1">
          <Text className="text-lg font-bold">Achievements</Text>
          <Text className="text-sm text-muted-foreground">
            {unlockedCount}/{groups.length} unlocked
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close achievements"
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full"
          testID="achievements-close-button"
        >
          <Icon as={X} size={22} className="text-foreground" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        <Button
          variant="outline"
          onPress={handleShareMonth}
          disabled={isSharing}
          accessibilityRole="button"
          accessibilityLabel="Share my month"
          accessibilityState={{ busy: isSharing, disabled: isSharing }}
          testID="achievements-share-month"
          className="mb-4"
        >
          {isSharing ? (
            <ActivityIndicator size="small" />
          ) : (
            <Icon as={Share2} size={16} className="text-foreground" />
          )}
          <Text>{isSharing ? 'Creating your recap…' : 'Share my month'}</Text>
        </Button>

        {/* 2-column grid */}
        <View className="flex-row flex-wrap justify-between pb-8">
          {sorted.map((entry) => (
            <AchievementCard
              key={entry.group.key}
              group={entry.group}
              className="mb-3 w-[48.5%]"
            />
          ))}
        </View>
      </ScrollView>

      {/* Offscreen recap artwork, kept mounted so captureRef has a laid-out
          native view to snapshot. Hidden from screen readers. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: -RECAP_CARD_WIDTH * 2, top: 0 }}
      >
        <MonthlyRecapCard ref={recapRef} data={recap} />
      </View>
    </SafeAreaView>
  );
}

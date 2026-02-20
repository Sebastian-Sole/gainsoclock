import React from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, Clock, Dumbbell, Target, Heart } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useHistoryStore } from '@/stores/history-store';
import { formatDuration, exerciseTypeLabel } from '@/lib/format';
import { useSettingsStore } from '@/stores/settings-store';

export default function WorkoutCompleteScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const primaryColor = isDark ? '#fb923c' : '#f97316';

  const logs = useHistoryStore((s) => s.logs);
  const lastLog = logs[0];
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);

  if (!lastLog) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">No workout data</Text>
        <Pressable onPress={() => router.dismissAll()} className="mt-4">
          <Text className="text-primary">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const totalSets = lastLog.exercises.reduce((t, e) => t + e.sets.length, 0);
  const completedSets = lastLog.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0
  );
  const totalVolume = lastLog.exercises.reduce((t, e) => {
    return t + e.sets.reduce((st, s) => {
      if (s.completed && s.type === 'reps_weight') {
        return st + s.reps * s.weight;
      }
      return st;
    }, 0);
  }, 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-8">
        {/* Success header */}
        <Animated.View entering={FadeInDown.delay(100)} className="mt-8 items-center">
          <CheckCircle size={64} color={primaryColor} />
          <Text className="mt-4 text-2xl font-bold">Workout Complete!</Text>
          <Text className="mt-1 text-muted-foreground">{lastLog.templateName}</Text>
          {Platform.OS === 'ios' && healthKitEnabled && (
            <View className="mt-2 flex-row items-center gap-1">
              <Heart size={14} color={primaryColor} />
              <Text className="text-sm text-muted-foreground">Synced to Apple Health</Text>
            </View>
          )}
        </Animated.View>

        {/* Stats grid */}
        <Animated.View entering={FadeInDown.delay(200)} className="mt-8 flex-row gap-3">
          <View className="flex-1 items-center rounded-xl bg-card p-4">
            <Clock size={24} color={primaryColor} />
            <Text className="mt-2 text-xl font-bold">{formatDuration(lastLog.durationSeconds)}</Text>
            <Text className="text-xs text-muted-foreground">Duration</Text>
          </View>
          <View className="flex-1 items-center rounded-xl bg-card p-4">
            <Dumbbell size={24} color={primaryColor} />
            <Text className="mt-2 text-xl font-bold">{lastLog.exercises.length}</Text>
            <Text className="text-xs text-muted-foreground">Exercises</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300)} className="mt-3 flex-row gap-3">
          <View className="flex-1 items-center rounded-xl bg-card p-4">
            <Target size={24} color={primaryColor} />
            <Text className="mt-2 text-xl font-bold">{completedSets}/{totalSets}</Text>
            <Text className="text-xs text-muted-foreground">Sets Done</Text>
          </View>
          <View className="flex-1 items-center rounded-xl bg-card p-4">
            <Dumbbell size={24} color={primaryColor} />
            <Text className="mt-2 text-xl font-bold">
              {totalVolume > 0 ? `${totalVolume.toLocaleString()} ${weightUnit}` : '--'}
            </Text>
            <Text className="text-xs text-muted-foreground">Total Volume</Text>
          </View>
        </Animated.View>

        {/* Exercise breakdown */}
        <Animated.View entering={FadeInDown.delay(400)} className="mt-8">
          <Text className="mb-3 text-sm font-medium text-muted-foreground">EXERCISE BREAKDOWN</Text>
          <View className="gap-2">
            {lastLog.exercises.map((exercise) => {
              const done = exercise.sets.filter((s) => s.completed).length;
              return (
                <View key={exercise.id} className="flex-row items-center justify-between rounded-xl bg-card px-4 py-3">
                  <View className="flex-1">
                    <Text className="font-medium">{exercise.name}</Text>
                    <Text className="text-xs text-muted-foreground">{exerciseTypeLabel(exercise.type)}</Text>
                  </View>
                  <Text className="text-sm text-muted-foreground">
                    {done}/{exercise.sets.length} sets
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      {/* Done button */}
      <View className="px-6 pb-4">
        <Pressable
          onPress={() => router.dismissAll()}
          className="items-center rounded-xl bg-primary py-4"
        >
          <Text className="font-semibold text-primary-foreground">Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

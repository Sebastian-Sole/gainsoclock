import React, { useState, useCallback } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Trash2, Pause, Play } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useWorkoutStore } from '@/stores/workout-store';
import { useTemplateStore } from '@/stores/template-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Colors } from '@/constants/theme';
import { PlanCalendar } from '@/components/chat/plan-calendar';
import { PlanDayDetail } from '@/components/chat/plan-day-detail';
import { cn } from '@/lib/utils';
import { getPlanDayDate, isToday, formatPlanDate } from '@/lib/plan-dates';

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const planData = useQuery(api.plans.getPlanWithDays, { clientId: id });
  const deletePlan = useMutation(api.plans.deletePlan);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const getTemplate = useTemplateStore((s) => s.getTemplate);
  const weekStartDay = useSettingsStore((s) => s.weekStartDay);

  const [selectedDay, setSelectedDay] = useState<{
    week: number;
    dayOfWeek: number;
  } | null>(null);

  const selectedDayData = selectedDay
    ? planData?.days.find(
        (d) => d.week === selectedDay.week && d.dayOfWeek === selectedDay.dayOfWeek
      )
    : null;

  const handleDayPress = useCallback((week: number, dayOfWeek: number) => {
    setSelectedDay({ week, dayOfWeek });
  }, []);

  const handleStartWorkout = useCallback(() => {
    if (!selectedDayData?.templateClientId || !planData) return;

    const template = getTemplate(selectedDayData.templateClientId);
    if (!template) {
      Alert.alert('Error', 'Workout template not found');
      return;
    }

    const planDayId = `${planData.clientId}:${selectedDayData.week}:${selectedDayData.dayOfWeek}`;

    const doStart = () => {
      startWorkout(template.name, template.exercises, template.id, planDayId);
      setSelectedDay(null);
      router.push('/workout/active');
    };

    // Check if this is today's workout
    const dayDate = getPlanDayDate(
      planData.startDate, selectedDayData.week, selectedDayData.dayOfWeek, weekStartDay
    );
    if (!isToday(dayDate)) {
      Alert.alert(
        'Wrong Day',
        `This workout is scheduled for ${formatPlanDate(dayDate)}. Start anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Start Anyway', onPress: doStart },
        ]
      );
      return;
    }

    doStart();
  }, [selectedDayData, planData, getTemplate, startWorkout, router, weekStartDay]);

  const handleDelete = () => {
    Alert.alert('Delete Plan', 'This will permanently delete this plan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePlan({ clientId: id });
          router.back();
        },
      },
    ]);
  };

  const handleToggleStatus = () => {
    if (!planData) return;
    const newStatus = planData.status === 'active' ? 'paused' : 'active';
    updatePlanStatus({ clientId: id, status: newStatus });
  };

  if (!planData) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground">Loading plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const completedDays = planData.days.filter((d) => d.status === 'completed').length;
  const workoutDays = planData.days.filter((d) => d.status !== 'rest').length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} className="p-1">
          <ChevronLeft
            size={24}
            color={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-bold" numberOfLines={1}>
            {planData.name}
          </Text>
        </View>
        <Pressable onPress={handleToggleStatus} className="p-2">
          {planData.status === 'active' ? (
            <Pause size={20} color="#9ca3af" />
          ) : (
            <Play size={20} color="#22c55e" />
          )}
        </Pressable>
        <Pressable onPress={handleDelete} className="p-2">
          <Trash2 size={20} color="#ef4444" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Plan info */}
        <View className="mb-4">
          {planData.goal && (
            <Text className="text-sm text-muted-foreground mb-1">
              Goal: {planData.goal}
            </Text>
          )}
          <Text className="text-sm text-muted-foreground mb-1">
            {planData.description}
          </Text>
          <View className="flex-row gap-4 mt-2">
            <View className="rounded-lg bg-card border border-border px-3 py-2">
              <Text className="text-lg font-bold">{planData.durationWeeks}</Text>
              <Text className="text-xs text-muted-foreground">weeks</Text>
            </View>
            <View className="rounded-lg bg-card border border-border px-3 py-2">
              <Text className="text-lg font-bold">{completedDays}/{workoutDays}</Text>
              <Text className="text-xs text-muted-foreground">completed</Text>
            </View>
            <View
              className={cn(
                'rounded-lg px-3 py-2',
                planData.status === 'active'
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-muted border border-border'
              )}
            >
              <Text className={cn(
                'text-lg font-bold capitalize',
                planData.status === 'active' ? 'text-green-500' : 'text-muted-foreground'
              )}>
                {planData.status}
              </Text>
              <Text className="text-xs text-muted-foreground">status</Text>
            </View>
          </View>
        </View>

        {/* Calendar grid */}
        <PlanCalendar
          durationWeeks={planData.durationWeeks}
          days={planData.days}
          startDate={planData.startDate}
          onDayPress={handleDayPress}
        />

        <View className="h-8" />
      </ScrollView>

      {/* Day detail modal */}
      {selectedDay && selectedDayData && (
        <PlanDayDetail
          visible={true}
          onClose={() => setSelectedDay(null)}
          onStartWorkout={handleStartWorkout}
          week={selectedDay.week}
          dayOfWeek={selectedDay.dayOfWeek}
          label={selectedDayData.label}
          notes={selectedDayData.notes}
          templateClientId={selectedDayData.templateClientId}
          status={selectedDayData.status}
          date={
            planData.startDate
              ? getPlanDayDate(planData.startDate, selectedDay.week, selectedDay.dayOfWeek, weekStartDay)
              : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}

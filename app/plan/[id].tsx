import React, { useState, useCallback } from 'react';
import { View, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Trash2, Pause, Play, Pencil, Plus, Minus, ArrowRightLeft, Check } from 'lucide-react-native';
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
import { lightHaptic, mediumHaptic, heavyHaptic } from '@/lib/haptics';

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;

  const planData = useQuery(api.plans.getPlanWithDays, { clientId: id });
  const deletePlan = useMutation(api.plans.deletePlan);
  const updatePlanStatus = useMutation(api.plans.updatePlanStatus);
  const updatePlanName = useMutation(api.plans.updatePlanName);
  const swapPlanDaysMut = useMutation(api.plans.swapPlanDays);
  const addPlanWeek = useMutation(api.plans.addPlanWeek);
  const removePlanWeek = useMutation(api.plans.removePlanWeek);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const getTemplate = useTemplateStore((s) => s.getTemplate);
  const weekStartDay = useSettingsStore((s) => s.weekStartDay);

  const [selectedDay, setSelectedDay] = useState<{
    week: number;
    dayOfWeek: number;
  } | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // swapMode: true = waiting for first tap, swapSource: specific day selected
  const [swapMode, setSwapMode] = useState(false);
  const [deleteWeekMode, setDeleteWeekMode] = useState(false);
  const [swapSource, setSwapSource] = useState<{
    week: number;
    dayOfWeek: number;
  } | null>(null);

  const selectedDayData = selectedDay
    ? planData?.days.find(
        (d) => d.week === selectedDay.week && d.dayOfWeek === selectedDay.dayOfWeek
      )
    : null;

  const handleSaveName = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== planData?.name) {
      updatePlanName({ clientId: id, name: trimmed });
      lightHaptic();
    }
    setIsEditingName(false);
  }, [editName, planData?.name, id, updatePlanName]);

  const handleDayPress = useCallback((week: number, dayOfWeek: number) => {
    if (swapMode && !swapSource) {
      // First tap in swap mode — pick source
      lightHaptic();
      setSwapSource({ week, dayOfWeek });
    } else if (swapSource) {
      // Second tap — pick target and execute swap
      if (swapSource.week === week && swapSource.dayOfWeek === dayOfWeek) {
        setSwapSource(null);
        return;
      }
      swapPlanDaysMut({
        planClientId: id,
        dayA: swapSource,
        dayB: { week, dayOfWeek },
      });
      mediumHaptic();
      setSwapSource(null);
    } else {
      setSelectedDay({ week, dayOfWeek });
    }
  }, [swapMode, swapSource, id, swapPlanDaysMut]);

  const handleDayLongPress = useCallback((week: number, dayOfWeek: number) => {
    heavyHaptic();
    setSwapMode(true);
    setSwapSource({ week, dayOfWeek });
  }, []);

  const handleMoveDay = useCallback((week: number, dayOfWeek: number) => {
    setSelectedDay(null);
    setSwapMode(true);
    setSwapSource({ week, dayOfWeek });
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

  const handleAddWeek = () => {
    addPlanWeek({ clientId: id });
    lightHaptic();
  };

  const handleRemoveWeek = useCallback((weekNum?: number) => {
    if (!planData || planData.durationWeeks <= 1) return;
    const targetWeek = weekNum ?? planData.durationWeeks;
    const weekDays = planData.days.filter((d) => d.week === targetWeek);
    const hasCompleted = weekDays.some((d) => d.status === 'completed');

    Alert.alert(
      'Remove Week',
      hasCompleted
        ? `Week ${targetWeek} has completed workouts. Removing it will lose that data.`
        : `Remove week ${targetWeek}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: hasCompleted ? 'Remove Anyway' : 'Remove',
          style: 'destructive',
          onPress: () => {
            removePlanWeek({ clientId: id, week: targetWeek });
            setDeleteWeekMode(false);
            lightHaptic();
          },
        },
      ]
    );
  }, [planData, id, removePlanWeek]);

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
      <View className="flex-row items-center px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} className="p-1 mr-2">
          <ChevronLeft
            size={24}
            color={colorScheme === 'dark' ? '#fff' : '#000'}
          />
        </Pressable>
        {isEditingName ? (
          <View className="flex-1 flex-row items-center">
            <TextInput
              value={editName}
              onChangeText={setEditName}
              onSubmitEditing={handleSaveName}
              autoFocus
              selectTextOnFocus
              className="flex-1 text-lg font-bold leading-tight rounded-lg border border-input bg-card px-2 py-1.5 text-foreground"
              textAlignVertical="center"
            />
            <Pressable onPress={handleSaveName} className="p-2 ml-1">
              <Check size={20} color={primaryColor} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
              {planData.name}
            </Text>
            <Pressable
              onPress={() => {
                setEditName(planData.name);
                setIsEditingName(true);
              }}
              className="p-2"
            >
              <Pencil size={16} color="#9ca3af" />
            </Pressable>
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
          </>
        )}
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

        {/* Swap days button / swap mode indicator (always present, no layout shift) */}
        <Pressable
          onPress={() => {
            if (swapMode) {
              setSwapMode(false);
              setSwapSource(null);
            } else {
              lightHaptic();
              setSwapMode(true);
            }
          }}
          className={cn(
            'flex-row items-center justify-between rounded-xl px-4 py-3 mb-3',
            swapMode
              ? 'bg-primary/10 border border-primary/20'
              : 'bg-card border border-border'
          )}
        >
          <View className="flex-row items-center gap-2">
            <ArrowRightLeft size={16} color={swapMode ? primaryColor : (colorScheme === 'dark' ? '#9ca3af' : '#6b7280')} />
            <Text className={cn(
              'text-sm font-medium',
              swapMode ? 'text-primary' : 'text-muted-foreground'
            )}>
              {swapMode
                ? (swapSource ? 'Now tap the day to swap with' : 'Tap a day to swap')
                : 'Swap Days'}
            </Text>
          </View>
          {swapMode && (
            <Text className="text-sm font-medium text-muted-foreground">Done</Text>
          )}
        </Pressable>

        {/* Calendar grid */}
        <PlanCalendar
          durationWeeks={planData.durationWeeks}
          days={planData.days}
          startDate={planData.startDate}
          onDayPress={handleDayPress}
          onDayLongPress={handleDayLongPress}
          onWeekPress={deleteWeekMode ? handleRemoveWeek : undefined}
          swapSource={swapSource}
          swapMode={swapMode}
          deleteWeekMode={deleteWeekMode}
        />

        {/* Add / Remove week buttons */}
        <View className="flex-row gap-3 mt-4">
          <Pressable
            onPress={handleAddWeek}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-accent py-3"
          >
            <Plus size={16} color={primaryColor} />
            <Text className="text-sm font-medium text-primary">Add Week</Text>
          </Pressable>

          {planData.durationWeeks > 1 && (
            <Pressable
              onPress={() => {
                if (deleteWeekMode) {
                  setDeleteWeekMode(false);
                } else {
                  lightHaptic();
                  setDeleteWeekMode(true);
                }
              }}
              className={cn(
                'flex-1 flex-row items-center justify-center gap-2 rounded-xl border py-3',
                deleteWeekMode
                  ? 'border-destructive/30 bg-destructive/10'
                  : 'border-dashed border-destructive/50 bg-accent'
              )}
            >
              <Minus size={16} color="#ef4444" />
              <Text className="text-sm font-medium text-destructive">
                {deleteWeekMode ? 'Tap a week' : 'Remove Week'}
              </Text>
            </Pressable>
          )}
        </View>

        <View className="h-8" />
      </ScrollView>

      {/* Day detail modal */}
      {selectedDay && selectedDayData && (
        <PlanDayDetail
          visible={true}
          onClose={() => setSelectedDay(null)}
          onStartWorkout={handleStartWorkout}
          onMoveDay={handleMoveDay}
          planClientId={planData.clientId}
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

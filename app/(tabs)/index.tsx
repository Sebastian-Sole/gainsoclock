import React, { useState, useMemo } from 'react';
import { View, FlatList, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play, Calendar } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useSettingsStore } from '@/stores/settings-store';
import { getPlanDayDate, isToday } from '@/lib/plan-dates';
import { Colors } from '@/constants/theme';

import { TemplateCard } from '@/components/workout/template-card';
import { EmptyState } from '@/components/workout/empty-state';
import { Fab } from '@/components/shared/fab';
import { PlansList } from '@/components/chat/plans-list';
import { useTemplateStore } from '@/stores/template-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { mediumHaptic, heavyHaptic } from '@/lib/haptics';

export default function WorkoutsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('templates');

  const templates = useTemplateStore((s) => s.templates);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const duplicateTemplate = useTemplateStore((s) => s.duplicateTemplate);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const startEmptyWorkout = useWorkoutStore((s) => s.startEmptyWorkout);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);

  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const weekStartDay = useSettingsStore((s) => s.weekStartDay);
  const plans = useQuery(api.plans.listPlans);
  const activePlan = plans?.find((p) => p.status === 'active');
  const activePlanData = useQuery(
    api.plans.getPlanWithDays,
    activePlan ? { clientId: activePlan.clientId } : "skip"
  );

  const todayPlanDay = useMemo(() => {
    if (!activePlanData?.days || !activePlanData.startDate) return null;
    for (const day of activePlanData.days) {
      if (day.status !== 'pending' || !day.templateClientId) continue;
      const date = getPlanDayDate(activePlanData.startDate, day.week, day.dayOfWeek, weekStartDay);
      if (isToday(date)) return day;
    }
    return null;
  }, [activePlanData, weekStartDay]);

  const handleStartFromTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    if (activeWorkout) {
      Alert.alert(
        'Workout in Progress',
        'You already have an active workout. Would you like to discard it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard & Start New',
            style: 'destructive',
            onPress: () => {
              startWorkout(template.name, template.exercises, template.id);
              mediumHaptic();
              router.push('/workout/active');
            },
          },
        ]
      );
      return;
    }

    startWorkout(template.name, template.exercises, template.id);
    mediumHaptic();
    router.push('/workout/active');
  };

  const handleStartEmpty = () => {
    if (activeWorkout) {
      Alert.alert(
        'Workout in Progress',
        'You already have an active workout. Would you like to discard it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard & Start New',
            style: 'destructive',
            onPress: () => {
              startEmptyWorkout();
              mediumHaptic();
              router.push('/workout/active');
            },
          },
        ]
      );
      return;
    }

    startEmptyWorkout();
    mediumHaptic();
    router.push('/workout/active');
  };

  const handleStartFromPlan = () => {
    if (!todayPlanDay?.templateClientId || !activePlanData) return;
    const template = templates.find((t) => t.id === todayPlanDay.templateClientId);
    if (!template) return;

    const planDayId = `${activePlanData.clientId}:${todayPlanDay.week}:${todayPlanDay.dayOfWeek}`;

    if (activeWorkout) {
      Alert.alert(
        'Workout in Progress',
        'You already have an active workout. Would you like to discard it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard & Start New',
            style: 'destructive',
            onPress: () => {
              startWorkout(template.name, template.exercises, template.id, planDayId);
              mediumHaptic();
              router.push('/workout/active');
            },
          },
        ]
      );
      return;
    }

    startWorkout(template.name, template.exercises, template.id, planDayId);
    mediumHaptic();
    router.push('/workout/active');
  };

  const handleContextMenu = (templateId: string) => {
    heavyHaptic();
    Alert.alert('Template Actions', '', [
      {
        text: 'Edit',
        onPress: () => router.push(`/template/${templateId}`),
      },
      {
        text: 'Duplicate',
        onPress: () => duplicateTemplate(templateId),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Template', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => deleteTemplate(templateId),
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Workouts</Text>
      </View>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1"
      >
        <View className="px-4 pb-3">
          <TabsList className="w-full">
            <TabsTrigger value="templates" className="flex-1">
              <Text>Templates</Text>
            </TabsTrigger>
            <TabsTrigger value="plans" className="flex-1">
              <Text>Plans</Text>
            </TabsTrigger>
          </TabsList>
        </View>

        <TabsContent value="templates" className="flex-1">
          {/* Today's Workout */}
          {todayPlanDay && (
            <Pressable
              onPress={handleStartFromPlan}
              className="mx-4 mb-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
            >
              <View className="flex-row items-center gap-2 mb-1">
                <Calendar size={16} color={primaryColor} />
                <Text className="text-sm font-semibold text-primary">Today's Workout</Text>
              </View>
              <Text className="text-base font-bold">{todayPlanDay.label}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                Week {todayPlanDay.week} · {activePlanData?.name}
              </Text>
            </Pressable>
          )}

          {/* Start Empty Workout */}
          <Pressable
            onPress={handleStartEmpty}
            className="mx-4 mb-4 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
          >
            <Play size={18} color="white" fill="white" />
            <Text className="font-semibold text-primary-foreground">Start Empty Workout</Text>
          </Pressable>

          {templates.length === 0 ? (
            <EmptyState
              title="No Templates Yet"
              description="Create your first workout template to get started. Templates let you save and reuse your favorite workouts."
            />
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(item) => item.id}
              contentContainerClassName="px-4 pb-24"
              renderItem={({ item, index }) => (
                <TemplateCard
                  template={item}
                  index={index}
                  onPress={() => router.push(`/template/${item.id}`)}
                  onStart={() => handleStartFromTemplate(item.id)}
                  onLongPress={() => handleContextMenu(item.id)}
                />
              )}
            />
          )}

          <Fab onPress={() => router.push('/template/create')} />
        </TabsContent>

        <TabsContent value="plans" className="flex-1">
          <PlansList />
        </TabsContent>
      </Tabs>
    </SafeAreaView>
  );
}

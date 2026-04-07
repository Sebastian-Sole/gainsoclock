import { Icon } from '@/components/ui/icon';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';

import { getPlanDayDate, isToday } from '@/lib/plan-dates';
import { usePlanStore } from '@/stores/plan-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useRouter } from 'expo-router';
import { Calendar, Play, ChevronRight } from 'lucide-react-native';

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlansList } from '@/components/chat/plans-list';
import { Fab } from '@/components/shared/fab';
import { SettingsHeaderButton } from '@/components/shared/settings-header-button';
import { EmptyState } from '@/components/workout/empty-state';
import { TemplateCard } from '@/components/workout/template-card';
import { useOnboardingTarget } from '@/hooks/use-onboarding-target';
import { heavyHaptic, mediumHaptic } from '@/lib/haptics';
import { useHistoryStore } from '@/stores/history-store';
import { useTemplateStore } from '@/stores/template-store';
import { useWorkoutStore } from '@/stores/workout-store';

export default function WorkoutsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('templates');

  const fabRef = useOnboardingTarget('fab-create-template');
  const startBtnRef = useOnboardingTarget('btn-start-empty');

  const templates = useTemplateStore((s) => s.templates);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const duplicateTemplate = useTemplateStore((s) => s.duplicateTemplate);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const startEmptyWorkout = useWorkoutStore((s) => s.startEmptyWorkout);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const getLastLogForTemplate = useHistoryStore((s) => s.getLastLogForTemplate);
  const prefillFromLastWorkout = useSettingsStore((s) => s.prefillFromLastWorkout);

  const weekStartDay = useSettingsStore((s) => s.weekStartDay);
  const activePlanData = usePlanStore((s) => s.activePlanWithDays);

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

    const previousLog = prefillFromLastWorkout ? getLastLogForTemplate(templateId) : undefined;

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
              startWorkout(template.name, template.exercises, template.id, undefined, previousLog);
              mediumHaptic();
              router.push('/workout/active');
            },
          },
        ]
      );
      return;
    }

    startWorkout(template.name, template.exercises, template.id, undefined, previousLog);
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

    const planDayId = `${activePlanData.id}:${todayPlanDay.week}:${todayPlanDay.dayOfWeek}`;
    const previousLog = prefillFromLastWorkout ? getLastLogForTemplate(template.id) : undefined;

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
              startWorkout(template.name, template.exercises, template.id, planDayId, previousLog);
              mediumHaptic();
              router.push('/workout/active');
            },
          },
        ]
      );
      return;
    }

    startWorkout(template.name, template.exercises, template.id, planDayId, previousLog);
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

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-3xl font-bold">Workouts</Text>
        <SettingsHeaderButton />
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
          {/* Resume Active Workout */}
          {activeWorkout && (
            <Pressable
              onPress={() => router.push('/workout/active')}
              className="mx-4 mb-3 flex-row items-center justify-between rounded-xl border border-green-500/30 bg-green-500/10 p-4"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-green-600 dark:text-green-400">Workout in Progress</Text>
                <Text className="text-base font-bold" numberOfLines={1}>{activeWorkout.templateName}</Text>
                <Text className="text-xs text-muted-foreground">
                  {activeWorkout.exercises.length} exercise{activeWorkout.exercises.length !== 1 ? 's' : ''} ·{' '}
                  {activeWorkout.exercises.reduce((t, e) => t + e.sets.filter((s) => s.completed).length, 0)}/
                  {activeWorkout.exercises.reduce((t, e) => t + e.sets.length, 0)} sets done
                </Text>
              </View>
              <Icon as={ChevronRight} size={20} className="text-green-600 dark:text-green-400" />
            </Pressable>
          )}

          {/* Today's Workout */}
          {todayPlanDay && (
            <Pressable
              onPress={handleStartFromPlan}
              className="mx-4 mb-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
            >
              <View className="flex-row items-center gap-2 mb-1">
                <Icon as={Calendar} size={16} className="text-primary" />
                <Text className="text-sm font-semibold text-primary">Today&apos;s Workout</Text>
              </View>
              <Text className="text-base font-bold">{todayPlanDay.label}</Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                Week {todayPlanDay.week} · {activePlanData?.name}
              </Text>
            </Pressable>
          )}

          {/* Start Empty Workout */}
          <Pressable
            ref={startBtnRef}
            collapsable={false}
            onPress={handleStartEmpty}
            className="mx-4 mb-4 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
          >
            <Icon as={Play} size={18} className="text-primary-foreground fill-primary-foreground" />
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

          <View
            ref={fabRef}
            collapsable={false}
            className="absolute bottom-6 right-6 h-14 w-14"
          >
            <Fab onPress={() => router.push('/template/create')} className="relative bottom-0 right-0" />
          </View>
        </TabsContent>

        <TabsContent value="plans" className="flex-1">
          <PlansList />
        </TabsContent>
      </Tabs>
    </View>
  );
}

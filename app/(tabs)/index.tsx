import React from 'react';
import { View, FlatList, Pressable, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play } from 'lucide-react-native';

import { TemplateCard } from '@/components/workout/template-card';
import { EmptyState } from '@/components/workout/empty-state';
import { Fab } from '@/components/shared/fab';
import { useTemplateStore } from '@/stores/template-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { mediumHaptic, heavyHaptic } from '@/lib/haptics';

export default function WorkoutsScreen() {
  const router = useRouter();

  const templates = useTemplateStore((s) => s.templates);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const duplicateTemplate = useTemplateStore((s) => s.duplicateTemplate);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  const startEmptyWorkout = useWorkoutStore((s) => s.startEmptyWorkout);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);

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
    </SafeAreaView>
  );
}

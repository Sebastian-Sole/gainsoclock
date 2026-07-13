import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Archive, ArchiveRestore, ChevronLeft } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { exerciseTypeLabel } from '@/lib/format';
import { lightHaptic } from '@/lib/haptics';
import type { ExerciseDefinition } from '@/lib/types';
import { useExerciseLibraryStore } from '@/stores/exercise-library-store';
import { useHistoryStore } from '@/stores/history-store';

/**
 * Exercise library: browse every exercise the user has, independent of
 * stats. Exercises are archived (soft-deleted), never hard-deleted, so
 * templates, plans, workout history, and stats that reference them keep
 * working; archived exercises are just hidden from pickers and can be
 * restored from the Archived section below the list.
 */
export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const exercises = useExerciseLibraryStore((s) => s.exercises);
  const archiveExercise = useExerciseLibraryStore((s) => s.archiveExercise);
  const unarchiveExercise = useExerciseLibraryStore((s) => s.unarchiveExercise);
  const logs = useHistoryStore((s) => s.logs);
  const [search, setSearch] = useState('');

  // Distinct logged sessions per exercise, for row context.
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (!log.exercises) continue;
      const seen = new Set<string>();
      for (const e of log.exercises) {
        if (seen.has(e.exerciseId)) continue;
        seen.add(e.exerciseId);
        counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
      }
    }
    return counts;
  }, [logs]);

  const { active, archived } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (e: ExerciseDefinition) =>
      !q || e.name.toLowerCase().includes(q);
    const byName = (a: ExerciseDefinition, b: ExerciseDefinition) =>
      a.name.localeCompare(b.name);
    return {
      active: exercises
        .filter((e) => e.archivedAt === undefined && matches(e))
        .sort(byName),
      archived: exercises
        .filter((e) => e.archivedAt !== undefined && matches(e))
        .sort(byName),
    };
  }, [exercises, search]);

  const confirmArchive = (exercise: ExerciseDefinition) => {
    lightHaptic();
    Alert.alert(
      `Archive "${exercise.name}"?`,
      'It will be hidden from exercise pickers. Templates, plans, history, and stats that use it keep working, and you can restore it here anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            archiveExercise(exercise.id);
            lightHaptic();
          },
        },
      ]
    );
  };

  const handleRestore = (exercise: ExerciseDefinition) => {
    unarchiveExercise(exercise.id);
    lightHaptic();
  };

  const hasAnyExercises = exercises.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" testID="exercise-library-screen">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="exercise-library-back"
        >
          <Icon as={ChevronLeft} size={24} className="text-foreground" />
        </Pressable>
        <Text className="text-base font-semibold">Exercise Library</Text>
        <View className="w-10" />
      </View>

      {hasAnyExercises ? (
        <FlatList
          data={active}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pb-12"
          testID="exercise-library-list"
          ListHeaderComponent={
            <View className="gap-3 pb-2">
              <Input
                size="sm"
                value={search}
                onChangeText={setSearch}
                placeholder="Search exercises..."
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search exercises"
                testID="exercise-library-search"
              />
              <Text className="text-xs text-muted-foreground">
                {active.length} {active.length === 1 ? 'exercise' : 'exercises'}
                {archived.length > 0 ? ` · ${archived.length} archived` : ''}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <LibraryRow
              exercise={item}
              sessionCount={sessionCounts.get(item.id) ?? 0}
              mode="archive"
              onAction={() => confirmArchive(item)}
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-8">
              <Text className="text-muted-foreground">
                {search.trim() ? 'No matching exercises' : 'No active exercises'}
              </Text>
            </View>
          }
          ListFooterComponent={
            archived.length > 0 ? (
              <View className="mt-6 gap-2">
                <Text
                  className="text-xs font-medium uppercase text-muted-foreground"
                  accessibilityRole="header"
                >
                  Archived
                </Text>
                {archived.map((item) => (
                  <LibraryRow
                    key={item.id}
                    exercise={item}
                    sessionCount={sessionCounts.get(item.id) ?? 0}
                    mode="restore"
                    onAction={() => handleRestore(item)}
                  />
                ))}
              </View>
            ) : null
          }
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-1 px-8">
          <Text className="font-medium">No exercises yet</Text>
          <Text className="text-center text-sm text-muted-foreground">
            Exercises you add while building templates or logging workouts show
            up here.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function LibraryRow({
  exercise,
  sessionCount,
  mode,
  onAction,
}: {
  exercise: ExerciseDefinition;
  sessionCount: number;
  /** archive = active row (archive action), restore = archived row. */
  mode: 'archive' | 'restore';
  onAction: () => void;
}) {
  const sessions = `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`;
  const actionLabel =
    mode === 'archive'
      ? `Archive ${exercise.name}`
      : `Restore ${exercise.name}`;

  return (
    <View
      className="mb-1 flex-row items-center justify-between rounded-xl border border-border bg-card py-1 pl-4 pr-1"
      accessible
      accessibilityLabel={`${exercise.name}, ${exerciseTypeLabel(exercise.type, exercise.metrics)}, ${sessions}${mode === 'restore' ? ', archived' : ''}`}
      accessibilityActions={[
        mode === 'archive'
          ? { name: 'archive', label: 'Archive exercise' }
          : { name: 'restore', label: 'Restore exercise' },
      ]}
      onAccessibilityAction={(e) => {
        if (
          e.nativeEvent.actionName === 'archive' ||
          e.nativeEvent.actionName === 'restore'
        ) {
          onAction();
        }
      }}
      testID={`exercise-library-row-${exercise.id}`}
    >
      <View className="flex-1 py-2">
        <Text className={mode === 'restore' ? 'font-medium text-muted-foreground' : 'font-medium'}>
          {exercise.name}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {exerciseTypeLabel(exercise.type, exercise.metrics)} · {sessions}
        </Text>
      </View>
      <Pressable
        onPress={onAction}
        className="h-11 w-11 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={4}
        testID={
          mode === 'archive'
            ? `exercise-archive-${exercise.id}`
            : `exercise-restore-${exercise.id}`
        }
      >
        <Icon
          as={mode === 'archive' ? Archive : ArchiveRestore}
          size={20}
          className="text-muted-foreground"
        />
      </Pressable>
    </View>
  );
}

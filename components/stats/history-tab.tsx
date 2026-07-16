import { Text } from '@/components/ui/text';
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, FileText, Link2, Plus, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, View } from 'react-native';

import { Calendar } from '@/components/history/calendar';
import {
  ExternalWorkoutCard,
  type MergeCandidate,
} from '@/components/history/external-workout-card';
import {
  MergeReviewModal,
  type MergeReviewItem,
} from '@/components/history/merge-review-modal';
import { Icon } from '@/components/ui/icon';
import { WorkoutLogCard } from '@/components/history/workout-log-card';
import { Colors } from '@/constants/theme';
import { useExternalWorkouts, type ExternalWorkout } from '@/hooks/use-external-workouts';
import { computeMergeSuggestions } from '@/lib/merge-suggestions';
import type { WorkoutLog } from '@/lib/types';
import { useHistoryStore } from '@/stores/history-store';
import { useTemplateStore } from '@/stores/template-store';

interface HistoryTabProps {
  currentMonth: Date;
  selectedDate: Date;
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: Date) => void;
}

/** One row in the selected day's timeline — a Fitbull log or an imported workout. */
type DayEntry =
  | { kind: 'log'; startedAt: number; log: WorkoutLog }
  | { kind: 'external'; startedAt: number; workout: ExternalWorkout };

/**
 * An external workout linked to a native log (issue #117) renders merged into
 * that log's card instead of as a standalone entry. The link only collapses
 * the pair when the target log is actually loaded — if the log is missing
 * (deleted elsewhere, outside the fetched range), the external still shows.
 */
function isMergedExternal(w: ExternalWorkout, logIds: Set<string>): boolean {
  return w.linkedWorkoutLogClientId !== undefined && logIds.has(w.linkedWorkoutLogClientId);
}

export function HistoryTab({ currentMonth, selectedDate, onMonthChange, onSelectDate }: HistoryTabProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const router = useRouter();

  const logs = useHistoryStore((s) => s.logs);
  const extendRange = useHistoryStore((s) => s.extendRange);
  const fetchedRangeFrom = useHistoryStore((s) => s.fetchedRangeFrom);
  const templates = useTemplateStore((s) => s.templates);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // [] while loading / signed out / import off — never blocks local history.
  const externalWorkouts = useExternalWorkouts(currentMonth);

  const logIds = useMemo(() => new Set(logs.map((l) => l.id)), [logs]);

  const linkedExternalByLogId = useMemo(() => {
    const map = new Map<string, ExternalWorkout>();
    externalWorkouts.forEach((w) => {
      if (
        w.linkedWorkoutLogClientId !== undefined &&
        logIds.has(w.linkedWorkoutLogClientId) &&
        !map.has(w.linkedWorkoutLogClientId)
      ) {
        map.set(w.linkedWorkoutLogClientId, w);
      }
    });
    return map;
  }, [externalWorkouts, logIds]);

  // Merge suggestions for imported workouts whose (often synthetic) timestamps
  // couldn't auto-link (#117). Keyed by HealthKit UUID for per-card lookup;
  // the full list also drives the batch review sheet.
  const mergeSuggestions = useMemo(
    () => computeMergeSuggestions({ externals: externalWorkouts, logs }),
    [externalWorkouts, logs]
  );
  const suggestionByUuid = useMemo(() => {
    const m = new Map<
      string,
      { suggested: MergeCandidate | null; candidates: MergeCandidate[] }
    >();
    for (const s of mergeSuggestions) {
      m.set(s.external.healthKitUuid, {
        suggested: s.suggested
          ? { id: s.suggested.id, templateName: s.suggested.templateName }
          : null,
        candidates: s.candidates.map((c) => ({ id: c.id, templateName: c.templateName })),
      });
    }
    return m;
  }, [mergeSuggestions]);
  const reviewItems = useMemo<MergeReviewItem[]>(
    () =>
      mergeSuggestions.map((s) => ({
        workout: s.external,
        suggested: s.suggested
          ? { id: s.suggested.id, templateName: s.suggested.templateName }
          : null,
        candidates: s.candidates.map((c) => ({ id: c.id, templateName: c.templateName })),
      })),
    [mergeSuggestions]
  );
  const [showMergeReview, setShowMergeReview] = useState(false);

  const workoutDates = useMemo(() => {
    const dates = new Set<string>();
    const prevStart = startOfMonth(subMonths(currentMonth, 1));
    const nextEnd = endOfMonth(addMonths(currentMonth, 1));
    logs.forEach((log) => {
      const logDate = new Date(log.startedAt);
      if (logDate >= prevStart && logDate <= nextEnd) {
        dates.add(format(logDate, 'yyyy-MM-dd'));
      }
    });
    return dates;
  }, [currentMonth, logs]);

  const externalWorkoutDates = useMemo(() => {
    const dates = new Set<string>();
    externalWorkouts.forEach((w) => {
      // Merged externals are represented by their linked log's marker; a day
      // whose externals are all merged gets no separate external dot.
      if (isMergedExternal(w, logIds)) return;
      dates.add(format(new Date(w.startedAt), 'yyyy-MM-dd'));
    });
    return dates;
  }, [externalWorkouts, logIds]);

  const entriesForSelectedDate = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const entries: DayEntry[] = [];
    logs.forEach((log) => {
      if (format(new Date(log.startedAt), 'yyyy-MM-dd') === dateStr) {
        entries.push({ kind: 'log', startedAt: new Date(log.startedAt).getTime(), log });
      }
    });
    externalWorkouts.forEach((workout) => {
      if (isMergedExternal(workout, logIds)) return;
      if (format(new Date(workout.startedAt), 'yyyy-MM-dd') === dateStr) {
        entries.push({ kind: 'external', startedAt: workout.startedAt, workout });
      }
    });
    return entries.sort((a, b) => a.startedAt - b.startedAt);
  }, [selectedDate, logs, externalWorkouts, logIds]);

  const hasFitbullLog = entriesForSelectedDate.some((e) => e.kind === 'log');

  const isFutureDate = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return selectedDate.getTime() > today.getTime();
  };

  const handleAddWorkout = () => {
    if (isFutureDate()) {
      Alert.alert('Future Date', 'You can only log workouts for today or past dates.');
      return;
    }
    if (templates.length > 0) {
      setShowTemplatePicker(true);
    } else {
      router.push(`/workout/new?date=${selectedDate.toISOString()}`);
    }
  };

  const handleSelectTemplate = (templateId?: string) => {
    setShowTemplatePicker(false);
    const dateParam = `date=${selectedDate.toISOString()}`;
    if (templateId) {
      router.push(`/workout/new?${dateParam}&templateId=${templateId}`);
    } else {
      router.push(`/workout/new?${dateParam}`);
    }
  };

  return (
    <>
      <Calendar
        currentMonth={currentMonth}
        selectedDate={selectedDate}
        markedDates={workoutDates}
        dotDates={externalWorkoutDates}
        isLoading={startOfMonth(currentMonth).toISOString() < fetchedRangeFrom}
        onSelectDate={onSelectDate}
        onPrevMonth={() => {
          const prev = subMonths(currentMonth, 1);
          onMonthChange(prev);
          extendRange(prev);
        }}
        onNextMonth={() => onMonthChange(addMonths(currentMonth, 1))}
      />

      {reviewItems.length > 0 && (
        <Pressable
          testID="merge-review-banner"
          onPress={() => setShowMergeReview(true)}
          accessibilityRole="button"
          accessibilityLabel={`Review ${reviewItems.length} imported workouts that may match a workout you logged`}
          className="mt-5 flex-row items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <Icon as={Link2} size={18} className="text-primary" />
          <View className="flex-1">
            <Text className="text-sm font-medium">Review imported workouts</Text>
            <Text className="text-xs text-muted-foreground">
              {reviewItems.length} may match a workout you logged
            </Text>
          </View>
          <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
        </Pressable>
      )}

      <Text className="mb-3 mt-6 text-sm font-medium text-muted-foreground">
        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
      </Text>

      {entriesForSelectedDate.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-border py-12">
          <Icon as={CalendarDays} size={32} className="text-primary" />
          <Text className="mt-3 text-muted-foreground">No workouts on this day</Text>
          <Pressable
            onPress={handleAddWorkout}
            className="mt-4 flex-row items-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5"
          >
            <Plus size={16} color={primaryColor} />
            <Text className="text-sm font-medium text-primary">Log a Workout</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {entriesForSelectedDate.map((entry) =>
            entry.kind === 'log' ? (
              <WorkoutLogCard
                key={entry.log.id}
                log={entry.log}
                linkedExternal={linkedExternalByLogId.get(entry.log.id)}
              />
            ) : (
              <ExternalWorkoutCard
                key={entry.workout._id}
                workout={entry.workout}
                suggested={suggestionByUuid.get(entry.workout.healthKitUuid)?.suggested ?? null}
                candidates={suggestionByUuid.get(entry.workout.healthKitUuid)?.candidates ?? []}
              />
            )
          )}
          <Pressable
            onPress={handleAddWorkout}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5"
          >
            <Plus size={16} color={primaryColor} />
            <Text className="text-sm font-medium text-primary">
              {hasFitbullLog ? 'Log Another Workout' : 'Log a Workout'}
            </Text>
          </Pressable>
        </>
      )}

      {/* Template Picker Modal */}
      <Modal
        visible={showTemplatePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTemplatePicker(false)}
      >
        <View className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
            <Pressable onPress={() => setShowTemplatePicker(false)} className="h-10 w-10 items-center justify-center">
              <X size={24} color={primaryColor} />
            </Pressable>
            <Text className="text-lg font-semibold">Log Workout</Text>
            <View className="w-10" />
          </View>

          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            contentContainerClassName="px-4 pt-4 pb-8"
            ListHeaderComponent={
              <Pressable
                onPress={() => handleSelectTemplate()}
                className="mb-3 flex-row items-center gap-3 rounded-xl border border-dashed border-primary bg-accent px-4 py-4"
              >
                <Plus size={20} color={primaryColor} />
                <View>
                  <Text className="font-medium text-primary">Empty Workout</Text>
                  <Text className="text-xs text-muted-foreground">Start from scratch</Text>
                </View>
              </Pressable>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectTemplate(item.id)}
                className="mb-2 flex-row items-center gap-3 rounded-xl bg-card px-4 py-4"
              >
                <FileText size={20} color={primaryColor} />
                <View className="flex-1">
                  <Text className="font-medium">{item.name}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {item.exercises.length} exercise{item.exercises.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <MergeReviewModal
        visible={showMergeReview}
        onClose={() => setShowMergeReview(false)}
        items={reviewItems}
      />
    </>
  );
}

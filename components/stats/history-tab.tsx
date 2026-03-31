import { Text } from '@/components/ui/text';
import { addMonths, format, subMonths } from 'date-fns';
import { useRouter } from 'expo-router';
import { CalendarDays, FileText, Plus, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, View } from 'react-native';

import { Calendar } from '@/components/history/calendar';
import { WorkoutLogCard } from '@/components/history/workout-log-card';
import { Colors } from '@/constants/theme';
import { useHistoryStore } from '@/stores/history-store';
import { useTemplateStore } from '@/stores/template-store';

interface HistoryTabProps {
  currentMonth: Date;
  selectedDate: Date;
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: Date) => void;
}

export function HistoryTab({ currentMonth, selectedDate, onMonthChange, onSelectDate }: HistoryTabProps) {
  const { colorScheme } = useColorScheme();
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const router = useRouter();

  const logs = useHistoryStore((s) => s.logs);
  const templates = useTemplateStore((s) => s.templates);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const workoutDates = useMemo(() => {
    const dates = new Set<string>();
    logs.forEach((log) => {
      const logDate = new Date(log.startedAt);
      if (
        logDate.getFullYear() === currentMonth.getFullYear() &&
        logDate.getMonth() === currentMonth.getMonth()
      ) {
        dates.add(format(logDate, 'yyyy-MM-dd'));
      }
    });
    return dates;
  }, [currentMonth, logs]);

  const logsForSelectedDate = useMemo(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return logs.filter(
      (log) => format(new Date(log.startedAt), 'yyyy-MM-dd') === dateStr
    );
  }, [selectedDate, logs]);

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
        workoutDates={workoutDates}
        onSelectDate={onSelectDate}
        onPrevMonth={() => onMonthChange(subMonths(currentMonth, 1))}
        onNextMonth={() => onMonthChange(addMonths(currentMonth, 1))}
      />

      <Text className="mb-3 mt-6 text-sm font-medium text-muted-foreground">
        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
      </Text>

      {logsForSelectedDate.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-border py-12">
          <CalendarDays size={32} color={primaryColor} />
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
          {logsForSelectedDate.map((log) => (
            <WorkoutLogCard key={log.id} log={log} />
          ))}
          <Pressable
            onPress={handleAddWorkout}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5"
          >
            <Plus size={16} color={primaryColor} />
            <Text className="text-sm font-medium text-primary">Log Another Workout</Text>
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
    </>
  );
}

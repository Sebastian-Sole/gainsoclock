import React from 'react';
import { View, ScrollView, Pressable, Modal } from 'react-native';
import { Text } from '@/components/ui/text';
import { X, Play, Dumbbell, Check } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { useTemplateStore } from '@/stores/template-store';
import { cn } from '@/lib/utils';
import { isPast } from '@/lib/plan-dates';

interface PlanDayDetailProps {
  visible: boolean;
  onClose: () => void;
  onStartWorkout: () => void;
  week: number;
  dayOfWeek: number;
  label?: string;
  notes?: string;
  templateClientId?: string;
  status: string;
  date?: Date;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function PlanDayDetail({
  visible,
  onClose,
  onStartWorkout,
  week,
  dayOfWeek,
  label,
  notes,
  templateClientId,
  status,
  date,
}: PlanDayDetailProps) {
  const { colorScheme } = useColorScheme();
  const isMissed = status === 'pending' && !!date && isPast(date);
  const primaryColor = Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint;
  const template = useTemplateStore((s) =>
    templateClientId ? s.getTemplate(templateClientId) : undefined
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end bg-black/50"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl bg-background"
          style={{ maxHeight: '80%' }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
            <View>
              <Text className="text-lg font-bold">{label ?? 'Rest Day'}</Text>
              <Text className="text-sm text-muted-foreground">
                Week {week} · {DAY_NAMES[dayOfWeek]}
              </Text>
            </View>
            <Pressable onPress={onClose} className="p-2">
              <X size={20} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
            </Pressable>
          </View>

          {/* Status badge */}
          <View className="px-6 pb-3">
            <View
              className={cn(
                'self-start rounded-full px-3 py-1',
                status === 'completed' && 'bg-green-500/15',
                status === 'skipped' && 'bg-yellow-500/10',
                isMissed && 'bg-red-500/10',
                status === 'pending' && !isMissed && 'bg-primary/10',
                status === 'rest' && 'bg-muted'
              )}
            >
              <Text
                className={cn(
                  'text-xs font-medium capitalize',
                  status === 'completed' && 'text-green-500',
                  status === 'skipped' && 'text-yellow-600',
                  isMissed && 'text-red-500',
                  status === 'pending' && !isMissed && 'text-primary',
                  status === 'rest' && 'text-muted-foreground'
                )}
              >
                {isMissed ? 'missed' : status}
              </Text>
            </View>
          </View>

          {/* Notes */}
          {notes && (
            <View className="px-6 pb-3">
              <Text className="text-sm text-muted-foreground">{notes}</Text>
            </View>
          )}

          {/* Exercise list */}
          {template && (
            <ScrollView className="px-6" style={{ maxHeight: 300 }}>
              <Text className="mb-2 text-sm font-medium text-muted-foreground">Exercises</Text>
              {template.exercises.map((exercise, index) => (
                <View
                  key={exercise.id}
                  className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Dumbbell size={14} color={primaryColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium">{exercise.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {exercise.defaultSetsCount} sets · {exercise.restTimeSeconds}s rest
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Template notes */}
          {template?.notes && (
            <View className="px-6 pb-3">
              <Text className="text-sm text-muted-foreground italic">{template.notes}</Text>
            </View>
          )}

          {/* Completed indicator */}
          {templateClientId && status === 'completed' && (
            <View className="px-6 pb-8 pt-4">
              <View className="flex-row items-center justify-center gap-2 rounded-xl bg-green-500/10 py-4">
                <Check size={18} color="#22c55e" />
                <Text className="text-base font-semibold text-green-500">Workout Completed</Text>
              </View>
            </View>
          )}

          {/* Start Workout button */}
          {templateClientId && status !== 'completed' && (
            <View className="px-6 pb-8 pt-4">
              <Pressable
                onPress={onStartWorkout}
                className="flex-row items-center justify-center gap-2 rounded-xl py-4"
                style={{ backgroundColor: primaryColor }}
              >
                <Play size={18} color="#fff" />
                <Text className="text-base font-semibold text-white">Start Workout</Text>
              </Pressable>
            </View>
          )}

          {!templateClientId && (
            <View className="px-6 pb-8 pt-4">
              <Text className="text-center text-sm text-muted-foreground">
                Rest day — no workout scheduled
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

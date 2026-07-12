import React from 'react';
import { View, Pressable } from 'react-native';
import { Check, Dumbbell, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import type { Exercise } from '@/lib/types';
import { cn } from '@/lib/utils';

const THRESHOLD = 80;

interface SummaryExerciseRowProps {
  exercise: Exercise;
  /** Toggle every set of this exercise complete/incomplete. */
  onToggleComplete: () => void;
  /** Jump back to this exercise in the logger. */
  onNavigate: () => void;
  /** Ask to delete this exercise (parent shows the confirmation). */
  onDelete: () => void;
}

/**
 * One exercise cell on the workout summary. Tap the icon to mark the whole
 * exercise done, tap the cell to edit it, or swipe right to delete (with a
 * confirmation handled by the parent). Screen readers reach delete via the
 * accessibility action instead of the swipe.
 */
export function SummaryExerciseRow({
  exercise,
  onToggleComplete,
  onNavigate,
  onDelete,
}: SummaryExerciseRowProps) {
  const translateX = useSharedValue(0);
  const done = exercise.sets.filter((s) => s.completed).length;
  const full = exercise.sets.length > 0 && done === exercise.sets.length;

  const pan = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // Right swipe only; clamp the left direction.
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd(() => {
      if (translateX.value > THRESHOLD) {
        runOnJS(onDelete)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / THRESHOLD, 1),
  }));

  return (
    <View className="overflow-hidden rounded-xl">
      {/* Red delete background revealed on swipe */}
      <Animated.View
        style={bgStyle}
        className="absolute inset-0 flex-row items-center rounded-xl bg-destructive pl-5"
      >
        <Icon as={Trash2} size={20} className="text-destructive-foreground" />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <Pressable
            onPress={onNavigate}
            accessibilityRole="button"
            accessibilityLabel={`${exercise.name}, ${done} of ${exercise.sets.length} sets logged`}
            accessibilityHint="Opens this exercise in the logger"
            accessibilityActions={[{ name: 'delete', label: 'Delete exercise' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'delete') onDelete();
            }}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Pressable
              onPress={onToggleComplete}
              accessibilityRole="button"
              accessibilityState={{ checked: full }}
              accessibilityLabel={
                full ? `Mark ${exercise.name} incomplete` : `Mark ${exercise.name} complete`
              }
              hitSlop={8}
              className={cn(
                'h-7 w-7 items-center justify-center rounded-full',
                full ? 'bg-green-500' : 'bg-secondary'
              )}
            >
              {full ? (
                <Check size={15} color="#fff" strokeWidth={3} />
              ) : (
                <Icon as={Dumbbell} size={14} className="text-muted-foreground" />
              )}
            </Pressable>
            <Text className="flex-1 font-medium text-foreground">{exercise.name}</Text>
            <Text className="font-mono text-xs text-muted-foreground">
              {done}/{exercise.sets.length} sets
            </Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

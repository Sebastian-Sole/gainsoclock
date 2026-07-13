import React from 'react';
import { View, Pressable, Keyboard } from 'react-native';
import { Text } from '@/components/ui/text';
import { Check, X } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { SetInput } from './set-input';
import { TimeInput } from '@/components/shared/time-input';
import { RpeInput } from './rpe-input';
import { IntervalSetInputs, MmSsInput } from './interval-set-inputs';
import type { LoadMode, MetricId, WorkoutSet } from '@/lib/types';
import { loadModeFieldSuffix } from '@/lib/load-mode';
import { METRICS, metricUpdate, resolveExerciseMetrics, type MetricSpec } from '@/lib/metrics';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/utils';

interface SetRowProps {
  set: WorkoutSet;
  /** Resolved metric list of the parent exercise (drives which inputs render). */
  metrics: MetricId[];
  /** Parent exercise's load mode — labels the weight input "per hand"/"per
   *  side" (lib/load-mode.ts). Absent = 'total', unchanged rendering. */
  loadMode?: LoadMode;
  index: number;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  onToggleComplete: () => void;
  onRemove: () => void;
  editable?: boolean;
}

/** One input for one metric, chosen by the metric's input kind. */
function MetricInput({
  spec,
  set,
  index,
  loadMode,
  onUpdate,
}: {
  spec: MetricSpec;
  set: WorkoutSet;
  index: number;
  loadMode?: LoadMode;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
}) {
  const value = set[spec.field] ?? 0;
  const change = (v: number) => onUpdate(metricUpdate(spec.field, v));
  // "Weight, per hand" for unilateral exercises (lib/load-mode.ts); other
  // metrics and total/legacy exercises are unchanged.
  const suffix = spec.id === 'weight' ? loadModeFieldSuffix(loadMode) : undefined;
  const fieldLabel = suffix ? `${spec.label}, ${suffix}` : spec.label;

  switch (spec.inputKind) {
    case 'duration':
      return <TimeInput value={value} onValueChange={change} className="flex-[2]" />;
    case 'pace':
      return <MmSsInput value={value} onValueChange={change} className="flex-[2]" />;
    case 'integer':
    case 'decimal':
      return (
        <SetInput
          value={value}
          onValueChange={change}
          placeholder="0"
          className="flex-1"
          allowDecimals={spec.inputKind === 'decimal'}
          accessibilityLabel={`${fieldLabel}, set ${index + 1}`}
          testID={`set-${index}-${spec.id}`}
        />
      );
  }
}

export const SetRow = React.memo(function SetRow({ set, metrics, loadMode, index, onUpdate, onToggleComplete, onRemove, editable = true }: SetRowProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const rpeEnabled = useSettingsStore((s) => s.rpeEnabled);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleToggle = () => {
    Keyboard.dismiss();
    scale.value = withSequence(
      withSpring(1.05, { duration: 150 }),
      withSpring(1, { duration: 150 })
    );
    onToggleComplete();
  };

  const renderInputs = () => {
    if (set.type === 'intervals') {
      return <IntervalSetInputs set={set} onUpdate={onUpdate} />;
    }
    return resolveExerciseMetrics(set.type, metrics).map((id) => (
      <MetricInput key={id} spec={METRICS[id]} set={set} index={index} loadMode={loadMode} onUpdate={onUpdate} />
    ));
  };

  const handleVariantToggle = () => {
    if (!editable) return;
    const next = set.variant === 'work' ? 'rest' : set.variant === 'rest' ? undefined : 'work';
    onUpdate({ variant: next });
  };

  return (
    <Animated.View
      style={animatedStyle}
      className={cn(
        'flex-row items-center gap-2 rounded-lg px-3 py-2',
        set.completed && 'bg-primary/10',
        set.variant === 'rest' && 'opacity-60'
      )}
    >
      <Pressable onLongPress={handleVariantToggle} className="w-8 items-center" hitSlop={8}>
        {set.variant ? (
          <Text className={cn('text-xs font-bold', set.variant === 'work' ? 'text-green-500' : 'text-yellow-500')}>
            {set.variant === 'work' ? 'W' : 'R'}
          </Text>
        ) : (
          <Text className="text-sm text-muted-foreground">{index + 1}</Text>
        )}
      </Pressable>
      <View className="flex-1 flex-row items-center gap-2">
        {renderInputs()}
      </View>
      {rpeEnabled && (
        <RpeInput
          value={set.rpe}
          onValueChange={(rpe) => onUpdate({ rpe })}
          disabled={!editable}
        />
      )}
      {editable && (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={handleToggle}
            accessibilityRole="button"
            accessibilityLabel={`Mark set ${index + 1} complete`}
            accessibilityState={{ checked: set.completed }}
            testID={`set-${index}-complete`}
            className={cn(
              'h-8 w-8 items-center justify-center rounded-md',
              set.completed ? 'bg-primary' : 'border border-border'
            )}
          >
            <Check size={16} color={set.completed ? 'white' : isDark ? '#666' : '#999'} />
          </Pressable>
          <Pressable onPress={() => { Keyboard.dismiss(); onRemove(); }} className="h-8 w-8 items-center justify-center">
            <X size={14} color={isDark ? '#666' : '#999'} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
});

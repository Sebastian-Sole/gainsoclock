import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useNumericField } from '@/hooks/use-numeric-field';
import { useTokenColors } from '@/hooks/use-token-colors';
import { Text } from '@/components/ui/text';
import { X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { keyboardDoneAccessoryID } from '@/components/shared/keyboard-done-accessory';
import { TimeInput } from '@/components/shared/time-input';
import { IntervalSetInputs, MmSsInput } from '@/components/workout/interval-set-inputs';
import type { Exercise, MetricId, WorkoutSet } from '@/lib/types';
import {
  METRICS,
  metricUnitOverride,
  metricUpdate,
  resolveExerciseMetrics,
  MAX_METRICS_PER_EXERCISE,
  type MetricSpec,
} from '@/lib/metrics';
import { cn } from '@/lib/utils';

/** Big numeric field sharing SetInput's comma-decimal machinery
 *  (hooks/use-numeric-field). 0 / undefined render blank ("—"); clearing
 *  stores undefined so the metric can be genuinely blank on this set. */
function BigInput({
  value,
  onChange,
  allowDecimals,
  editable,
  accessibilityLabel,
  testID,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  allowDecimals?: boolean;
  editable?: boolean;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { text, onChangeText, onBlur } = useNumericField({
    value,
    allowDecimals,
    onNumber: (n) => onChange(n ?? undefined),
  });
  const colors = useTokenColors();

  return (
    <TextInput
      value={text}
      editable={editable}
      onChangeText={onChangeText}
      onBlur={onBlur}
      placeholder="—"
      placeholderTextColor={colors.mutedForeground}
      accessibilityLabel={accessibilityLabel}
      keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
      inputAccessoryViewID={keyboardDoneAccessoryID}
      selectTextOnFocus
      className="min-w-[70px] text-right text-3xl font-extrabold text-foreground"
      testID={testID}
    />
  );
}

interface FocusSetCardProps {
  exercise: Exercise;
  set: WorkoutSet;
  weightUnit: string;
  distanceUnit: string;
  editable?: boolean;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  onAddMetric: () => void;
  onRemoveMetric: (metricId: MetricId) => void;
}

export function FocusSetCard({
  exercise,
  set,
  weightUnit,
  distanceUnit,
  editable = true,
  onUpdate,
  onAddMetric,
  onRemoveMetric,
}: FocusSetCardProps) {
  const metrics = resolveExerciseMetrics(exercise.type, exercise.metrics);

  // Intervals don't compose from the metric palette: one set is a whole
  // interval — a work segment (effort + duration) and a rest segment — with
  // its own editor.
  if (exercise.type === 'intervals') {
    return (
      <View className="flex-row">
        <IntervalSetInputs set={set} onUpdate={onUpdate} editable={editable} />
      </View>
    );
  }

  const unitFor = (id: MetricId): string =>
    metricUnitOverride(id, weightUnit, distanceUnit) ?? METRICS[id].unit ?? '';

  const renderInput = (spec: MetricSpec) => {
    const value = set[spec.field];
    const change = (v: number | undefined) => onUpdate(metricUpdate(spec.field, v));

    if (spec.inputKind === 'duration') {
      return <TimeInput value={value ?? 0} onValueChange={change} className="flex-1" />;
    }
    if (spec.inputKind === 'pace') {
      return (
        <View className="flex-1 items-end">
          <MmSsInput value={value ?? 0} onValueChange={change} />
        </View>
      );
    }
    const decimals = spec.inputKind === 'decimal';
    const stepAmount = spec.step ?? (decimals ? 0.5 : 1);
    const step = (dir: 1 | -1) => {
      const next = Math.max(0, Math.round(((value ?? 0) + dir * stepAmount) * 10) / 10);
      change(next);
    };
    return (
      <>
        <Pressable
          onPress={() => step(-1)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${spec.label}`}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-card"
        >
          <Text className="text-xl font-medium leading-none text-muted-foreground">−</Text>
        </Pressable>
        <View className="flex-1 items-end">
          <BigInput
            value={value}
            onChange={change}
            allowDecimals={decimals}
            editable={editable}
            accessibilityLabel={spec.label}
            testID={`focus-${spec.id}`}
          />
        </View>
        <Pressable
          onPress={() => step(1)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${spec.label}`}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-card"
        >
          <Text className="text-xl font-medium leading-none text-muted-foreground">+</Text>
        </Pressable>
      </>
    );
  };

  return (
    <View>
      {metrics.map((id, i) => {
        const spec = METRICS[id];
        const unit = unitFor(id);
        return (
          <View
            key={id}
            className={cn('flex-row items-center gap-2 py-3', i > 0 && 'border-t border-border')}
          >
            <View style={{ width: 94 }}>
              <Text className="text-base font-semibold text-foreground">{spec.label}</Text>
              {unit ? (
                <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">{unit}</Text>
              ) : null}
            </View>
            {renderInput(spec)}
            <Pressable
              onPress={() => onRemoveMetric(id)}
              disabled={!editable || metrics.length <= 1}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${spec.label} from this exercise`}
              className="w-6 items-center justify-center"
            >
              <Icon as={X} size={13} className={cn('text-muted-foreground', metrics.length <= 1 && 'opacity-30')} />
            </Pressable>
          </View>
        );
      })}

      {metrics.length < MAX_METRICS_PER_EXERCISE && (
        <Pressable
          onPress={onAddMetric}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel="Track another metric"
          className="mt-3 items-center rounded-xl border border-dashed border-primary/50 py-3"
        >
          <Text className="text-sm font-semibold text-primary">+ Track a metric</Text>
        </Pressable>
      )}
      <Text className="mt-2 text-[10px] text-muted-foreground">
        Metrics are shared by every set of this exercise · a value can be left blank on any set.
      </Text>
    </View>
  );
}

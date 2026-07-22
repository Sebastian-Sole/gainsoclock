import React from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useKeyboardDoneBar } from '@/components/shared/keyboard-done-bar';
import { useNumericField } from '@/hooks/use-numeric-field';
import { useTokenColors } from '@/hooks/use-token-colors';
import { Text } from '@/components/ui/text';
import { Pencil, Settings2, X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { TimeInput } from '@/components/shared/time-input';
import { IntervalSetInputs, MmSsInput } from '@/components/workout/interval-set-inputs';
import { RpeInput } from '@/components/workout/rpe-input';
import { useSettingsStore } from '@/stores/settings-store';
import type { Exercise, MetricId, WorkoutSet } from '@/lib/types';
import { effectiveLoad, loadModeFieldSuffix, loadMultiplier } from '@/lib/load-mode';
import { formatTime } from '@/lib/format';
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
  inputRef,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  allowDecimals?: boolean;
  editable?: boolean;
  accessibilityLabel: string;
  testID?: string;
  inputRef?: React.Ref<TextInput>;
}) {
  const { text, onChangeText, onBlur } = useNumericField({
    value,
    allowDecimals,
    onNumber: (n) => onChange(n ?? undefined),
  });
  const colors = useTokenColors();
  const kb = useKeyboardDoneBar();

  return (
    <>
      {/* input-height-ok: borderless display-style BigInput — self-sizing, no box to clip against */}
      <TextInput
        ref={inputRef}
        value={text}
        editable={editable}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={accessibilityLabel}
        keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
        returnKeyType={kb.returnKeyType}
        inputAccessoryViewID={kb.inputAccessoryViewID}
        selectTextOnFocus
        className="min-w-[70px] text-right text-3xl font-extrabold text-foreground"
        testID={testID}
      />
      {kb.bar}
    </>
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
  /** Later sets exist, so per-metric "apply to remaining sets" is offered. */
  canApplyToFollowing?: boolean;
  /** Apply `updates` to this set and every set after it (#146). */
  onApplyToFollowing?: (updates: Partial<WorkoutSet>, label: string) => void;
  /** Open the load-mode picker sheet (#142); makes the weight row's unit
   *  chip a button when provided. */
  onPressLoadMode?: () => void;
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
  canApplyToFollowing = false,
  onApplyToFollowing,
  onPressLoadMode,
}: FocusSetCardProps) {
  const rpeEnabled = useSettingsStore((s) => s.rpeEnabled);
  const metrics = resolveExerciseMetrics(exercise.type, exercise.metrics);
  // One ref per metric row so the pencil affordance can focus its field.
  const valueInputRefs = React.useRef<Record<string, TextInput | null>>({});

  // "Apply to remaining sets" prompt (#146): appears under a metric row only
  // after the user changes that metric's value on this set (mirrors the old
  // pre-Focus applyAllPrompt). One prompt at a time; cleared when this card
  // stops being the active set so it never lingers on a neighbor slot.
  const [applyPromptField, setApplyPromptField] = React.useState<MetricId | null>(null);
  React.useEffect(() => {
    if (!editable) setApplyPromptField(null);
  }, [editable]);

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
    const change = (v: number | undefined) => {
      onUpdate(metricUpdate(spec.field, v));
      // A value change on this set offers to carry it to the remaining sets
      // (#146). Armed here, rendered under the row below.
      if (canApplyToFollowing && onApplyToFollowing) setApplyPromptField(spec.id);
    };
    // Screen readers hear the load-mode qualifier too ("Weight, per hand").
    const fieldSuffix = spec.id === 'weight' ? loadModeFieldSuffix(exercise.loadMode) : undefined;
    const fieldLabel = fieldSuffix ? `${spec.label}, ${fieldSuffix}` : spec.label;

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
          accessibilityLabel={`Decrease ${fieldLabel}`}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-card"
        >
          <Text className="text-xl font-medium leading-none text-muted-foreground">−</Text>
        </Pressable>
        <View className="flex-1 flex-row items-center justify-end gap-2">
          {/* Edit affordance: the big borderless number doesn't read as
              editable on its own. Tapping the pencil focuses the field. */}
          {editable && (
            <Pressable
              onPress={() => valueInputRefs.current[spec.id]?.focus()}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${fieldLabel}`}
              hitSlop={10}
            >
              <Icon as={Pencil} size={13} className="text-muted-foreground/60" />
            </Pressable>
          )}
          <BigInput
            value={value}
            onChange={change}
            allowDecimals={decimals}
            editable={editable}
            accessibilityLabel={fieldLabel}
            testID={`focus-${spec.id}`}
            inputRef={(r) => {
              valueInputRefs.current[spec.id] = r;
            }}
          />
        </View>
        <Pressable
          onPress={() => step(1)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${fieldLabel}`}
          className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-card"
        >
          <Text className="text-xl font-medium leading-none text-muted-foreground">+</Text>
        </Pressable>
      </>
    );
  };

  // Weight-field qualifier: always shown, including "total", so the active
  // entry mode is never ambiguous (#142).
  const weightSuffix = loadModeFieldSuffix(exercise.loadMode) ?? 'total';
  const doublesLoad = loadMultiplier(exercise.loadMode) > 1;

  return (
    <View>
      {metrics.map((id, i) => {
        const spec = METRICS[id];
        const unit = unitFor(id);
        const suffix = id === 'weight' ? weightSuffix : undefined;
        const unitLine = suffix ? [unit, suffix].filter(Boolean).join(' · ') : unit;
        // Lightweight derived total ("2 × 10 = 20 kg") — only where doubling
        // actually happens (per_hand / per_side) and a weight is entered.
        const totalHint =
          id === 'weight' && doublesLoad && set.weight !== undefined && set.weight > 0
            ? `= ${effectiveLoad(set.weight, exercise.loadMode)} ${unit} total`
            : undefined;
        const applyValue = set[spec.field];
        const showApplyPrompt =
          applyPromptField === id &&
          canApplyToFollowing &&
          onApplyToFollowing !== undefined &&
          applyValue !== undefined;
        const applyValueLabel =
          spec.inputKind === 'duration' || spec.inputKind === 'pace'
            ? formatTime(applyValue ?? 0)
            : `${applyValue}${unit ? ` ${unit}` : ''}`;
        const canEditLoadMode = id === 'weight' && onPressLoadMode !== undefined && editable;
        return (
          <View key={id} className={cn('py-3', i > 0 && 'border-t border-border')}>
            <View className="flex-row items-center gap-2">
              <View style={{ width: 94 }}>
                <Text className="text-base font-semibold text-foreground">{spec.label}</Text>
                {canEditLoadMode ? (
                  <>
                    {unit ? (
                      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {unit}
                      </Text>
                    ) : null}
                    {/* Mode only — with the unit on its own line the chip
                        always fits the label column, keeping a constant gap
                        to the stepper button ("KG · PER HAND" overflowed). */}
                    <Pressable
                      onPress={onPressLoadMode}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Weight entry mode: ${weightSuffix}`}
                      accessibilityHint="Change to total, per hand, or per side"
                      testID="focus-weight-load-mode"
                      className="mt-1 flex-row items-center gap-1 self-start rounded-md border border-border px-1.5 py-0.5"
                    >
                      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {weightSuffix}
                      </Text>
                      <Icon as={Settings2} size={11} className="text-muted-foreground" />
                    </Pressable>
                  </>
                ) : unitLine ? (
                  <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {unitLine}
                  </Text>
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
            {totalHint ? (
              <Text
                className="mt-1 text-right text-xs text-muted-foreground"
                testID="focus-weight-total"
              >
                {totalHint}
              </Text>
            ) : null}
            {showApplyPrompt && (
              <View className="mt-2 flex-row items-center rounded-xl border border-primary bg-primary/10">
                <Pressable
                  onPress={() => {
                    onApplyToFollowing(metricUpdate(spec.field, applyValue), spec.label);
                    setApplyPromptField(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply ${applyValueLabel} to remaining sets`}
                  testID={`focus-apply-${spec.id}`}
                  className="min-h-[44px] flex-1 justify-center py-2.5 pl-3"
                >
                  <Text className="text-sm font-semibold text-primary">
                    Apply {applyValueLabel} to remaining sets
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setApplyPromptField(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                  hitSlop={8}
                  className="min-h-[44px] justify-center px-3"
                >
                  <Icon as={X} size={14} className="text-primary" />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      {rpeEnabled && (
        <View className="flex-row items-center gap-2 border-t border-border py-3">
          <View style={{ width: 94 }}>
            <Text className="text-base font-semibold text-foreground">RPE</Text>
            <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
              effort · 1–10
            </Text>
          </View>
          <View className="flex-1 items-end">
            <RpeInput
              variant="focus"
              value={set.rpe}
              onValueChange={(rpe) => onUpdate({ rpe })}
              disabled={!editable}
            />
          </View>
          {/* spacer matching the remove-metric column so the control lines up */}
          <View className="w-6" />
        </View>
      )}

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

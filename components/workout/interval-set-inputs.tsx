import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { TimeInput } from '@/components/shared/time-input';
import { SetInput } from './set-input';
import { lightHaptic } from '@/lib/haptics';
import type { IntervalMetric, WorkoutSet } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IntervalSetInputsProps {
  set: WorkoutSet;
  onUpdate: (updates: Partial<WorkoutSet>) => void;
  editable?: boolean;
}

const EFFORT_METRICS: { value: IntervalMetric; label: string }[] = [
  { value: 'pace', label: 'Pace' },
  { value: 'distance', label: 'Distance' },
  { value: 'speed', label: 'Speed' },
];

function speedUnitLabel(distanceUnit: 'km' | 'mi') {
  return distanceUnit === 'km' ? 'km/h' : 'mph';
}

function paceUnitLabel(distanceUnit: 'km' | 'mi') {
  return `min / ${distanceUnit}`;
}

export function MmSsInput({
  value,
  onValueChange,
  className,
}: {
  value: number; // total seconds
  onValueChange: (seconds: number) => void;
  className?: string;
}) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  const [minutesText, setMinutesText] = useState<string | null>(null);
  const [secondsText, setSecondsText] = useState<string | null>(null);

  const handleMinutes = (text: string) => {
    setMinutesText(text);
    const parsed = parseInt(text, 10);
    const m = Math.min(99, Number.isFinite(parsed) ? parsed : 0);
    onValueChange(m * 60 + seconds);
  };

  const handleSeconds = (text: string) => {
    setSecondsText(text);
    const parsed = parseInt(text, 10);
    const s = Math.min(59, Number.isFinite(parsed) ? parsed : 0);
    onValueChange(minutes * 60 + s);
  };

  // text-[18px] sets font-size only. A Tailwind size class like `text-lg` would
  // also inject line-height:28, which offsets the text vertically inside a
  // fixed-height TextInput on iOS (same trap the Input primitive avoids).
  // min-h (not a fixed h-11) so large Dynamic Type sizes grow the cell instead
  // of clipping the digits against the border.
  const fieldClass =
    'min-h-[44px] w-14 rounded-md border border-input bg-background px-1 text-center text-[18px] text-foreground';

  return (
    <View className={cn('flex-row items-center gap-1', className)}>
      <TextInput
        value={minutesText ?? String(minutes)}
        onChangeText={handleMinutes}
        onFocus={() => setMinutesText(String(minutes))}
        onBlur={() => setMinutesText(null)}
        keyboardType="numeric"
        returnKeyType="done"
        maxLength={2}
        selectTextOnFocus
        className={fieldClass}
      />
      <Text className="text-base text-muted-foreground">:</Text>
      <TextInput
        value={secondsText ?? String(seconds).padStart(2, '0')}
        onChangeText={handleSeconds}
        onFocus={() => setSecondsText(String(seconds))}
        onBlur={() => setSecondsText(null)}
        keyboardType="numeric"
        returnKeyType="done"
        maxLength={2}
        selectTextOnFocus
        className={fieldClass}
      />
    </View>
  );
}

/** Uppercase field caption shared by every row here. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

/**
 * One interval = one set: a WORK segment (an effort metric + its duration) and
 * a REST segment (duration). Each control sits on its own labelled row so it's
 * legible and easy to tap, rather than crammed onto a single line.
 */
export function IntervalSetInputs({ set, onUpdate, editable = true }: IntervalSetInputsProps) {
  const metric = set.metric ?? 'distance';
  const distanceUnit = set.distanceUnit ?? 'km';

  const handleMetric = (next: IntervalMetric) => {
    if (next === metric) return;
    lightHaptic();
    // Clear the previous metric's value: the flat set shape keeps every field,
    // so a leftover distance/speed/pace from before the switch would otherwise
    // persist and get counted by stats.
    onUpdate({ metric: next, paceSeconds: undefined, distance: undefined, speed: undefined });
  };

  return (
    <View className="flex-1 gap-4">
      {/* WORK */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <View className="mb-3 flex-row items-center gap-2">
          <View className="rounded-full bg-primary px-2.5 py-1">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              Work
            </Text>
          </View>
        </View>

        <FieldLabel>Effort</FieldLabel>
        <View className="mb-4 flex-row gap-2">
          {EFFORT_METRICS.map((m) => {
            const selected = metric === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => handleMetric(m.value)}
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={`Effort metric: ${m.label}`}
                accessibilityState={{ selected }}
                className={cn(
                  'h-11 flex-1 items-center justify-center rounded-xl border',
                  selected ? 'border-primary bg-accent' : 'border-border bg-background'
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-semibold',
                    selected ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {metric === 'pace' && (
          <>
            <FieldLabel>Pace ({paceUnitLabel(distanceUnit)})</FieldLabel>
            <MmSsInput value={set.paceSeconds ?? 0} onValueChange={(paceSeconds) => onUpdate({ paceSeconds })} />
          </>
        )}
        {metric === 'distance' && (
          <>
            <FieldLabel>Distance ({distanceUnit})</FieldLabel>
            <SetInput
              value={set.distance ?? 0}
              onValueChange={(distance) => onUpdate({ distance })}
              placeholder="0"
              allowDecimals
              accessibilityLabel="Work distance"
              className="min-h-[44px] w-24 text-[18px]"
            />
          </>
        )}
        {metric === 'speed' && (
          <>
            <FieldLabel>Speed ({speedUnitLabel(distanceUnit)})</FieldLabel>
            <SetInput
              value={set.speed ?? 0}
              onValueChange={(speed) => onUpdate({ speed })}
              placeholder="0"
              allowDecimals
              accessibilityLabel="Work speed"
              className="min-h-[44px] w-24 text-[18px]"
            />
          </>
        )}

        <View className="mt-4">
          <FieldLabel>Duration</FieldLabel>
          <TimeInput value={set.time ?? 0} onValueChange={(time) => onUpdate({ time })} />
        </View>
      </View>

      {/* REST */}
      <View className="rounded-2xl border border-border bg-card p-4">
        <View className="mb-3 flex-row items-center gap-2">
          <View className="rounded-full bg-secondary px-2.5 py-1">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
              Rest
            </Text>
          </View>
        </View>
        <FieldLabel>Duration</FieldLabel>
        <TimeInput value={set.restTime ?? 0} onValueChange={(restTime) => onUpdate({ restTime })} />
      </View>
    </View>
  );
}

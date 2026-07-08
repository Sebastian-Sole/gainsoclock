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
}

const METRICS: { value: IntervalMetric; label: string }[] = [
  { value: 'pace', label: 'Pace' },
  { value: 'distance', label: 'Dist' },
  { value: 'speed', label: 'Speed' },
];

function speedUnitLabel(distanceUnit: 'km' | 'mi') {
  return distanceUnit === 'km' ? 'km/h' : 'mph';
}

function paceUnitLabel(distanceUnit: 'km' | 'mi') {
  return `/ ${distanceUnit}`;
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

  const fieldClass =
    'h-9 w-12 rounded-md border border-input bg-background px-1 text-center text-foreground';

  return (
    <View className={cn('flex-row items-center gap-1', className)}>
      <TextInput
        value={minutesText ?? String(minutes)}
        onChangeText={handleMinutes}
        onFocus={() => setMinutesText(String(minutes))}
        onBlur={() => setMinutesText(null)}
        keyboardType="numeric"
        maxLength={2}
        selectTextOnFocus
        className={fieldClass}
      />
      <Text className="text-xs text-muted-foreground">:</Text>
      <TextInput
        value={secondsText ?? String(seconds).padStart(2, '0')}
        onChangeText={handleSeconds}
        onFocus={() => setSecondsText(String(seconds))}
        onBlur={() => setSecondsText(null)}
        keyboardType="numeric"
        maxLength={2}
        selectTextOnFocus
        className={fieldClass}
      />
    </View>
  );
}

export function IntervalSetInputs({ set, onUpdate }: IntervalSetInputsProps) {
  // Interval sets are always created with these fields; default defensively
  // since the flat WorkoutSet type makes them optional.
  const metric = set.metric ?? 'distance';
  const distanceUnit = set.distanceUnit ?? 'km';

  const handleMetric = (next: IntervalMetric) => {
    if (next === metric) return;
    lightHaptic();
    // Clear the previous metric's value: the flat set shape keeps every
    // field, so a leftover distance/speed/pace from before the switch would
    // otherwise persist and get counted by stats.
    onUpdate({
      metric: next,
      paceSeconds: undefined,
      distance: undefined,
      speed: undefined,
    });
  };

  return (
    <View className="flex-1 gap-2">
      <View className="flex-row items-center gap-1">
        {METRICS.map((m) => {
          const selected = metric === m.value;
          return (
            <Pressable
              key={m.value}
              onPress={() => handleMetric(m.value)}
              className={cn(
                'h-7 rounded-md px-2',
                selected ? 'bg-primary' : 'bg-secondary'
              )}
              accessibilityRole="button"
              accessibilityLabel={`Metric: ${m.label}`}
            >
              <Text
                className={cn(
                  'text-xs font-semibold leading-7',
                  selected ? 'text-primary-foreground' : 'text-foreground'
                )}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center gap-2">
        {metric === 'pace' && (
          <View className="flex-row items-center gap-1">
            <MmSsInput
              value={set.paceSeconds ?? 0}
              onValueChange={(paceSeconds) => onUpdate({ paceSeconds })}
            />
            <Text className="text-xs text-muted-foreground">
              {paceUnitLabel(distanceUnit)}
            </Text>
          </View>
        )}
        {metric === 'distance' && (
          <View className="flex-row items-center gap-1">
            <SetInput
              value={set.distance ?? 0}
              onValueChange={(distance) => onUpdate({ distance })}
              placeholder="0"
              allowDecimals
              accessibilityLabel="Distance"
              className="w-16"
            />
            <Text className="text-xs text-muted-foreground">{distanceUnit}</Text>
          </View>
        )}
        {metric === 'speed' && (
          <View className="flex-row items-center gap-1">
            <SetInput
              value={set.speed ?? 0}
              onValueChange={(speed) => onUpdate({ speed })}
              placeholder="0"
              allowDecimals
              accessibilityLabel="Speed"
              className="w-16"
            />
            <Text className="text-xs text-muted-foreground">
              {speedUnitLabel(distanceUnit)}
            </Text>
          </View>
        )}
        <TimeInput
          value={set.time ?? 0}
          onValueChange={(time) => onUpdate({ time })}
          className="flex-1"
        />
      </View>
    </View>
  );
}

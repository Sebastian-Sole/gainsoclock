import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import type { MetricId } from '@/lib/types';
import { METRIC_LIST, MAX_METRICS_PER_EXERCISE } from '@/lib/metrics';
import { lightHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface MetricPickerProps {
  metrics: MetricId[];
  onChange: (metrics: MetricId[]) => void;
}

/**
 * Composes an exercise's tracked metrics from the curated palette. Selected
 * metrics show their column order (the number badge); the picker caps at
 * MAX_METRICS_PER_EXERCISE to keep the set row readable.
 */
export function MetricPicker({ metrics, onChange }: MetricPickerProps) {
  const atCap = metrics.length >= MAX_METRICS_PER_EXERCISE;

  const toggle = (id: MetricId) => {
    if (metrics.includes(id)) {
      lightHaptic();
      onChange(metrics.filter((m) => m !== id));
    } else if (!atCap) {
      lightHaptic();
      onChange([...metrics, id]);
    }
  };

  return (
    <View className="gap-2">
      {METRIC_LIST.map((spec) => {
        const selected = metrics.includes(spec.id);
        const order = metrics.indexOf(spec.id);
        const disabled = !selected && atCap;

        return (
          <Pressable
            key={spec.id}
            onPress={() => toggle(spec.id)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={spec.label}
            accessibilityState={{ checked: selected, disabled }}
            className={cn(
              'flex-row items-center justify-between rounded-xl border-2 p-3',
              selected ? 'border-primary bg-accent' : 'border-border bg-card',
              disabled && 'opacity-40'
            )}
          >
            <View>
              <Text className={cn('text-base font-medium', selected && 'text-primary')}>
                {spec.label}
              </Text>
              {spec.unit ? (
                <Text className="text-xs text-muted-foreground">{spec.unit}</Text>
              ) : null}
            </View>
            {selected ? (
              <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                <Text className="text-xs font-bold text-primary-foreground">{order + 1}</Text>
              </View>
            ) : (
              <View className="h-6 w-6 rounded-full border border-border" />
            )}
          </Pressable>
        );
      })}
      <Text className="mt-1 text-xs text-muted-foreground">
        Up to {MAX_METRICS_PER_EXERCISE} metrics. The number is the column order.
      </Text>
    </View>
  );
}

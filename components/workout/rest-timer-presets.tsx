import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { REST_TIME_PRESETS } from '@/lib/constants';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface RestTimerPresetsProps {
  selected: number;
  onSelect: (seconds: number) => void;
}

export function RestTimerPresets({ selected, onSelect }: RestTimerPresetsProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {REST_TIME_PRESETS.map((seconds) => (
        <Pressable
          key={seconds}
          onPress={() => onSelect(seconds)}
          className={cn(
            'rounded-lg px-4 py-2',
            selected === seconds
              ? 'bg-primary'
              : 'border border-border bg-card'
          )}
        >
          <Text
            className={cn(
              'text-sm font-medium',
              selected === seconds ? 'text-primary-foreground' : 'text-foreground'
            )}
          >
            {formatTime(seconds)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

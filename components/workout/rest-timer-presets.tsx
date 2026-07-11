import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { TimeInput } from '@/components/shared/time-input';
import { REST_TIME_PRESETS } from '@/lib/constants';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';

const PRESETS: readonly number[] = REST_TIME_PRESETS;

interface RestTimerPresetsProps {
  selected: number;
  onSelect: (seconds: number) => void;
}

interface PresetChipProps {
  label: string;
  accessibilityLabel: string;
  isSelected: boolean;
  onPress: () => void;
}

function PresetChip({ label, accessibilityLabel, isSelected, onPress }: PresetChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected }}
      className={cn(
        'rounded-lg px-4 py-2',
        isSelected ? 'bg-primary' : 'border border-border bg-card'
      )}
    >
      <Text
        className={cn(
          'text-sm font-medium',
          isSelected ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RestTimerPresets({ selected, onSelect }: RestTimerPresetsProps) {
  const lastCustomRestTime = useSettingsStore((s) => s.lastCustomRestTime);
  const setLastCustomRestTime = useSettingsStore((s) => s.setLastCustomRestTime);

  const selectedIsPreset = PRESETS.includes(selected);
  // Open the custom input right away when the incoming value is already custom,
  // so a non-preset value is visible (and editable) instead of looking unselected.
  const [customOpen, setCustomOpen] = useState(!selectedIsPreset);

  const customLabelValue = selectedIsPreset ? lastCustomRestTime : selected;
  const customLabel =
    customLabelValue !== null && !PRESETS.includes(customLabelValue)
      ? `Custom · ${formatTime(customLabelValue)}`
      : 'Custom';

  const handleCustomChange = (seconds: number) => {
    onSelect(seconds);
    // Remember only genuinely custom values so the chip stays a useful shortcut.
    if (seconds > 0 && !PRESETS.includes(seconds)) {
      setLastCustomRestTime(seconds);
    }
  };

  const handleCustomPress = () => {
    if (customOpen) {
      setCustomOpen(false);
      return;
    }
    setCustomOpen(true);
    // Re-offer the last custom value as a one-tap pick when coming from a preset.
    if (selectedIsPreset && lastCustomRestTime !== null && lastCustomRestTime > 0) {
      onSelect(lastCustomRestTime);
    }
  };

  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {PRESETS.map((seconds) => (
          <PresetChip
            key={seconds}
            label={formatTime(seconds)}
            accessibilityLabel={`Rest time ${formatTime(seconds)}`}
            isSelected={selected === seconds}
            onPress={() => onSelect(seconds)}
          />
        ))}
        <PresetChip
          label={customLabel}
          accessibilityLabel="Custom rest time"
          isSelected={!selectedIsPreset}
          onPress={handleCustomPress}
        />
      </View>
      {customOpen && (
        <View className="mt-3">
          <Text className="mb-1.5 text-sm text-muted-foreground">
            Custom rest time (h:mm:ss)
          </Text>
          <TimeInput
            value={selected}
            onValueChange={handleCustomChange}
            accessibilityLabel="Custom rest time"
            className="max-w-[180px]"
          />
        </View>
      )}
    </View>
  );
}

import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface TimeInputProps {
  value: number; // in seconds
  onValueChange: (seconds: number) => void;
  className?: string;
  /** Base label for screen readers; each field appends "hours"/"minutes"/"seconds". */
  accessibilityLabel?: string;
}

export function TimeInput({ value, onValueChange, className, accessibilityLabel }: TimeInputProps) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  // Track raw text + focus per field so users can clear "00" and type a new value.
  // Without this, padStart on the rendered value would re-pad the cleared input every keystroke.
  const [hoursText, setHoursText] = useState<string | null>(null);
  const [minutesText, setMinutesText] = useState<string | null>(null);
  const [secondsText, setSecondsText] = useState<string | null>(null);

  const handleHoursChange = (text: string) => {
    setHoursText(text);
    const hrs = parseInt(text, 10);
    onValueChange((Number.isFinite(hrs) ? hrs : 0) * 3600 + minutes * 60 + seconds);
  };

  const handleMinutesChange = (text: string) => {
    setMinutesText(text);
    const parsed = parseInt(text, 10);
    const mins = Math.min(59, Number.isFinite(parsed) ? parsed : 0);
    onValueChange(hours * 3600 + mins * 60 + seconds);
  };

  const handleSecondsChange = (text: string) => {
    setSecondsText(text);
    const parsed = parseInt(text, 10);
    const secs = Math.min(59, Number.isFinite(parsed) ? parsed : 0);
    onValueChange(hours * 3600 + minutes * 60 + secs);
  };

  const fieldClass =
    'flex-1 h-9 min-w-[28px] rounded-md border border-input bg-background px-1 text-center text-foreground';
  const labelBase = accessibilityLabel ?? 'Time';

  return (
    <View className={cn('flex-row items-center gap-0.5', className)}>
      <TextInput
        value={hoursText ?? String(hours)}
        onChangeText={handleHoursChange}
        onFocus={() => setHoursText(String(hours))}
        onBlur={() => setHoursText(null)}
        accessibilityLabel={`${labelBase}, hours`}
        keyboardType="numeric"
        className={fieldClass}
        maxLength={2}
        placeholder="0"
        placeholderTextColor="#9ca3af"
        selectTextOnFocus
      />
      <Text className="text-xs text-muted-foreground">:</Text>
      <TextInput
        value={minutesText ?? String(minutes).padStart(2, '0')}
        onChangeText={handleMinutesChange}
        onFocus={() => setMinutesText(String(minutes))}
        onBlur={() => setMinutesText(null)}
        accessibilityLabel={`${labelBase}, minutes`}
        keyboardType="numeric"
        className={fieldClass}
        maxLength={2}
        selectTextOnFocus
      />
      <Text className="text-xs text-muted-foreground">:</Text>
      <TextInput
        value={secondsText ?? String(seconds).padStart(2, '0')}
        onChangeText={handleSecondsChange}
        onFocus={() => setSecondsText(String(seconds))}
        onBlur={() => setSecondsText(null)}
        accessibilityLabel={`${labelBase}, seconds`}
        keyboardType="numeric"
        className={fieldClass}
        maxLength={2}
        selectTextOnFocus
      />
    </View>
  );
}

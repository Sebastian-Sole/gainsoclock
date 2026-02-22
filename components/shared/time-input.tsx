import React from 'react';
import { View, TextInput } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface TimeInputProps {
  value: number; // in seconds
  onValueChange: (seconds: number) => void;
  className?: string;
}

export function TimeInput({ value, onValueChange, className }: TimeInputProps) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  const handleHoursChange = (text: string) => {
    const hrs = parseInt(text, 10) || 0;
    onValueChange(hrs * 3600 + minutes * 60 + seconds);
  };

  const handleMinutesChange = (text: string) => {
    const mins = Math.min(59, parseInt(text, 10) || 0);
    onValueChange(hours * 3600 + mins * 60 + seconds);
  };

  const handleSecondsChange = (text: string) => {
    const secs = Math.min(59, parseInt(text, 10) || 0);
    onValueChange(hours * 3600 + minutes * 60 + secs);
  };

  const fieldClass =
    'flex-1 h-9 min-w-[28px] rounded-md border border-input bg-background px-1 text-center text-foreground';

  return (
    <View className={cn('flex-row items-center gap-0.5', className)}>
      <TextInput
        value={String(hours)}
        onChangeText={handleHoursChange}
        keyboardType="numeric"
        className={fieldClass}
        maxLength={2}
        placeholder="0"
        placeholderTextColor="#9ca3af"
      />
      <Text className="text-xs text-muted-foreground">:</Text>
      <TextInput
        value={String(minutes).padStart(2, '0')}
        onChangeText={handleMinutesChange}
        keyboardType="numeric"
        className={fieldClass}
        maxLength={2}
      />
      <Text className="text-xs text-muted-foreground">:</Text>
      <TextInput
        value={String(seconds).padStart(2, '0')}
        onChangeText={handleSecondsChange}
        keyboardType="numeric"
        className={fieldClass}
        maxLength={2}
      />
    </View>
  );
}

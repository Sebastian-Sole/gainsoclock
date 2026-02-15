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
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  const handleMinutesChange = (text: string) => {
    const mins = parseInt(text, 10) || 0;
    onValueChange(mins * 60 + seconds);
  };

  const handleSecondsChange = (text: string) => {
    const secs = Math.min(59, parseInt(text, 10) || 0);
    onValueChange(minutes * 60 + secs);
  };

  return (
    <View className={cn('flex-row items-center gap-1', className)}>
      <TextInput
        value={String(minutes)}
        onChangeText={handleMinutesChange}
        keyboardType="numeric"
        className="min-w-[36px] rounded-md border border-input bg-background px-2 py-1 text-center text-foreground"
        maxLength={3}
      />
      <Text className="text-muted-foreground">:</Text>
      <TextInput
        value={String(seconds).padStart(2, '0')}
        onChangeText={handleSecondsChange}
        keyboardType="numeric"
        className="min-w-[36px] rounded-md border border-input bg-background px-2 py-1 text-center text-foreground"
        maxLength={2}
      />
    </View>
  );
}

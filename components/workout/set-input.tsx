import React from 'react';
import { TextInput } from 'react-native';
import { cn } from '@/lib/utils';

interface SetInputProps {
  value: number;
  onValueChange: (value: number) => void;
  placeholder?: string;
  className?: string;
}

export function SetInput({ value, onValueChange, placeholder, className }: SetInputProps) {
  return (
    <TextInput
      value={value === 0 ? '' : String(value)}
      onChangeText={(text) => {
        const num = parseFloat(text);
        onValueChange(isNaN(num) ? 0 : num);
      }}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      keyboardType="numeric"
      className={cn(
        'h-9 min-w-[56px] rounded-md border border-input bg-background px-2 text-center text-foreground',
        className
      )}
    />
  );
}

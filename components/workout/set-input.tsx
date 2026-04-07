import React, { useState, useEffect } from 'react';
import { TextInput } from 'react-native';
import { cn } from '@/lib/utils';

interface SetInputProps {
  value: number;
  onValueChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  allowDecimals?: boolean;
}

export function SetInput({ value, onValueChange, placeholder, className, allowDecimals = false }: SetInputProps) {
  const [text, setText] = useState(value === 0 ? '' : String(value));

  // Sync external value changes (e.g. bulk edit) into local text
  useEffect(() => {
    const display = value === 0 ? '' : String(value);
    // Only sync if the numeric value actually changed (avoids clobbering "82." while typing)
    if (parseFloat(text) !== value && !(text.endsWith('.') && parseFloat(text) === value)) {
      setText(display);
    }
  }, [value]);

  const handleChange = (input: string) => {
    if (allowDecimals) {
      // Allow digits, one decimal point, and empty string
      if (input !== '' && !/^\d*\.?\d*$/.test(input)) return;
    } else {
      // Integer only
      if (input !== '' && !/^\d*$/.test(input)) return;
    }
    setText(input);
    const num = parseFloat(input);
    onValueChange(isNaN(num) ? 0 : num);
  };

  return (
    <TextInput
      value={text}
      onChangeText={handleChange}
      onBlur={() => {
        // Clean up display on blur (e.g. "82." -> "82")
        setText(value === 0 ? '' : String(value));
      }}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
      className={cn(
        'h-9 min-w-[56px] rounded-md border border-input bg-background px-2 text-center text-foreground',
        className
      )}
    />
  );
}
